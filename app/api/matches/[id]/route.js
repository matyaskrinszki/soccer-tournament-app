import { NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/database';
import { jsonError } from '../../../../lib/api';

export async function GET(request, context) {
    const { id } = await context.params;

    if (!id) {
        return jsonError(400, 'A mérkőzés azonosító hiányzik');
    }

    let failMessage = 'Hiba történt a mérkőzés lekérdezésekor';
    try {
        const db = getDatabase();

        const row = db
            .prepare(
                `SELECT
                    m.id,
                    m.league_id as leagueId,
                    m.home_team_id as homeTeamId,
                    m.away_team_id as awayTeamId,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    m.match_date as matchDate,
                    m.status,
                    hl.name as homeName,
                    al.name as awayName,
                    l.name as leagueName,
                    l.country as leagueCountry
                 FROM matches m
                 JOIN teams hl ON hl.id = m.home_team_id
                 JOIN teams al ON al.id = m.away_team_id
                 JOIN leagues l ON l.id = m.league_id
                 WHERE m.id = ?`
            )
            .get(id);

        if (!row) {
            return jsonError(404, 'A mérkőzés nem található');
        }

        failMessage = 'Hiba történt a gólok lekérdezésekor';
        // One entry per scorer: goals are recorded as a count per player
        const goals = db
            .prepare(
                `SELECT g.team_id as teamId, g.player_id as playerId,
                        p.name as playerName, COUNT(*) as goals
                 FROM goals g
                 JOIN players p ON p.id = g.player_id
                 WHERE g.match_id = ?
                 GROUP BY g.team_id, g.player_id, p.name
                 ORDER BY goals DESC, p.name ASC`
            )
            .all(id);

        return NextResponse.json(
            {
                match: {
                    id: row.id,
                    leagueId: row.leagueId,
                    leagueName: row.leagueName,
                    leagueCountry: row.leagueCountry,
                    status: row.status,
                    matchDate: row.matchDate,
                    homeTeam: { id: row.homeTeamId, name: row.homeName },
                    awayTeam: { id: row.awayTeamId, name: row.awayName },
                    homeScore: row.homeScore,
                    awayScore: row.awayScore,
                    goals
                },
            },
            { status: 200 }
        );
    } catch (err) {
        console.error(err);
        return jsonError(500, failMessage);
    }
}
