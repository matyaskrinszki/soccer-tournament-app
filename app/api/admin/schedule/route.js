import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";

initializeDb();

export async function GET(request) {
    const url = new URL(request.url);
    const scheduleRunId = url.searchParams.get("scheduleRunId");

    if (!scheduleRunId) {
        return NextResponse.json(
            { error: "Ütemezési futtatás ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT 
                sm.id,
                sm.schedule_run_id as scheduleRunId,
                sm.home_team_id as homeTeamId,
                sm.away_team_id as awayTeamId,
                sm.time_slot_id as timeSlotId,
                sm.pitch_id as pitchId,
                sm.round_number as roundNumber,
                ht.name as homeTeamName,
                at.name as awayTeamName,
                p.name as pitchName,
                ts.slot_date as slotDate,
                ts.day_of_week as dayOfWeek,
                ts.start_time as startTime,
                ts.end_time as endTime
             FROM scheduled_matches sm
             LEFT JOIN teams ht ON ht.id = sm.home_team_id
             LEFT JOIN teams at ON at.id = sm.away_team_id
             LEFT JOIN pitches p ON p.id = sm.pitch_id
             LEFT JOIN time_slots ts ON ts.id = sm.time_slot_id
             WHERE sm.schedule_run_id = ?
             ORDER BY sm.round_number`,
            [scheduleRunId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba az ütemezés lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ matches: rows || [] }));
            },
        );
    });
}
