import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin, requireCaptainOrAdmin } from "../../../../lib/auth";

initializeDb();

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const pitchId = url.searchParams.get("pitchId");

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        let query = `SELECT 
                        ts.id, 
                        ts.season_id as seasonId, 
                        ts.pitch_id as pitchId,
                        ts.slot_date as slotDate,
                        ts.day_of_week as dayOfWeek,
                        ts.start_time as startTime,
                        ts.end_time as endTime,
                        p.name as pitchName
                     FROM time_slots ts
                     LEFT JOIN pitches p ON p.id = ts.pitch_id
                     WHERE ts.season_id = ?`;
        let params = [seasonId];

        if (pitchId) {
            query += " AND ts.pitch_id = ?";
            params.push(pitchId);
        }

        query +=
            " ORDER BY ts.slot_date IS NULL, ts.slot_date, ts.day_of_week, ts.start_time";

        db.all(query, params, (err, rows) => {
            if (err) {
                db.close();
                resolve(
                    NextResponse.json(
                        { error: "Hiba az időpontok lekérdezésekor" },
                        { status: 500 },
                    ),
                );
                return;
            }

            db.close();
            resolve(NextResponse.json({ timeSlots: rows || [] }));
        });
    });
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    return NextResponse.json(
        {
            error: "A kézi időpont létrehozás megszűnt. Használd az automatikus generálást a szezon dátumtartományára.",
        },
        { status: 410 },
    );
}

export async function DELETE(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { timeSlotId, seasonId } = body;

    if (!timeSlotId && !seasonId) {
        return NextResponse.json(
            { error: "Időpont ID vagy szezon ID szükséges" },
            { status: 400 },
        );
    }

    // Single time slot delete
    if (timeSlotId) {
        return new Promise((resolve) => {
            const db = getDb();

            db.run(
                `DELETE FROM time_slots WHERE id = ?`,
                [timeSlotId],
                function (err) {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Hiba az időpont törlésekor" },
                                { status: 500 },
                            ),
                        );
                        return;
                    }

                    if (this.changes === 0) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Időpont nem található" },
                                { status: 404 },
                            ),
                        );
                        return;
                    }

                    db.close();
                    resolve(
                        NextResponse.json({ success: true }, { status: 200 }),
                    );
                },
            );
        });
    }

    // Season-wide cleanup of dates/time slots and dependent generated data
    return new Promise((resolve) => {
        const db = getDb();

        db.get(
            `SELECT COUNT(*) as count
             FROM time_slots
             WHERE season_id = ?`,
            [seasonId],
            (countErr, countRow) => {
                if (countErr) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            {
                                error: "Hiba a szezonhoz tartozó időpontok lekérdezésekor",
                            },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                const totalTimeSlots = countRow?.count || 0;
                let resolved = false;
                let deletedPreferences = 0;
                let deletedScheduledMatches = 0;
                let deletedScheduleRuns = 0;
                let deletedTimeSlots = 0;

                const failWithRollback = (errorMessage) => {
                    if (resolved) return;
                    resolved = true;
                    db.run("ROLLBACK", () => {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: errorMessage },
                                { status: 500 },
                            ),
                        );
                    });
                };

                db.serialize(() => {
                    db.run("BEGIN TRANSACTION", (beginErr) => {
                        if (beginErr) {
                            if (resolved) return;
                            resolved = true;
                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "Hiba a törlési tranzakció indításakor",
                                    },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        db.run(
                            `DELETE FROM team_availability_preferences
                             WHERE season_id = ?`,
                            [seasonId],
                            function (prefErr) {
                                if (prefErr) {
                                    failWithRollback(
                                        "Hiba a preferenciák törlésekor",
                                    );
                                    return;
                                }
                                deletedPreferences = this.changes || 0;

                                db.run(
                                    `DELETE FROM scheduled_matches
                                     WHERE schedule_run_id IN (
                                         SELECT id FROM schedule_runs
                                         WHERE season_id = ?
                                     )`,
                                    [seasonId],
                                    function (scheduledMatchesErr) {
                                        if (scheduledMatchesErr) {
                                            failWithRollback(
                                                "Hiba az ütemezett mérkőzések törlésekor",
                                            );
                                            return;
                                        }
                                        deletedScheduledMatches =
                                            this.changes || 0;

                                        db.run(
                                            `DELETE FROM schedule_runs
                                             WHERE season_id = ?`,
                                            [seasonId],
                                            function (scheduleRunsErr) {
                                                if (scheduleRunsErr) {
                                                    failWithRollback(
                                                        "Hiba az ütemezési futtatások törlésekor",
                                                    );
                                                    return;
                                                }
                                                deletedScheduleRuns =
                                                    this.changes || 0;

                                                db.run(
                                                    `DELETE FROM time_slots
                                                     WHERE season_id = ?`,
                                                    [seasonId],
                                                    function (timeSlotErr) {
                                                        if (timeSlotErr) {
                                                            failWithRollback(
                                                                "Hiba a szezon időpontjainak törlésekor",
                                                            );
                                                            return;
                                                        }
                                                        deletedTimeSlots =
                                                            this.changes || 0;

                                                        db.run(
                                                            "COMMIT",
                                                            (commitErr) => {
                                                                if (commitErr) {
                                                                    failWithRollback(
                                                                        "Hiba a törlési tranzakció lezárásakor",
                                                                    );
                                                                    return;
                                                                }

                                                                if (resolved)
                                                                    return;
                                                                resolved = true;
                                                                db.close();
                                                                resolve(
                                                                    NextResponse.json(
                                                                        {
                                                                            success: true,
                                                                            deletedTimeSlots,
                                                                            deletedPreferences,
                                                                            deletedScheduledMatches,
                                                                            deletedScheduleRuns,
                                                                            totalTimeSlots,
                                                                        },
                                                                        {
                                                                            status: 200,
                                                                        },
                                                                    ),
                                                                );
                                                            },
                                                        );
                                                    },
                                                );
                                            },
                                        );
                                    },
                                );
                            },
                        );
                    });
                });
            },
        );
    });
}
