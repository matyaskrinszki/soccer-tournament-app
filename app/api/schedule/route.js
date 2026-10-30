import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../lib/db";
import { dbAll } from "../../../lib/db-async";

initializeDb();

// Season statuses whose schedule is public. In "setup" and "team-preferences"
// the schedule is still being prepared, so guests don't see it yet.
const PUBLIC_STATUSES = ["generated", "active", "completed"];

/**
 * Public schedule.
 * GET /api/schedule            -> the most recent public season
 * GET /api/schedule?seasonId=3 -> that season (404 if it isn't public)
 *
 * Returns { seasons, season, leagues }, where each league is its current
 * schedule run with its matches, ordered by date and start time.
 */
export async function GET(request) {
    const seasonIdParam = new URL(request.url).searchParams.get("seasonId");
    const db = getDb();

    try {
        const placeholders = PUBLIC_STATUSES.map(() => "?").join(", ");
        const seasons = await dbAll(
            db,
            `SELECT id, name, status, start_date AS startDate, end_date AS endDate
             FROM seasons
             WHERE status IN (${placeholders})
             ORDER BY start_date DESC, id DESC`,
            PUBLIC_STATUSES,
        );

        if (seasons.length === 0) {
            return NextResponse.json({ seasons: [], season: null, leagues: [] });
        }

        let season = seasons[0];
        if (seasonIdParam) {
            season = seasons.find((s) => s.id === Number(seasonIdParam));
            if (!season) {
                return NextResponse.json(
                    { error: "A szezon nem található, vagy a menetrendje még nem nyilvános" },
                    { status: 404 },
                );
            }
        }

        // Only the current run per league; archived runs are older generations.
        const runs = await dbAll(
            db,
            `SELECT sr.id,
                    sr.league_id AS leagueId,
                    l.name AS leagueName,
                    l.country AS leagueCountry,
                    sr.algorithm_score AS algorithmScore,
                    sr.generated_at AS generatedAt
             FROM schedule_runs sr
             LEFT JOIN leagues l ON l.id = sr.league_id
             WHERE sr.season_id = ? AND sr.status = 'current'
             ORDER BY l.name`,
            [season.id],
        );

        const matches = runs.length === 0 ? [] : await dbAll(
            db,
            `SELECT sm.id,
                    sm.schedule_run_id AS scheduleRunId,
                    sm.home_team_id AS homeTeamId,
                    sm.away_team_id AS awayTeamId,
                    ht.name AS homeTeamName,
                    at.name AS awayTeamName,
                    p.name AS pitchName,
                    ts.slot_date AS slotDate,
                    ts.start_time AS startTime,
                    ts.end_time AS endTime
             FROM scheduled_matches sm
             JOIN schedule_runs sr ON sr.id = sm.schedule_run_id
             LEFT JOIN teams ht ON ht.id = sm.home_team_id
             LEFT JOIN teams at ON at.id = sm.away_team_id
             LEFT JOIN pitches p ON p.id = sm.pitch_id
             LEFT JOIN time_slots ts ON ts.id = sm.time_slot_id
             WHERE sr.season_id = ? AND sr.status = 'current'
             ORDER BY ts.slot_date, ts.start_time, p.name`,
            [season.id],
        );

        const leagues = runs.map((run) => ({
            ...run,
            matches: matches.filter((m) => m.scheduleRunId === run.id),
        }));

        return NextResponse.json({ seasons, season, leagues });
    } catch (err) {
        console.error("Schedule query failed:", err);
        return NextResponse.json(
            { error: "Hiba történt a menetrend lekérdezésekor" },
            { status: 500 },
        );
    } finally {
        db.close();
    }
}
