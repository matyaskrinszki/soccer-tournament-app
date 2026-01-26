import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../../lib/db';

initializeDb();

export async function GET(request, context) {
    const idFromParams = context?.params?.id;
    const idFromPath = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    const id = idFromParams ?? idFromPath;

    if (!id) {
        return NextResponse.json({ error: 'A játékos azonosító hiányzik' }, { status: 400 });
    }

    return new Promise((resolve) => {
        const db = getDb();
        db.get(
            `SELECT p.id, p.name, p.position, t.id as teamId, t.name as teamName, l.name as leagueName
             FROM players p
             JOIN teams t ON t.id = p.team_id
             JOIN leagues l ON l.id = t.league_id
             WHERE p.id = ?`,
            [id],
            (err, row) => {
                if (err) {
                    db.close();
                    resolve(NextResponse.json({ error: 'Hiba történt a játékos lekérdezésekor' }, { status: 500 }));
                    return;
                }

                if (!row) {
                    db.close();
                    resolve(NextResponse.json({ error: 'A játékos nem található' }, { status: 404 }));
                    return;
                }

                db.get(
                    `SELECT COUNT(*) as goals FROM goals WHERE player_id = ?`,
                    [id],
                    (goalErr, goalRow) => {
                        db.close();
                        if (goalErr) {
                            resolve(NextResponse.json({ error: 'Hiba történt a gólok lekérdezésekor' }, { status: 500 }));
                            return;
                        }

                        resolve(
                            NextResponse.json(
                                {
                                    player: {
                                        id: row.id,
                                        name: row.name,
                                        position: row.position,
                                        team: {
                                            id: row.teamId,
                                            name: row.teamName,
                                            leagueName: row.leagueName,
                                        },
                                        goals: goalRow?.goals ?? 0,
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
