import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError, isForeignKeyError } from "../../../../lib/api";
import { requireAdmin, requireCaptainOrAdmin } from "../../../../lib/auth";

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const pitchId = url.searchParams.get("pitchId");

    if (!seasonId) {
        return jsonError(400, "Szezon ID szükséges");
    }

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
    const params = [seasonId];

    if (pitchId) {
        query += " AND ts.pitch_id = ?";
        params.push(pitchId);
    }

    query +=
        " ORDER BY ts.slot_date IS NULL, ts.slot_date, ts.day_of_week, ts.start_time";

    try {
        const timeSlots = getDatabase().prepare(query).all(params);
        return NextResponse.json({ timeSlots });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba az időpontok lekérdezésekor");
    }
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    return jsonError(
        410,
        "A kézi időpont létrehozás megszűnt. Használd az automatikus generálást a szezon dátumtartományára.",
    );
}

export async function DELETE(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { timeSlotId, seasonId } = body;

        if (!timeSlotId && !seasonId) {
            return jsonError(400, "Időpont ID vagy szezon ID szükséges");
        }

        const db = getDatabase();

        // Single time slot delete
        if (timeSlotId) {
            let result;
            try {
                result = db
                    .prepare("DELETE FROM time_slots WHERE id = ?")
                    .run(timeSlotId);
            } catch (err) {
                if (isForeignKeyError(err)) {
                    return jsonError(
                        400,
                        "Az időpont nem törölhető, mert preferenciák vagy ütemezett mérkőzések hivatkoznak rá",
                    );
                }
                console.error(err);
                return jsonError(500, "Hiba az időpont törlésekor");
            }

            if (result.changes === 0) {
                return jsonError(404, "Időpont nem található");
            }

            return NextResponse.json({ success: true }, { status: 200 });
        }

        // Season-wide cleanup of dates/time slots and dependent generated data
        let totalTimeSlots;
        try {
            totalTimeSlots =
                db
                    .prepare(
                        `SELECT COUNT(*) as count
                         FROM time_slots
                         WHERE season_id = ?`,
                    )
                    .get(seasonId)?.count || 0;
        } catch (err) {
            console.error(err);
            return jsonError(
                500,
                "Hiba a szezonhoz tartozó időpontok lekérdezésekor",
            );
        }

        // Children before parents, all in one transaction
        let failMessage = "Hiba a törlési tranzakció indításakor";
        let counts;
        try {
            counts = db.transaction(() => {
                failMessage = "Hiba a preferenciák törlésekor";
                const deletedPreferences = db
                    .prepare(
                        `DELETE FROM team_availability_preferences
                         WHERE season_id = ?`,
                    )
                    .run(seasonId).changes;

                failMessage = "Hiba az ütemezett mérkőzések törlésekor";
                const deletedScheduledMatches = db
                    .prepare(
                        `DELETE FROM scheduled_matches
                         WHERE schedule_run_id IN (
                             SELECT id FROM schedule_runs
                             WHERE season_id = ?
                         )`,
                    )
                    .run(seasonId).changes;

                failMessage = "Hiba az ütemezési futtatások törlésekor";
                const deletedScheduleRuns = db
                    .prepare(
                        `DELETE FROM schedule_runs
                         WHERE season_id = ?`,
                    )
                    .run(seasonId).changes;

                failMessage = "Hiba a szezon időpontjainak törlésekor";
                const deletedTimeSlots = db
                    .prepare(
                        `DELETE FROM time_slots
                         WHERE season_id = ?`,
                    )
                    .run(seasonId).changes;

                failMessage = "Hiba a törlési tranzakció lezárásakor";
                return {
                    deletedTimeSlots,
                    deletedPreferences,
                    deletedScheduledMatches,
                    deletedScheduleRuns,
                };
            })();
        } catch (err) {
            console.error(err);
            return jsonError(500, failMessage);
        }

        return NextResponse.json(
            { success: true, ...counts, totalTimeSlots },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}
