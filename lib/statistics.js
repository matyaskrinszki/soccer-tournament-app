// Data for the statistics page, for one season. Team figures come from the
// calculated standings, so they always agree with the tables. Takes the database as
// a parameter so it can be tested on its own.
import { getSeasonStandings } from "./standings.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{
 *   topScorers: Object[], scorersByLeague: Object[], matchStats: Object,
 *   highestScoringMatches: Object[], topTeams: Object[], defensiveTeams: Object[],
 *   leagueStats: Object[]
 * }}
 */
export function getSeasonStatistics(db, seasonId) {
    const topScorers = db
        .prepare(
            `SELECT p.id, p.name, COUNT(*) as goals
             FROM goals g
             JOIN players p ON p.id = g.player_id
             JOIN matches m ON m.id = g.match_id
             WHERE m.season_id = ?
             GROUP BY p.id, p.name
             ORDER BY goals DESC, p.name ASC
             LIMIT 10`,
        )
        .all(seasonId);

    const scorersByLeague = db
        .prepare(
            `SELECT l.id as leagueId, l.name as leagueName, p.id, p.name, COUNT(*) as goals
             FROM goals g
             JOIN players p ON p.id = g.player_id
             JOIN matches m ON m.id = g.match_id
             JOIN leagues l ON l.id = m.league_id
             WHERE m.season_id = ?
             GROUP BY l.id, l.name, p.id, p.name
             ORDER BY l.name, goals DESC, p.name ASC`,
        )
        .all(seasonId);

    const matchStats = db
        .prepare(
            `SELECT
                COUNT(*) as totalMatches,
                COALESCE(SUM(status = 'finished'), 0) as finishedMatches,
                COALESCE(SUM(status = 'upcoming'), 0) as upcomingMatches,
                ROUND(AVG(CASE WHEN status = 'finished' THEN home_score + away_score END), 2) as avgGoalsPerMatch,
                MAX(CASE WHEN status = 'finished' THEN home_score + away_score END) as maxGoalsInMatch
             FROM matches
             WHERE season_id = ?`,
        )
        .get(seasonId);

    const highestScoringMatches = db
        .prepare(
            `SELECT
                m.id,
                ht.name as homeName,
                at.name as awayName,
                m.home_score as homeScore,
                m.away_score as awayScore,
                m.home_score + m.away_score as totalGoals,
                l.name as leagueName
             FROM matches m
             JOIN teams ht ON ht.id = m.home_team_id
             JOIN teams at ON at.id = m.away_team_id
             JOIN leagues l ON l.id = m.league_id
             WHERE m.season_id = ? AND m.status = 'finished'
             ORDER BY totalGoals DESC, m.match_date DESC
             LIMIT 10`,
        )
        .all(seasonId);

    const standings = getSeasonStandings(db, seasonId);
    const teamRows = standings.flatMap((league) =>
        league.teams.map((team) => ({ ...team, leagueName: league.name })),
    );
    const played = teamRows.filter((team) => team.played > 0);

    const topTeams = [...played]
        .sort((a, b) => b.points - a.points || b.wins - a.wins || b.goalDifference - a.goalDifference)
        .slice(0, 15)
        .map((team) => ({
            ...team,
            winPercentage: Math.round((team.wins / team.played) * 1000) / 10,
        }));

    const defensiveTeams = [...played]
        .map((team) => ({
            ...team,
            avgConcededPerMatch: Math.round((team.goalsAgainst / team.played) * 100) / 100,
        }))
        .sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.avgConcededPerMatch - b.avgConcededPerMatch)
        .slice(0, 10);

    const matchCounts = db
        .prepare(
            `SELECT league_id as leagueId, COUNT(*) as totalMatches,
                    COALESCE(SUM(status = 'finished'), 0) as finishedMatches
             FROM matches
             WHERE season_id = ?
             GROUP BY league_id`,
        )
        .all(seasonId);
    const countsByLeague = new Map(matchCounts.map((row) => [row.leagueId, row]));

    const leagueStats = standings.map((league) => ({
        id: league.id,
        name: league.name,
        country: league.country,
        teamCount: league.teams.length,
        totalMatches: countsByLeague.get(league.id)?.totalMatches ?? 0,
        finishedMatches: countsByLeague.get(league.id)?.finishedMatches ?? 0,
    }));

    return {
        topScorers,
        scorersByLeague,
        matchStats,
        highestScoringMatches,
        topTeams,
        defensiveTeams,
        leagueStats,
    };
}
