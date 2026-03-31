import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../../lib/auth";

initializeDb();

const VALID_PREFERENCES = ["preferred", "unavailable", "neutral"];
const MAX_UNAVAILABLE = 8;
const MIN_PREFERRED = 8;
const START_TIMES = new Set([
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
]);

function buildRecurringKey(dayOfWeek, startTime) {
    return `${dayOfWeek}|${startTime}`;
}

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const teamId = url.searchParams.get("teamId");

    if (!seasonId || !teamId) {
        return NextResponse.json(
            { error: "Szezon és csapat ID szükséges" },
            { status: 400 },
        );
    }

    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT 
                id,
                season_id as seasonId,
                team_id as teamId,
                time_slot_id as timeSlotId,
                preference
             FROM team_availability_preferences
             WHERE season_id = ? AND team_id = ?
             ORDER BY time_slot_id`,
            [seasonId, teamId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferenciák lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ preferences: rows || [] }));
            },
        );
    });
}

export async function POST(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { seasonId, teamId, timeSlotId, preference } = body;

    if (!seasonId || !teamId || !timeSlotId || !preference) {
        return NextResponse.json(
            { error: "Hiányzó kötelező mezők" },
            { status: 400 },
        );
    }

    if (!VALID_PREFERENCES.includes(preference)) {
        return NextResponse.json(
            { error: "Érvénytelen preferencia típus" },
            { status: 400 },
        );
    }

    // Verify user is captain of this team (or admin)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();

        // Use INSERT OR REPLACE pattern for upsert
        db.run(
            `INSERT INTO team_availability_preferences 
             (season_id, team_id, time_slot_id, preference)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(season_id, team_id, time_slot_id) DO UPDATE SET preference = ?`,
            [seasonId, teamId, timeSlotId, preference, preference],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferencia mentésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ success: true }, { status: 201 }));
            },
        );
    });
}

export async function PUT(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { seasonId, teamId, preferences, recurringPreferences } = body;

    const hasLegacyPreferences = Array.isArray(preferences);
    const hasRecurringPreferences = Array.isArray(recurringPreferences);

    if (
        !seasonId ||
        !teamId ||
        (!hasLegacyPreferences && !hasRecurringPreferences)
    ) {
        return NextResponse.json(
            {
                error: "Szezon ID, csapat ID és preferencia lista szükséges",
            },
            { status: 400 },
        );
    }

    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();
        let resolved = false;

        const finalize = (response) => {
            if (resolved) return;
            resolved = true;
            db.close();
            resolve(response);
        };

        const rollbackAndFinalize = (response) => {
            if (resolved) return;
            resolved = true;
            db.run("ROLLBACK", () => {
                db.close();
                resolve(response);
            });
        };

        db.get(
            `SELECT id, status FROM seasons WHERE id = ?`,
            [seasonId],
            (seasonErr, season) => {
                if (seasonErr) {
                    finalize(
                        NextResponse.json(
                            { error: "Hiba a szezon ellenőrzésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (!season) {
                    finalize(
                        NextResponse.json(
                            { error: "Szezon nem található" },
                            { status: 404 },
                        ),
                    );
                    return;
                }

                if (season.status !== "team-preferences") {
                    finalize(
                        NextResponse.json(
                            {
                                error: "Ebben a szezon állapotban nem módosíthatók a preferenciák",
                            },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                db.all(
                    `SELECT id, day_of_week as dayOfWeek, start_time as startTime, slot_date as slotDate
                     FROM time_slots
                     WHERE season_id = ? AND slot_date IS NOT NULL`,
                    [seasonId],
                    (slotErr, slotRows) => {
                        if (slotErr) {
                            finalize(
                                NextResponse.json(
                                    {
                                        error: "Hiba az elérhető időpontok lekérdezésekor",
                                    },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        const availableSlotIds = new Set();
                        const recurringSlotMap = new Map();

                        (slotRows || []).forEach((row) => {
                            const slotId = Number(row.id);
                            const dayOfWeek = Number(row.dayOfWeek);
                            const startTime = row.startTime;

                            if (!Number.isInteger(slotId)) {
                                return;
                            }

                            availableSlotIds.add(slotId);

                            if (
                                dayOfWeek >= 0 &&
                                dayOfWeek <= 4 &&
                                START_TIMES.has(startTime)
                            ) {
                                const recurringKey = buildRecurringKey(
                                    dayOfWeek,
                                    startTime,
                                );
                                if (!recurringSlotMap.has(recurringKey)) {
                                    recurringSlotMap.set(recurringKey, []);
                                }
                                recurringSlotMap.get(recurringKey).push(slotId);
                            }
                        });

                        if (availableSlotIds.size === 0) {
                            finalize(
                                NextResponse.json(
                                    {
                                        error: "A szezonhoz nincs elérhető, dátumhoz kötött időpont",
                                    },
                                    { status: 400 },
                                ),
                            );
                            return;
                        }

                        const normalizedByRecurringKey = new Map();

                        if (hasRecurringPreferences) {
                            for (const entry of recurringPreferences) {
                                const dayOfWeek = Number(entry?.dayOfWeek);
                                const startTime = entry?.startTime;
                                const pref = entry?.preference;

                                if (
                                    !Number.isInteger(dayOfWeek) ||
                                    !startTime ||
                                    !pref
                                ) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: "Minden ismétlődő preferencia elemhez dayOfWeek, startTime és preference szükséges",
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                if (dayOfWeek < 0 || dayOfWeek > 4) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: "Csak hétfő-péntek (0-4) napok adhatók meg",
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                if (!START_TIMES.has(startTime)) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: `Érvénytelen kezdési időpont: ${startTime}`,
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                if (!VALID_PREFERENCES.includes(pref)) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: `Érvénytelen preferencia típus: ${pref}`,
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                const recurringKey = buildRecurringKey(
                                    dayOfWeek,
                                    startTime,
                                );

                                if (!recurringSlotMap.has(recurringKey)) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: `A szezonban nincs ilyen heti időpont: ${startTime} (nap: ${dayOfWeek})`,
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                normalizedByRecurringKey.set(
                                    recurringKey,
                                    pref,
                                );
                            }
                        } else {
                            for (const entry of preferences) {
                                const slotId = Number(entry?.timeSlotId);
                                const pref = entry?.preference;

                                if (!Number.isInteger(slotId) || !pref) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: "Minden preferencia elemhez timeSlotId és preference szükséges",
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                if (!availableSlotIds.has(slotId)) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: `Érvénytelen időpont azonosító: ${slotId}`,
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                if (!VALID_PREFERENCES.includes(pref)) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: `Érvénytelen preferencia típus: ${pref}`,
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                    return;
                                }

                                const slotRow = (slotRows || []).find(
                                    (row) => Number(row.id) === slotId,
                                );
                                if (!slotRow) {
                                    continue;
                                }

                                const recurringKey = buildRecurringKey(
                                    Number(slotRow.dayOfWeek),
                                    slotRow.startTime,
                                );
                                normalizedByRecurringKey.set(
                                    recurringKey,
                                    pref,
                                );
                            }
                        }

                        const preferredCount = Array.from(
                            normalizedByRecurringKey.values(),
                        ).filter((pref) => pref === "preferred").length;
                        const unavailableCount = Array.from(
                            normalizedByRecurringKey.values(),
                        ).filter((pref) => pref === "unavailable").length;
                        const requiredPreferred = Math.min(
                            MIN_PREFERRED,
                            recurringSlotMap.size,
                        );

                        if (preferredCount < requiredPreferred) {
                            finalize(
                                NextResponse.json(
                                    {
                                        error: `Legalább ${requiredPreferred} kedvelt időpont megadása kötelező`,
                                        requiredPreferred,
                                        preferredCount,
                                    },
                                    { status: 400 },
                                ),
                            );
                            return;
                        }

                        if (unavailableCount > MAX_UNAVAILABLE) {
                            finalize(
                                NextResponse.json(
                                    {
                                        error: `Legfeljebb ${MAX_UNAVAILABLE} kerülendő időpont adható meg`,
                                        maxUnavailable: MAX_UNAVAILABLE,
                                        unavailableCount,
                                    },
                                    { status: 400 },
                                ),
                            );
                            return;
                        }

                        const rowsToInsert = [];
                        normalizedByRecurringKey.forEach(
                            (pref, recurringKey) => {
                                if (pref === "neutral") {
                                    return;
                                }

                                const slotIds =
                                    recurringSlotMap.get(recurringKey) || [];
                                slotIds.forEach((slotId) => {
                                    rowsToInsert.push({ slotId, pref });
                                });
                            },
                        );

                        db.serialize(() => {
                            db.run("BEGIN TRANSACTION", (beginErr) => {
                                if (beginErr) {
                                    finalize(
                                        NextResponse.json(
                                            {
                                                error: "Hiba a mentési tranzakció indításakor",
                                            },
                                            { status: 500 },
                                        ),
                                    );
                                    return;
                                }

                                db.run(
                                    `DELETE FROM team_availability_preferences
                                     WHERE season_id = ? AND team_id = ?`,
                                    [seasonId, teamId],
                                    (deleteErr) => {
                                        if (deleteErr) {
                                            rollbackAndFinalize(
                                                NextResponse.json(
                                                    {
                                                        error: "Hiba a korábbi preferenciák törlésekor",
                                                    },
                                                    { status: 500 },
                                                ),
                                            );
                                            return;
                                        }

                                        const insertAt = (index) => {
                                            if (index >= rowsToInsert.length) {
                                                db.run(
                                                    "COMMIT",
                                                    (commitErr) => {
                                                        if (commitErr) {
                                                            rollbackAndFinalize(
                                                                NextResponse.json(
                                                                    {
                                                                        error: "Hiba a preferenciák mentésekor",
                                                                    },
                                                                    {
                                                                        status: 500,
                                                                    },
                                                                ),
                                                            );
                                                            return;
                                                        }

                                                        finalize(
                                                            NextResponse.json(
                                                                {
                                                                    success: true,
                                                                    preferredCount,
                                                                    unavailableCount,
                                                                    requiredPreferred,
                                                                },
                                                                { status: 200 },
                                                            ),
                                                        );
                                                    },
                                                );
                                                return;
                                            }

                                            const row = rowsToInsert[index];
                                            db.run(
                                                `INSERT INTO team_availability_preferences
                                                 (season_id, team_id, time_slot_id, preference)
                                                 VALUES (?, ?, ?, ?)`,
                                                [
                                                    seasonId,
                                                    teamId,
                                                    row.slotId,
                                                    row.pref,
                                                ],
                                                (insertErr) => {
                                                    if (insertErr) {
                                                        rollbackAndFinalize(
                                                            NextResponse.json(
                                                                {
                                                                    error: "Hiba a preferenciák mentésekor",
                                                                },
                                                                { status: 500 },
                                                            ),
                                                        );
                                                        return;
                                                    }

                                                    insertAt(index + 1);
                                                },
                                            );
                                        };

                                        insertAt(0);
                                    },
                                );
                            });
                        });
                    },
                );
            },
        );
    });
}

export async function DELETE(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { seasonId, teamId, timeSlotId } = body;

    if (!seasonId || !teamId || !timeSlotId) {
        return NextResponse.json(
            { error: "Hiányzó kötelező mezők" },
            { status: 400 },
        );
    }

    // Verify user is captain of this team (or admin)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `DELETE FROM team_availability_preferences 
             WHERE season_id = ? AND team_id = ? AND time_slot_id = ?`,
            [seasonId, teamId, timeSlotId],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferencia törlésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ success: true }, { status: 200 }));
            },
        );
    });
}
