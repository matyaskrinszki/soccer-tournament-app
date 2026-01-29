import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../lib/db';

initializeDb();

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    return new Promise((resolve) => {
        const db = getDb();

        if (email) {
            db.get(
                `SELECT p.id, p.name, p.email, t.id as teamId, t.name as teamName, l.name as leagueName
                 FROM players p
                 LEFT JOIN teams t ON t.id = p.team_id
                 LEFT JOIN leagues l ON l.id = t.league_id
                 WHERE p.email = ?`,
                [email],
                (err, row) => {
                    db.close();
                    if (err) {
                        resolve(NextResponse.json({ error: 'Hiba történt a játékos lekérdezésekor' }, { status: 500 }));
                        return;
                    }

                    if (!row) {
                        resolve(NextResponse.json({ error: 'A játékos nem található' }, { status: 404 }));
                        return;
                    }

                    resolve(
                        NextResponse.json(
                            {
                                player: {
                                    id: row.id,
                                    name: row.name,
                                    email: row.email,
                                    team: row.teamId
                                        ? {
                                              id: row.teamId,
                                              name: row.teamName,
                                              leagueName: row.leagueName,
                                          }
                                        : null,
                                },
                            },
                            { status: 200 }
                        )
                    );
                }
            );
            return;
        }

        db.all(
            `SELECT p.id, p.name, p.email, t.id as teamId, t.name as teamName, l.name as leagueName
             FROM players p
             LEFT JOIN teams t ON t.id = p.team_id
             LEFT JOIN leagues l ON l.id = t.league_id
             ORDER BY p.name COLLATE NOCASE ASC`,
            [],
            (err, rows) => {
                db.close();
                if (err) {
                    resolve(NextResponse.json({ error: 'Hiba történt a játékosok lekérdezésekor' }, { status: 500 }));
                    return;
                }

                const players = (rows || []).map((row) => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    team: row.teamId
                        ? {
                              id: row.teamId,
                              name: row.teamName,
                              leagueName: row.leagueName,
                          }
                        : null,
                }));

                resolve(NextResponse.json({ players }, { status: 200 }));
            }
        );
    });
}
