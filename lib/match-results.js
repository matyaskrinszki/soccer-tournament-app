// Recording final scores and goal scorers of published matches (admin "Eredmények" tab).
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
 * A match with both teams' possible scorers and the goals already recorded, for
 * the scorer editor. Possible scorers are the team's current players plus anyone
 * already recorded as scoring for the team in this match, so a result can still be
 * corrected after a scorer has left the team.
 * @param {import("better-sqlite3").Database} db
 * @param {number} matchId
 * @returns {Object|null} null if the match doesn't exist
 */
export function getMatchForResult(db, matchId) {
    const match = db
        .prepare(
            `SELECT m.id,
                    m.home_team_id as homeTeamId,
                    m.away_team_id as awayTeamId,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    m.match_date as matchDate,
                    m.status
             FROM matches m
             WHERE m.id = ?`,
        )
        .get(matchId);
    if (!match) {
        return null;
    }

    return {
        ...match,
        homeTeam: getTeamScorers(db, matchId, match.homeTeamId),
        awayTeam: getTeamScorers(db, matchId, match.awayTeamId),
    };
}

function getTeamScorers(db, matchId, teamId) {
    const team = db
        .prepare("SELECT id, name, captain_player_id as captainPlayerId FROM teams WHERE id = ?")
        .get(teamId);

    const players = db
        .prepare(
            `SELECT p.id, p.name,
                    (SELECT COUNT(*) FROM goals g
                     WHERE g.match_id = ? AND g.team_id = ? AND g.player_id = p.id) as goals
             FROM players p
             WHERE p.team_id = ?
                OR p.id IN (SELECT player_id FROM goals WHERE match_id = ? AND team_id = ?)`,
        )
        .all(matchId, teamId, teamId, matchId, teamId)
        // SQLite sorts accented letters after "z", so names are ordered here
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "hu") || a.id - b.id);

    return { ...team, players };
}

/**
 * Store the final score and the goal scorers of a match and mark it finished. A
 * finished match can be corrected by recording it again; its scorers are replaced.
 *
 * Scorers are given as goal counts per player. Each team's counts may add up to
 * less than its score: the remaining goals are credited to the team's captain.
 * @param {import("better-sqlite3").Database} db
 * @param {number} matchId
 * @param {{homeScore: *, awayScore: *, scorers?: {teamId: *, playerId: *, goals: *}[]}} body
 *   Raw values from the request
 * @param {Object} [options]
 * @param {Date} [options.now] - Matches kicking off after this can't have a result yet
 * @returns {{ok: true, match: Object} | {ok: false, status: number, error: string}}
 */
export function recordMatchResult(db, matchId, body, { now = new Date() } = {}) {
    const homeScore = parseScore(body?.homeScore);
    const awayScore = parseScore(body?.awayScore);
    if (homeScore === null || awayScore === null) {
        return fail(400, `Az eredmény 0 és ${MAX_SCORE} közötti egész szám lehet`);
    }

    const scorers = body?.scorers ?? [];
    if (!Array.isArray(scorers)) {
        return fail(400, "Érvénytelen góllövő lista");
    }

    const match = getMatchForResult(db, matchId);
    if (!match) {
        return fail(404, "A mérkőzés nem található");
    }

    if (match.matchDate > toLocalDateTimeKey(now)) {
        return fail(400, "A mérkőzés még nem kezdődött el, ezért nem rögzíthető eredmény");
    }

    const sides = [
        { team: match.homeTeam, score: homeScore },
        { team: match.awayTeam, score: awayScore },
    ];
    const unknownTeam = scorers.find(
        (entry) => !sides.some(({ team }) => team.id === Number(entry?.teamId)),
    );
    if (unknownTeam) {
        return fail(400, "A góllövő csapata nem játszott ezen a mérkőzésen");
    }

    const goals = [];
    for (const { team, score } of sides) {
        const result = resolveTeamGoals(team, score, scorers);
        if (!result.ok) {
            return result;
        }
        goals.push(...result.goals);
    }

    // Nothing else to update: tables are calculated from finished matches
    // (lib/standings.js), top scorers from the goals (lib/statistics.js)
    db.transaction(() => {
        db.prepare(
            `UPDATE matches
             SET home_score = ?, away_score = ?, status = 'finished'
             WHERE id = ?`,
        ).run(homeScore, awayScore, matchId);

        db.prepare("DELETE FROM goals WHERE match_id = ?").run(matchId);
        const insertGoal = db.prepare(
            "INSERT INTO goals (match_id, team_id, player_id) VALUES (?, ?, ?)",
        );
        for (const goal of goals) {
            insertGoal.run(matchId, goal.teamId, goal.playerId);
        }
    })();

    return {
        ok: true,
        match: { id: match.id, homeScore, awayScore, status: "finished" },
    };
}

/**
 * Turn one team's entries of the scorer list into one row per goal, crediting
 * goals without a scorer to the captain. Also used to validate captains' reports
 * (lib/match-reports.js).
 * @param {{id: number, name: string, captainPlayerId: number|null, players: {id: number}[]}} team
 *   One side of getMatchForResult
 * @param {number} score - The team's goals
 * @param {{teamId: *, playerId: *, goals: *}[]} scorers - Entries of other teams are skipped
 * @returns {{ok: true, goals: {teamId: number, playerId: number}[]} | {ok: false, status: number, error: string}}
 */
export function resolveTeamGoals(team, score, scorers) {
    const eligible = new Set(team.players.map((player) => player.id));
    const counts = new Map();

    for (const entry of scorers) {
        if (Number(entry?.teamId) !== team.id) continue;

        const playerId = Number(entry.playerId);
        if (!eligible.has(playerId)) {
            return fail(400, `A góllövő nem a(z) ${team.name} csapat játékosa`);
        }
        if (counts.has(playerId)) {
            return fail(400, "Egy játékos csak egyszer szerepelhet a góllövők között");
        }
        const goals = parseScore(entry.goals);
        if (goals === null) {
            return fail(400, `A gólok száma 0 és ${MAX_SCORE} közötti egész szám lehet`);
        }
        counts.set(playerId, goals);
    }

    const assigned = [...counts.values()].reduce((sum, goals) => sum + goals, 0);
    if (assigned > score) {
        return fail(
            400,
            `A(z) ${team.name} góllövőinek összesen ${assigned} gólja több, mint a csapat ${score} gólja`,
        );
    }

    const leftover = score - assigned;
    if (leftover > 0) {
        if (team.captainPlayerId == null) {
            return fail(
                400,
                `A(z) ${team.name} csapatnak nincs kapitánya, ezért minden gólját góllövőhöz kell rendelni`,
            );
        }
        counts.set(team.captainPlayerId, (counts.get(team.captainPlayerId) ?? 0) + leftover);
    }

    const goals = [];
    for (const [playerId, count] of counts) {
        for (let i = 0; i < count; i++) {
            goals.push({ teamId: team.id, playerId });
        }
    }
    return { ok: true, goals };
}

function fail(status, error) {
    return { ok: false, status, error };
}
