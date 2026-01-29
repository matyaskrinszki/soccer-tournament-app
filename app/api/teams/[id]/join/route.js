import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../../../lib/db';

initializeDb();

export async function POST(request, context) {
    let teamId = context?.params?.id;
    
    if (!teamId) {
        // Fallback: extract from URL path /api/teams/123/join
        const pathParts = new URL(request.url).pathname.split('/').filter(Boolean);
        const teamsIndex = pathParts.indexOf('teams');
        if (teamsIndex !== -1 && teamsIndex + 1 < pathParts.length) {
            teamId = pathParts[teamsIndex + 1];
        }
    }

    if (!teamId) {
        return NextResponse.json({ error: 'Csapat azonosító hiányzik' }, { status: 400 });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return NextResponse.json({ error: 'Érvénytelen kérés' }, { status: 400 });
    }

    const { playerId } = payload || {};

    if (!playerId) {
        return NextResponse.json({ error: 'Játékos azonosító hiányzik' }, { status: 400 });
    }

    const db = getDb();

    return new Promise((resolve) => {
        db.get('SELECT id FROM teams WHERE id = ?', [teamId], (teamErr, teamRow) => {
            if (teamErr) {
                db.close();
                resolve(NextResponse.json({ error: 'Adatbázis hiba történt' }, { status: 500 }));
                return;
            }

            if (!teamRow) {
                db.close();
                resolve(NextResponse.json({ error: 'A csapat nem található' }, { status: 404 }));
                return;
            }

            db.get('SELECT id, team_id FROM players WHERE id = ?', [playerId], (playerErr, playerRow) => {
                if (playerErr) {
                    db.close();
                    resolve(NextResponse.json({ error: 'Adatbázis hiba történt' }, { status: 500 }));
                    return;
                }

                if (!playerRow) {
                    db.close();
                    resolve(NextResponse.json({ error: 'A játékos nem található' }, { status: 404 }));
                    return;
                }

                if (playerRow.team_id) {
                    db.close();
                    resolve(NextResponse.json({ error: 'Már tagsz egy csapatnak' }, { status: 400 }));
                    return;
                }

                db.run('UPDATE players SET team_id = ? WHERE id = ?', [teamId, playerId], (updateErr) => {
                    db.close();
                    if (updateErr) {
                        resolve(NextResponse.json({ error: 'Nem sikerült a csapathoz csatlakozni' }, { status: 500 }));
                        return;
                    }

                    resolve(NextResponse.json({ success: true }, { status: 200 }));
                });
            });
        });
    });
}
