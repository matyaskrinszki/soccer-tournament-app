// League tables calculated from finished matches, instead of stored counters on
// `teams`. Recording or correcting a result is then reflected everywhere without
// any extra bookkeeping. Takes the database as a parameter so it can be tested on
// its own.

export const POINTS_FOR_WIN = 3;
export const POINTS_FOR_DRAW = 1;

/**
 * @typedef {Object} StandingRow
 * @property {number} position - 1-based place in the table
 * @property {number} id - Team id
 * @property {string} name - Team name
 * @property {number} played
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {number} goalDifference
 * @property {number} points
 */

/**
 * Build a league table.
 *
 * Order: points, goal difference, goals scored. Teams still level on all three are
 * ordered by their head-to-head record among themselves (points, goal difference,
 * goals scored in the matches between them), and finally by name.
 *
 * @param {{id: number, name: string}[]} teams - Every team in the table, including
 *   those that haven't played yet
 * @param {{homeTeamId: number, awayTeamId: number, homeScore: number, awayScore: number}[]} matches
 *   - Finished matches; matches involving a team not in `teams` are ignored
 * @returns {StandingRow[]}
 */
export function calculateStandings(teams, matches) {
    const teamIds = new Set(teams.map((team) => team.id));
    const relevantMatches = matches.filter(
        (match) => teamIds.has(match.homeTeamId) && teamIds.has(match.awayTeamId),
    );

    const totals = tally(teamIds, relevantMatches);
    const rows = teams.map((team) => ({ id: team.id, name: team.name, ...totals.get(team.id) }));

    rows.sort(compareTotals);

    // Break remaining ties with a mini table of the matches between the tied teams
    const ordered = [];
    for (let start = 0; start < rows.length; ) {
        let end = start + 1;
        while (end < rows.length && compareTotals(rows[start], rows[end]) === 0) {
            end++;
        }
        const tied = rows.slice(start, end);
        ordered.push(...(tied.length > 1 ? orderByHeadToHead(tied, relevantMatches) : tied));
        start = end;
    }

    return ordered.map((row, index) => ({ position: index + 1, ...row }));
}

/**
 * Tables of every league that has matches in the season. A team is in a season's
 * table if it has a match in that season, so teams created later don't show up in
 * past seasons.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{id: string, name: string, country: string|null, teams: StandingRow[]}[]}
 *   Leagues ordered by name
 */
export function getSeasonStandings(db, seasonId) {
    const matches = db
        .prepare(
            `SELECT m.league_id as leagueId,
                    m.home_team_id as homeTeamId,
                    ht.name as homeTeamName,
                    m.away_team_id as awayTeamId,
                    at.name as awayTeamName,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    m.status
             FROM matches m
             JOIN teams ht ON ht.id = m.home_team_id
             JOIN teams at ON at.id = m.away_team_id
             WHERE m.season_id = ?`,
        )
        .all(seasonId);

    const leagues = db
        .prepare(
            `SELECT DISTINCT l.id, l.name, l.country
             FROM leagues l
             JOIN matches m ON m.league_id = l.id
             WHERE m.season_id = ?
             ORDER BY l.name`,
        )
        .all(seasonId);

    return leagues.map((league) => {
        const leagueMatches = matches.filter((match) => match.leagueId === league.id);

        const teamsById = new Map();
        for (const match of leagueMatches) {
            teamsById.set(match.homeTeamId, { id: match.homeTeamId, name: match.homeTeamName });
            teamsById.set(match.awayTeamId, { id: match.awayTeamId, name: match.awayTeamName });
        }

        const finished = leagueMatches.filter(isScoredFinishedMatch);
        return { ...league, teams: calculateStandings([...teamsById.values()], finished) };
    });
}

// A finished match without both scores can't count towards the table
function isScoredFinishedMatch(match) {
    return match.status === "finished" && match.homeScore !== null && match.awayScore !== null;
}

function tally(teamIds, matches) {
    const totals = new Map();
    for (const id of teamIds) {
        totals.set(id, {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
        });
    }

    for (const match of matches) {
        addResult(totals.get(match.homeTeamId), match.homeScore, match.awayScore);
        addResult(totals.get(match.awayTeamId), match.awayScore, match.homeScore);
    }
    return totals;
}

function addResult(row, scored, conceded) {
    row.played += 1;
    row.goalsFor += scored;
    row.goalsAgainst += conceded;
    row.goalDifference = row.goalsFor - row.goalsAgainst;

    if (scored > conceded) {
        row.wins += 1;
        row.points += POINTS_FOR_WIN;
    } else if (scored === conceded) {
        row.draws += 1;
        row.points += POINTS_FOR_DRAW;
    } else {
        row.losses += 1;
    }
}

// Higher first on points, then goal difference, then goals scored
function compareTotals(a, b) {
    return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
}

function orderByHeadToHead(tied, matches) {
    const tiedIds = new Set(tied.map((row) => row.id));
    const between = matches.filter(
        (match) => tiedIds.has(match.homeTeamId) && tiedIds.has(match.awayTeamId),
    );
    const headToHead = tally(tiedIds, between);

    return [...tied].sort(
        (a, b) =>
            compareTotals(headToHead.get(a.id), headToHead.get(b.id)) ||
            a.name.localeCompare(b.name, "hu"),
    );
}
