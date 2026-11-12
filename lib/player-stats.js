// Statistics for a player's profile, calculated from recorded goals and matches.
// There is no lineup data, so nothing here says which matches the player played:
// the match list is the team's. Takes the database as a parameter so it can be
// tested on its own.
import { listDisplaySeasons } from "./seasons.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} playerId
 * @returns {{ok: true, stats: {
 *   totalGoals: number,
 *   goalsBySeason: {seasonId: number, seasonName: string, isSample: boolean,
 *                   teamId: number, teamName: string, goals: number, matchesWithGoal: number}[],
 *   teamSeason: {id: number, name: string, status: string, isSample: boolean}|null,
 *   teamMatches: Object[]
 * }} | {ok: false, status: number, error: string}}
 */
export function getPlayerStats(db, playerId) {
    const player = db.prepare("SELECT id, team_id as teamId FROM players WHERE id = ?").get(playerId);
    if (!player) {
        return { ok: false, status: 404, error: "A játékos nem található" };
    }

    const totalGoals = db
        .prepare("SELECT COUNT(*) as goals FROM goals WHERE player_id = ?")
        .get(player.id).goals;

    // Grouped by the team the goals were scored for, so goals for a former team
    // stay with that team
    const seasonOrder = listDisplaySeasons(db).map((season) => season.id);
    const goalsBySeason = db
        .prepare(
            `SELECT s.id as seasonId, s.name as seasonName, s.is_sample as isSample,
                    t.id as teamId, t.name as teamName,
                    COUNT(*) as goals, COUNT(DISTINCT g.match_id) as matchesWithGoal
             FROM goals g
             JOIN matches m ON m.id = g.match_id
             JOIN seasons s ON s.id = m.season_id
             JOIN teams t ON t.id = g.team_id
             WHERE g.player_id = ?
             GROUP BY s.id, t.id`,
        )
        .all(player.id)
        .map((row) => ({ ...row, isSample: row.isSample === 1 }))
        .sort(
            (a, b) =>
                seasonOrder.indexOf(a.seasonId) - seasonOrder.indexOf(b.seasonId) ||
                a.teamName.localeCompare(b.teamName, "hu"),
        );

    // The current team's matches in the season its team page shows
    const [season = null] =
        player.teamId == null ? [] : listDisplaySeasons(db, { teamId: player.teamId });
    const teamMatches = season
        ? db
              .prepare(
                  `SELECT m.id, m.match_date as matchDate, m.status,
                          m.home_team_id as homeTeamId, m.away_team_id as awayTeamId,
                          ht.name as homeName, at.name as awayName,
                          m.home_score as homeScore, m.away_score as awayScore,
                          (SELECT COUNT(*) FROM goals g
                           WHERE g.match_id = m.id AND g.player_id = @playerId) as playerGoals
                   FROM matches m
                   JOIN teams ht ON ht.id = m.home_team_id
                   JOIN teams at ON at.id = m.away_team_id
                   WHERE m.season_id = @seasonId
                     AND (m.home_team_id = @teamId OR m.away_team_id = @teamId)
                   ORDER BY m.match_date ASC, m.id ASC`,
              )
              .all({ playerId: player.id, seasonId: season.id, teamId: player.teamId })
        : [];

    return {
        ok: true,
        stats: {
            totalGoals,
            goalsBySeason,
            teamSeason: season
                ? { id: season.id, name: season.name, status: season.status, isSample: season.isSample }
                : null,
            teamMatches,
        },
    };
}
