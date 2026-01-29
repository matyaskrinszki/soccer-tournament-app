import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../lib/db';

initializeDb();

export async function POST(request) {
    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return NextResponse.json({ error: 'Érvénytelen kérés' }, { status: 400 });
    }

    const { name, leagueId, playerId } = payload || {};

    if (!name || !leagueId || !playerId) {
        return NextResponse.json({ error: 'Hiányzó adatok' }, { status: 400 });
    }

    const db = getDb();

    return new Promise((resolve) => {
        db.get('SELECT id FROM leagues WHERE id = ?', [leagueId], (leagueErr, leagueRow) => {
            if (leagueErr) {
                db.close();
                resolve(NextResponse.json({ error: 'Adatbázis hiba történt' }, { status: 500 }));
                return;
            }

            if (!leagueRow) {
                db.close();
                resolve(NextResponse.json({ error: 'A liga nem található' }, { status: 404 }));
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
                    resolve(NextResponse.json({ error: 'Csak csapat nélküli játékos hozhat létre új csapatot' }, { status: 400 }));
                    return;
                }

                db.run(
                    'INSERT INTO teams (name, league_id, captain_player_id, matches, wins, draws, losses, points) VALUES (?, ?, ?, 0, 0, 0, 0, 0)',
                    [name.trim(), leagueId, playerId],
                    function (teamErr) {
                        if (teamErr) {
                            db.close();
                            resolve(NextResponse.json({ error: 'Nem sikerült létrehozni a csapatot' }, { status: 500 }));
                            return;
                        }

                        const newTeamId = this.lastID;
                        db.run('UPDATE players SET team_id = ? WHERE id = ?', [newTeamId, playerId], (updateErr) => {
                            db.close();
                            if (updateErr) {
                                resolve(NextResponse.json({ error: 'Nem sikerült a játékost a csapathoz rendelni' }, { status: 500 }));
                                return;
                            }

                            resolve(NextResponse.json({ success: true, teamId: newTeamId }, { status: 201 }));
                        });
                    }
                );
            });
        });
    });
}
