import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../../../lib/db';

initializeDb();

export async function POST(request, context) {
    let teamId = context?.params?.id;

    if (!teamId) {
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

    const { captainId, playerId } = payload || {};

    if (!captainId || !playerId) {
        return NextResponse.json({ error: 'Hiányzó adatok' }, { status: 400 });
    }

    const db = getDb();

    return new Promise((resolve) => {
        db.get('SELECT id, captain_player_id FROM teams WHERE id = ?', [teamId], (teamErr, teamRow) => {
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

            if (Number(teamRow.captain_player_id) !== Number(captainId)) {
                db.close();
                resolve(NextResponse.json({ error: 'Csak a csapatkapitány adhat hozzá játékost' }, { status: 403 }));
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
                    resolve(NextResponse.json({ error: 'A játékos már tagja egy csapatnak' }, { status: 400 }));
                    return;
                }

                db.run('UPDATE players SET team_id = ? WHERE id = ?', [teamId, playerId], (updateErr) => {
                    db.close();
                    if (updateErr) {
                        resolve(NextResponse.json({ error: 'Nem sikerült a játékost a csapathoz adni' }, { status: 500 }));
                        return;
                    }

                    resolve(NextResponse.json({ success: true }, { status: 200 }));
                });
            });
        });
    });
}
