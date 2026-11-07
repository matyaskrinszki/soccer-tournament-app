// Recording final scores of published matches (admin "Eredmények" tab).
// Takes the database as a parameter so it can be tested on its own.
import { toLocalDateTimeKey } from "./home.js";

export const MAX_SCORE = 99;

/**
 * Parse a score sent by the client. Accepts numbers and numeric strings.
 * @param {*} value
 * @returns {number|null} The score, or null if it isn't a whole number in 0..MAX_SCORE
 */
export function parseScore(value) {
    if (value === null || value === undefined || value === "") return null;
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
    return score;
}

/**
 * Matches published for a season, in kick-off order.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {Object[]}
 */
export function listSeasonMatches(db, seasonId) {
    return db
        .prepare(
            `SELECT m.id,
                    m.league_id as leagueId,
                    l.name as leagueName,
                    m.home_team_id as homeTeamId,
                    ht.name as homeTeamName,
                    m.away_team_id as awayTeamId,
                    at.name as awayTeamName,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    m.match_date as matchDate,
                    m.status
             FROM matches m
             JOIN teams ht ON ht.id = m.home_team_id
             JOIN teams at ON at.id = m.away_team_id
             LEFT JOIN leagues l ON l.id = m.league_id
             WHERE m.season_id = ?
             ORDER BY m.match_date ASC, m.id ASC`,
        )
        .all(seasonId);
}

/**
 * Store the final score of a match and mark it finished. A finished match can be
 * corrected by recording it again.
 * @param {import("better-sqlite3").Database} db
 * @param {number} matchId
 * @param {{homeScore: *, awayScore: *}} scores - Raw values from the request
 * @param {Object} [options]
 * @param {Date} [options.now] - Matches kicking off after this can't have a result yet
 * @returns {{ok: true, match: Object} | {ok: false, status: number, error: string}}
 */
export function recordMatchResult(db, matchId, scores, { now = new Date() } = {}) {
    const homeScore = parseScore(scores?.homeScore);
    const awayScore = parseScore(scores?.awayScore);
    if (homeScore === null || awayScore === null) {
        return fail(400, `Az eredmény 0 és ${MAX_SCORE} közötti egész szám lehet`);
    }

    const match = db
        .prepare("SELECT id, match_date as matchDate FROM matches WHERE id = ?")
        .get(matchId);
    if (!match) {
        return fail(404, "A mérkőzés nem található");
    }

    if (match.matchDate > toLocalDateTimeKey(now)) {
        return fail(400, "A mérkőzés még nem kezdődött el, ezért nem rögzíthető eredmény");
    }

    // Nothing else to update: tables are calculated from finished matches
    // (lib/standings.js)
    db.prepare(
        `UPDATE matches
         SET home_score = ?, away_score = ?, status = 'finished'
         WHERE id = ?`,
    ).run(homeScore, awayScore, matchId);

    return {
        ok: true,
        match: { id: match.id, homeScore, awayScore, status: "finished" },
    };
}

function fail(status, error) {
    return { ok: false, status, error };
}
