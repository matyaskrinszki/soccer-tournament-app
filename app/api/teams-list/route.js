import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../lib/db';

initializeDb();

export async function GET(request) {
    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT t.id, t.name, t.league_id, t.captain_player_id, t.matches, t.wins, t.draws, t.losses, t.points, 
                    l.name as leagueName, l.country as leagueCountry,
                    p.name as captainName
             FROM teams t
             JOIN leagues l ON l.id = t.league_id
             LEFT JOIN players p ON p.id = t.captain_player_id
             ORDER BY t.name COLLATE NOCASE ASC`,
            [],
            (err, rows) => {
                db.close();
                if (err) {
                    resolve(NextResponse.json({ error: 'Hiba történt a csapatok lekérdezésekor' }, { status: 500 }));
                    return;
                }

                const teams = (rows || []).map((row) => ({
                    id: row.id,
                    name: row.name,
                    leagueId: row.league_id,
                    leagueName: row.leagueName,
                    leagueCountry: row.leagueCountry,
                    captainPlayerId: row.captain_player_id,
                    captainName: row.captainName,
                    matches: row.matches,
                    wins: row.wins,
                    draws: row.draws,
                    losses: row.losses,
                    points: row.points,
                }));

                resolve(NextResponse.json({ teams }, { status: 200 }));
            }
        );
    });
}
