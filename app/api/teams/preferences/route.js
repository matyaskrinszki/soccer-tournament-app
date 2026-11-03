import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../../lib/auth";
import {
    MIN_PREFERRED,
    MAX_UNAVAILABLE,
    START_TIMES,
    buildRecurringKey,
} from "../../../../lib/preference-rules";

const VALID_PREFERENCES = ["preferred", "unavailable", "neutral"];

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const teamId = url.searchParams.get("teamId");

    if (!seasonId || !teamId) {
        return jsonError(400, "Szezon és csapat ID szükséges");
    }

    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return jsonError(403, "Nincs jogosultságod");
        }
    }

    try {
        const preferences = getDatabase()
            .prepare(
                `SELECT
                    id,
                    season_id as seasonId,
                    team_id as teamId,
                    time_slot_id as timeSlotId,
                    preference
                 FROM team_availability_preferences
                 WHERE season_id = ? AND team_id = ?
                 ORDER BY time_slot_id`,
            )
            .all(seasonId, teamId);

        return NextResponse.json({ preferences });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba a preferenciák lekérdezésekor");
    }
}

export async function POST(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { seasonId, teamId, timeSlotId, preference } = body;

        if (!seasonId || !teamId || !timeSlotId || !preference) {
            return jsonError(400, "Hiányzó kötelező mezők");
        }

        if (!VALID_PREFERENCES.includes(preference)) {
            return jsonError(400, "Érvénytelen preferencia típus");
        }

        // Verify user is captain of this team (or admin)
        if (user.role !== "Admin") {
            const isCaptain = await isCaptainOfTeam(user, Number(teamId));
            if (!isCaptain) {
                return jsonError(403, "Nincs jogosultságod");
            }
        }

        try {
            // Upsert on the (season, team, slot) unique key
            getDatabase()
                .prepare(
                    `INSERT INTO team_availability_preferences
                     (season_id, team_id, time_slot_id, preference)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(season_id, team_id, time_slot_id) DO UPDATE SET preference = excluded.preference`,
                )
                .run(seasonId, teamId, timeSlotId, preference);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a preferencia mentésekor");
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (err) {
        return serverError(err);
    }
}

export async function PUT(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { seasonId, teamId, preferences, recurringPreferences } = body;

        const hasLegacyPreferences = Array.isArray(preferences);
        const hasRecurringPreferences = Array.isArray(recurringPreferences);

        if (
            !seasonId ||
            !teamId ||
            (!hasLegacyPreferences && !hasRecurringPreferences)
        ) {
            return jsonError(
                400,
                "Szezon ID, csapat ID és preferencia lista szükséges",
            );
        }

        if (user.role !== "Admin") {
            const isCaptain = await isCaptainOfTeam(user, Number(teamId));
            if (!isCaptain) {
                return jsonError(403, "Nincs jogosultságod");
            }
        }

        const db = getDatabase();

        let season;
        try {
            season = db
                .prepare(`SELECT id, status FROM seasons WHERE id = ?`)
                .get(seasonId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a szezon ellenőrzésekor");
        }

        if (!season) {
            return jsonError(404, "Szezon nem található");
        }

        if (season.status !== "team-preferences") {
            return jsonError(
                400,
                "Ebben a szezon állapotban nem módosíthatók a preferenciák",
            );
        }

        let slotRows;
        try {
            slotRows = db
                .prepare(
                    `SELECT id, day_of_week as dayOfWeek, start_time as startTime, slot_date as slotDate
                     FROM time_slots
                     WHERE season_id = ? AND slot_date IS NOT NULL`,
                )
                .all(seasonId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba az elérhető időpontok lekérdezésekor");
        }

        const availableSlotIds = new Set();
        const recurringSlotMap = new Map();

        slotRows.forEach((row) => {
            const slotId = Number(row.id);
            const dayOfWeek = Number(row.dayOfWeek);
            const startTime = row.startTime;

            if (!Number.isInteger(slotId)) {
                return;
            }

            availableSlotIds.add(slotId);

            if (dayOfWeek >= 0 && dayOfWeek <= 4 && START_TIMES.has(startTime)) {
                const recurringKey = buildRecurringKey(dayOfWeek, startTime);
                if (!recurringSlotMap.has(recurringKey)) {
                    recurringSlotMap.set(recurringKey, []);
                }
                recurringSlotMap.get(recurringKey).push(slotId);
            }
        });

        if (availableSlotIds.size === 0) {
            return jsonError(
                400,
                "A szezonhoz nincs elérhető, dátumhoz kötött időpont",
            );
        }

        const normalizedByRecurringKey = new Map();

        if (hasRecurringPreferences) {
            for (const entry of recurringPreferences) {
                const dayOfWeek = Number(entry?.dayOfWeek);
                const startTime = entry?.startTime;
                const pref = entry?.preference;

                if (!Number.isInteger(dayOfWeek) || !startTime || !pref) {
                    return jsonError(
                        400,
                        "Minden ismétlődő preferencia elemhez dayOfWeek, startTime és preference szükséges",
                    );
                }

                if (dayOfWeek < 0 || dayOfWeek > 4) {
                    return jsonError(
                        400,
                        "Csak hétfő-péntek (0-4) napok adhatók meg",
                    );
                }

                if (!START_TIMES.has(startTime)) {
                    return jsonError(
                        400,
                        `Érvénytelen kezdési időpont: ${startTime}`,
                    );
                }

                if (!VALID_PREFERENCES.includes(pref)) {
                    return jsonError(400, `Érvénytelen preferencia típus: ${pref}`);
                }

                const recurringKey = buildRecurringKey(dayOfWeek, startTime);

                if (!recurringSlotMap.has(recurringKey)) {
                    return jsonError(
                        400,
                        `A szezonban nincs ilyen heti időpont: ${startTime} (nap: ${dayOfWeek})`,
                    );
                }

                normalizedByRecurringKey.set(recurringKey, pref);
            }
        } else {
            for (const entry of preferences) {
                const slotId = Number(entry?.timeSlotId);
                const pref = entry?.preference;

                if (!Number.isInteger(slotId) || !pref) {
                    return jsonError(
                        400,
                        "Minden preferencia elemhez timeSlotId és preference szükséges",
                    );
                }

                if (!availableSlotIds.has(slotId)) {
                    return jsonError(400, `Érvénytelen időpont azonosító: ${slotId}`);
                }

                if (!VALID_PREFERENCES.includes(pref)) {
                    return jsonError(400, `Érvénytelen preferencia típus: ${pref}`);
                }

                const slotRow = slotRows.find((row) => Number(row.id) === slotId);
                if (!slotRow) {
                    continue;
                }

                const recurringKey = buildRecurringKey(
                    Number(slotRow.dayOfWeek),
                    slotRow.startTime,
                );
                normalizedByRecurringKey.set(recurringKey, pref);
            }
        }

        const preferredCount = Array.from(
            normalizedByRecurringKey.values(),
        ).filter((pref) => pref === "preferred").length;
        const unavailableCount = Array.from(
            normalizedByRecurringKey.values(),
        ).filter((pref) => pref === "unavailable").length;
        const requiredPreferred = Math.min(MIN_PREFERRED, recurringSlotMap.size);

        if (preferredCount < requiredPreferred) {
            return NextResponse.json(
                {
                    error: `Legalább ${requiredPreferred} kedvelt időpont megadása kötelező`,
                    requiredPreferred,
                    preferredCount,
                },
                { status: 400 },
            );
        }

        if (unavailableCount > MAX_UNAVAILABLE) {
            return NextResponse.json(
                {
                    error: `Legfeljebb ${MAX_UNAVAILABLE} kerülendő időpont adható meg`,
                    maxUnavailable: MAX_UNAVAILABLE,
                    unavailableCount,
                },
                { status: 400 },
            );
        }

        const rowsToInsert = [];
        normalizedByRecurringKey.forEach((pref, recurringKey) => {
            if (pref === "neutral") {
                return;
            }

            const slotIds = recurringSlotMap.get(recurringKey) || [];
            slotIds.forEach((slotId) => {
                rowsToInsert.push({ slotId, pref });
            });
        });

        // Replace the team's preferences for this season in one transaction
        let failMessage = "Hiba a mentési tranzakció indításakor";
        try {
            const insertPreference = db.prepare(
                `INSERT INTO team_availability_preferences
                 (season_id, team_id, time_slot_id, preference)
                 VALUES (?, ?, ?, ?)`,
            );
            db.transaction(() => {
                failMessage = "Hiba a korábbi preferenciák törlésekor";
                db.prepare(
                    `DELETE FROM team_availability_preferences
                     WHERE season_id = ? AND team_id = ?`,
                ).run(seasonId, teamId);

                failMessage = "Hiba a preferenciák mentésekor";
                for (const row of rowsToInsert) {
                    insertPreference.run(seasonId, teamId, row.slotId, row.pref);
                }
            })();
        } catch (err) {
            console.error(err);
            return jsonError(500, failMessage);
        }

        return NextResponse.json(
            {
                success: true,
                preferredCount,
                unavailableCount,
                requiredPreferred,
            },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}

export async function DELETE(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { seasonId, teamId, timeSlotId } = body;

        if (!seasonId || !teamId || !timeSlotId) {
            return jsonError(400, "Hiányzó kötelező mezők");
        }

        // Verify user is captain of this team (or admin)
        if (user.role !== "Admin") {
            const isCaptain = await isCaptainOfTeam(user, Number(teamId));
            if (!isCaptain) {
                return jsonError(403, "Nincs jogosultságod");
            }
        }

        try {
            getDatabase()
                .prepare(
                    `DELETE FROM team_availability_preferences
                     WHERE season_id = ? AND team_id = ? AND time_slot_id = ?`,
                )
                .run(seasonId, teamId, timeSlotId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a preferencia törlésekor");
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
