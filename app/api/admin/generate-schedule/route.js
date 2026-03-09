import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";
import { generateSchedule, validateSchedule } from "../../../../lib/scheduler";

initializeDb();

export async function POST(request) {
    const user = await requireAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { seasonId } = body;

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        // Get season and league info
        db.get(
            `SELECT id, league_id, name FROM seasons WHERE id = ?`,
            [seasonId],
            (err, season) => {
                if (err || !season) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            { error: "Szezon nem található" },
                            { status: 404 },
                        ),
                    );
                }

                // Get all teams in the league
                db.all(
                    `SELECT id FROM teams WHERE league_id = ? ORDER BY id`,
                    [season.league_id],
                    (err, teams) => {
                        if (err || !teams || teams.length === 0) {
                            db.close();
                            return resolve(
                                NextResponse.json(
                                    { error: "Nincsenek csapatok a ligában" },
                                    { status: 400 },
                                ),
                            );
                        }

                        const teamIds = teams.map((t) => t.id);

                        // Get all time slots for this season
                        db.all(
                            `SELECT id, pitch_id as pitchId, slot_date as slotDate, day_of_week as dayOfWeek, start_time as startTime, end_time as endTime
                             FROM time_slots 
                             WHERE season_id = ?
                             ORDER BY slot_date IS NULL, slot_date, day_of_week, start_time`,
                            [seasonId],
                            (err, timeSlots) => {
                                if (
                                    err ||
                                    !timeSlots ||
                                    timeSlots.length === 0
                                ) {
                                    db.close();
                                    return resolve(
                                        NextResponse.json(
                                            {
                                                error: "Nincsenek időpontok konfigurálva",
                                            },
                                            { status: 400 },
                                        ),
                                    );
                                }

                                // Get team preferences
                                db.all(
                                    `SELECT team_id as teamId, time_slot_id as timeSlotId, preference
                                     FROM team_availability_preferences 
                                     WHERE season_id = ?`,
                                    [seasonId],
                                    (err, prefs) => {
                                        if (err) {
                                            db.close();
                                            return resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Hiba a preferenciák lekérdezésekor",
                                                    },
                                                    { status: 500 },
                                                ),
                                            );
                                        }

                                        // Build preferences map
                                        const teamPreferences = new Map();
                                        teamIds.forEach((id) =>
                                            teamPreferences.set(id, new Map()),
                                        );

                                        (prefs || []).forEach((pref) => {
                                            if (
                                                !teamPreferences.has(
                                                    pref.teamId,
                                                )
                                            ) {
                                                teamPreferences.set(
                                                    pref.teamId,
                                                    new Map(),
                                                );
                                            }
                                            teamPreferences
                                                .get(pref.teamId)
                                                .set(
                                                    pref.timeSlotId,
                                                    pref.preference,
                                                );
                                        });

                                        // Run scheduling algorithm
                                        const result = generateSchedule({
                                            teamIds,
                                            timeSlots,
                                            teamPreferences,
                                        });

                                        // Validate schedule
                                        const validation = validateSchedule(
                                            result.schedule,
                                            timeSlots,
                                        );

                                        if (!validation.isValid) {
                                            db.close();
                                            return resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Ütemezési konfliktusok",
                                                        conflicts:
                                                            validation.conflicts,
                                                    },
                                                    { status: 400 },
                                                ),
                                            );
                                        }

                                        // Archive old schedules
                                        db.run(
                                            `UPDATE schedule_runs SET status = 'archived' 
                                             WHERE season_id = ? AND league_id = ?`,
                                            [seasonId, season.league_id],
                                            (err) => {
                                                if (err) {
                                                    db.close();
                                                    return resolve(
                                                        NextResponse.json(
                                                            {
                                                                error: "Hiba az öreg ütemezések archiválásakor",
                                                            },
                                                            { status: 500 },
                                                        ),
                                                    );
                                                }

                                                // Insert new schedule run
                                                db.run(
                                                    `INSERT INTO schedule_runs (season_id, league_id, algorithm_score, status)
                                                     VALUES (?, ?, ?, 'current')`,
                                                    [
                                                        seasonId,
                                                        season.league_id,
                                                        result.satisfactionScore,
                                                    ],
                                                    function (err) {
                                                        if (err) {
                                                            db.close();
                                                            return resolve(
                                                                NextResponse.json(
                                                                    {
                                                                        error: "Hiba az ütemezési futtatás rögzítésekor",
                                                                    },
                                                                    {
                                                                        status: 500,
                                                                    },
                                                                ),
                                                            );
                                                        }

                                                        const scheduleRunId =
                                                            this.lastID;

                                                        // Insert scheduled matches
                                                        let matchesInserted = 0;
                                                        result.schedule.forEach(
                                                            (match, index) => {
                                                                db.run(
                                                                    `INSERT INTO scheduled_matches 
                                                                 (schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id, round_number)
                                                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                                                    [
                                                                        scheduleRunId,
                                                                        match.homeTeamId,
                                                                        match.awayTeamId,
                                                                        match.timeSlotId,
                                                                        match.pitchId,
                                                                        index +
                                                                            1,
                                                                    ],
                                                                    (err) => {
                                                                        if (
                                                                            err
                                                                        ) {
                                                                            db.close();
                                                                            return resolve(
                                                                                NextResponse.json(
                                                                                    {
                                                                                        error: "Hiba az ütemezés mentésekor",
                                                                                    },
                                                                                    {
                                                                                        status: 500,
                                                                                    },
                                                                                ),
                                                                            );
                                                                        }
                                                                        matchesInserted++;

                                                                        // When all matches inserted, return success
                                                                        if (
                                                                            matchesInserted ===
                                                                            result
                                                                                .schedule
                                                                                .length
                                                                        ) {
                                                                            db.close();
                                                                            return resolve(
                                                                                NextResponse.json(
                                                                                    {
                                                                                        success: true,
                                                                                        scheduleRunId,
                                                                                        matchCount:
                                                                                            result.scheduledMatchCount,
                                                                                        satisfactionScore:
                                                                                            result.satisfactionScore,
                                                                                    },
                                                                                    {
                                                                                        status: 201,
                                                                                    },
                                                                                ),
                                                                            );
                                                                        }
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
                            },
                        );
                    },
                );
            },
        );
    });
}

export async function GET(request) {
    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT 
                id,
                season_id as seasonId,
                league_id as leagueId,
                generated_at as generatedAt,
                algorithm_score as algorithmScore,
                status
             FROM schedule_runs
             WHERE season_id = ?
             ORDER BY generated_at DESC`,
            [seasonId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba az ütemezések lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ schedules: rows || [] }));
            },
        );
    });
}
