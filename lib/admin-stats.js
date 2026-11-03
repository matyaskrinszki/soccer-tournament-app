// Counts for the admin overview tab. Takes the database as a parameter so it can be
// tested on its own.
import { toLocalDateTimeKey } from "./home.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Object} [options]
 * @param {Date} [options.now] - Upcoming matches before this moment are awaiting a result
 * @returns {{
 *   players: number, teams: number, leagues: number, seasons: number,
 *   activeSeasons: number, pendingJoinRequests: number,
 *   matches: {total: number, finished: number, upcoming: number, awaitingResult: number}
 * }}
 */
export function getAdminStats(db, { now = new Date() } = {}) {
    const count = (sql) => db.prepare(sql).get().count;

    const matches = db
        .prepare(
            `SELECT COUNT(*) as total,
                    COALESCE(SUM(status = 'finished'), 0) as finished,
                    COALESCE(SUM(status = 'upcoming'), 0) as upcoming,
                    COALESCE(SUM(status = 'upcoming' AND match_date < ?), 0) as awaitingResult
             FROM matches`,
        )
        .get(toLocalDateTimeKey(now));

    return {
        players: count("SELECT COUNT(*) as count FROM players"),
        teams: count("SELECT COUNT(*) as count FROM teams"),
        leagues: count("SELECT COUNT(*) as count FROM leagues"),
        seasons: count("SELECT COUNT(*) as count FROM seasons"),
        activeSeasons: count("SELECT COUNT(*) as count FROM seasons WHERE status = 'active'"),
        pendingJoinRequests: count(
            "SELECT COUNT(*) as count FROM join_requests WHERE status = 'pending'",
        ),
        matches,
    };
}
