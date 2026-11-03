// Data for the home page: latest results, next fixtures and the top of each league table.
// Takes the database as a parameter so it can be tested on its own.

/**
 * Format a Date as local "YYYY-MM-DDTHH:MM:SS", the format published matches use
 * for match_date. ISO strings with a "Z" (the sample matches) still compare
 * correctly against it as text, to the day.
 * @param {Date} date
 * @returns {string}
 */
export function toLocalDateTimeKey(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
}

const MATCH_COLUMNS = `
    m.id,
    m.league_id as leagueId,
    l.name as leagueName,
    m.home_team_id as homeTeamId,
    ht.name as homeTeamName,
    m.away_team_id as awayTeamId,
    at.name as awayTeamName,
    m.home_score as homeScore,
    m.away_score as awayScore,
    m.match_date as matchDate`;

const MATCH_JOINS = `
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    LEFT JOIN leagues l ON l.id = m.league_id`;

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Object} [options]
 * @param {Date} [options.now] - Fixtures before this moment are not "next"
 * @param {number} [options.matchLimit] - Results and fixtures to return each
 * @param {number} [options.topTeams] - Teams per league in the table summary
 * @returns {{latestResults: Object[], nextFixtures: Object[], standings: Object[]}}
 */
export function getHomeData(
    db,
    { now = new Date(), matchLimit = 5, topTeams = 3 } = {},
) {
    const latestResults = db
        .prepare(
            `SELECT ${MATCH_COLUMNS}
             ${MATCH_JOINS}
             WHERE m.status = 'finished'
             ORDER BY m.match_date DESC, m.id DESC
             LIMIT ?`,
        )
        .all(matchLimit);

    // Upcoming matches already in the past are unreported, not "next"
    const nextFixtures = db
        .prepare(
            `SELECT ${MATCH_COLUMNS}
             ${MATCH_JOINS}
             WHERE m.status = 'upcoming' AND m.match_date >= ?
             ORDER BY m.match_date ASC, m.id ASC
             LIMIT ?`,
        )
        .all(toLocalDateTimeKey(now), matchLimit);

    // TODO(standings): uses the stored columns on `teams` until standings are
    // calculated from finished matches
    const leagues = db
        .prepare(
            `SELECT l.id, l.name, l.country, COUNT(t.id) as teamCount
             FROM leagues l
             JOIN teams t ON t.league_id = l.id
             GROUP BY l.id
             ORDER BY l.name`,
        )
        .all();
    const topOfLeague = db.prepare(
        `SELECT id, name, matches, wins, draws, losses, points
         FROM teams
         WHERE league_id = ?
         ORDER BY points DESC, name ASC
         LIMIT ?`,
    );
    const standings = leagues.map((league) => ({
        ...league,
        teams: topOfLeague.all(league.id, topTeams),
    }));

    return { latestResults, nextFixtures, standings };
}
