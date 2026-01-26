import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../../lib/db';

initializeDb();

export async function GET(request, context) {
    const idFromParams = context?.params?.id;
    const idFromPath = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    const id = idFromParams ?? idFromPath;

    if (!id) {
        return NextResponse.json({ error: 'A mérkőzés azonosító hiányzik' }, { status: 400 });
    }

    return new Promise((resolve) => {
        const db = getDb();
        db.get(
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
             WHERE m.id = ?`,
            [id],
            (err, row) => {
                if (err) {
                    db.close();
                    resolve(NextResponse.json({ error: 'Hiba történt a mérkőzés lekérdezésekor' }, { status: 500 }));
                    return;
                }

                if (!row) {
                    db.close();
                    resolve(NextResponse.json({ error: 'A mérkőzés nem található' }, { status: 404 }));
                    return;
                }

                db.all(
                    `SELECT g.id, g.minute, g.team_id as teamId, g.player_id as playerId,
                            p.name as playerName, t.name as teamName
                     FROM goals g
                     JOIN players p ON p.id = g.player_id
                     JOIN teams t ON t.id = g.team_id
                     WHERE g.match_id = ?
                     ORDER BY g.minute ASC, g.id ASC`,
                    [id],
                    (goalErr, goals) => {
                        if (goalErr) {
                            db.close();
                            resolve(NextResponse.json({ error: 'Hiba történt a gólok lekérdezésekor' }, { status: 500 }));
                            return;
                        }

                        db.close();
                        resolve(
                            NextResponse.json(
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
                                        goals: goals || []
                                    },
                                },
                                { status: 200 }
                            )
                        );
                    }
                );
            }
        );
    });
}
