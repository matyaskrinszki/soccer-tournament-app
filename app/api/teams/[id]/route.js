import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../../lib/db';

initializeDb();

export async function GET(request, context) {
    // Derive id from params first, then fall back to the URL path
    const idFromParams = context?.params?.id;
    const idFromPath = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    const id = idFromParams ?? idFromPath;

    if (!id) {
        return NextResponse.json({ error: 'A csapat azonosító hiányzik' }, { status: 400 });
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.get(
            `SELECT 
                t.id,
                t.name,
                t.matches,
                t.wins,
                t.draws,
                t.losses,
                t.points,
                l.id as leagueId,
                l.name as leagueName,
                l.country as leagueCountry
             FROM teams t
             JOIN leagues l ON l.id = t.league_id
             WHERE t.id = ?`,
            [id],
            (err, row) => {
                if (err) {
                    db.close();
                    resolve(NextResponse.json({ error: 'Hiba történt a csapat lekérdezésekor' }, { status: 500 }));
                    return;
                }

                if (!row) {
                    db.close();
                    resolve(NextResponse.json({ error: 'A csapat nem található' }, { status: 404 }));
                    return;
                }

                // Fetch upcoming matches
                db.all(
                    `SELECT 
                        m.id,
                        m.match_date as matchDate,
                        m.status,
                        m.home_team_id as homeTeamId,
                        m.away_team_id as awayTeamId,
                        m.home_score as homeScore,
                        m.away_score as awayScore,
                        ht.name as homeName,
                        at.name as awayName,
                        l.name as leagueName,
                        l.country as leagueCountry
                    FROM matches m
                    JOIN teams ht ON ht.id = m.home_team_id
                    JOIN teams at ON at.id = m.away_team_id
                    JOIN leagues l ON l.id = m.league_id
                    WHERE m.status = 'upcoming' AND (m.home_team_id = ? OR m.away_team_id = ?)
                    ORDER BY m.match_date ASC
                    LIMIT 10`,
                    [id, id],
                    (matchErr, upcomingMatches) => {
                        if (matchErr) {
                            db.close();
                            resolve(NextResponse.json({ error: 'Hiba történt a mérkőzések lekérdezésekor' }, { status: 500 }));
                            return;
                        }

                        // Fetch finished matches
                        db.all(
                            `SELECT 
                                m.id,
                                m.match_date as matchDate,
                                m.status,
                                m.home_team_id as homeTeamId,
                                m.away_team_id as awayTeamId,
                                m.home_score as homeScore,
                                m.away_score as awayScore,
                                ht.name as homeName,
                                at.name as awayName,
                                l.name as leagueName,
                                l.country as leagueCountry
                            FROM matches m
                            JOIN teams ht ON ht.id = m.home_team_id
                            JOIN teams at ON at.id = m.away_team_id
                            JOIN leagues l ON l.id = m.league_id
                            WHERE m.status = 'finished' AND (m.home_team_id = ? OR m.away_team_id = ?)
                            ORDER BY m.match_date DESC
                            LIMIT 10`,
                            [id, id],
                            (finishedErr, finishedMatches) => {
                                if (finishedErr) {
                                    db.close();
                                    resolve(NextResponse.json({ error: 'Hiba történt az eredmények lekérdezésekor' }, { status: 500 }));
                                    return;
                                }

                                db.close();
                                resolve(
                                    NextResponse.json(
                                        {
                                            team: {
                                                id: row.id,
                                                name: row.name,
                                                matches: row.matches,
                                                wins: row.wins,
                                                draws: row.draws,
                                                losses: row.losses,
                                                points: row.points,
                                                league: {
                                                    id: row.leagueId,
                                                    name: row.leagueName,
                                                    country: row.leagueCountry,
                                                },
                                            },
                                            upcomingMatches: upcomingMatches || [],
                                            previousMatches: finishedMatches || []
                                        },
                                        { status: 200 }
                                    )
                                );
                            }
                        );
                    }
                );
            }
        );
    });
}
