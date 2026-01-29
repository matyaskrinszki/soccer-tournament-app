import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb, initializeDb } from '../../../../lib/db';
import { validateAuth } from '../../../../lib/validation';

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
            `SELECT p.id, p.name, p.email, t.id as teamId, t.name as teamName, l.name as leagueName
             FROM players p
             LEFT JOIN teams t ON t.id = p.team_id
             LEFT JOIN leagues l ON l.id = t.league_id
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
                                        email: row.email,
                                        team: row.teamId ? {
                                            id: row.teamId,
                                            name: row.teamName,
                                            leagueName: row.leagueName,
                                        } : null,
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

export async function PUT(request, context) {
    const idFromParams = context?.params?.id;
    const idFromPath = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    const id = idFromParams ?? idFromPath;

    if (!id) {
        return NextResponse.json({ error: 'A játékos azonosító hiányzik' }, { status: 400 });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return NextResponse.json({ error: 'Érvénytelen kérés' }, { status: 400 });
    }

    const { email, password } = payload || {};

    if (!email && !password) {
        return NextResponse.json({ error: 'Nincs frissítendő adat' }, { status: 400 });
    }

    if (email) {
        const emailError = validateAuth.email(email);
        if (emailError) {
            return NextResponse.json({ error: emailError }, { status: 400 });
        }
    }

    if (password) {
        const passwordError = validateAuth.password(password);
        if (passwordError) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }
    }

    const db = getDb();

    return new Promise((resolve) => {
        db.get('SELECT id, email FROM players WHERE id = ?', [id], async (err, row) => {
            if (err) {
                db.close();
                resolve(NextResponse.json({ error: 'Adatbázis hiba történt' }, { status: 500 }));
                return;
            }

            if (!row) {
                db.close();
                resolve(NextResponse.json({ error: 'A játékos nem található' }, { status: 404 }));
                return;
            }

            const emailToUpdate = email?.trim();
            const emailChanged = emailToUpdate && emailToUpdate !== row.email;

            const updatePlayer = async () => {
                let hashedPassword = null;
                if (password) {
                    hashedPassword = await bcrypt.hash(password, 10);
                }

                db.run(
                    'UPDATE players SET email = COALESCE(?, email), password = COALESCE(?, password) WHERE id = ?',
                    [emailToUpdate || null, hashedPassword || null, id],
                    (updateErr) => {
                        if (updateErr) {
                            db.close();
                            resolve(NextResponse.json({ error: 'Nem sikerült frissíteni az adatokat' }, { status: 500 }));
                            return;
                        }

                        db.get('SELECT id, email FROM players WHERE id = ?', [id], (fetchErr, updatedRow) => {
                            db.close();
                            if (fetchErr) {
                                resolve(NextResponse.json({ error: 'Nem sikerült lekérdezni a frissített adatokat' }, { status: 500 }));
                                return;
                            }

                            resolve(NextResponse.json({ success: true, player: updatedRow }, { status: 200 }));
                        });
                    }
                );
            };

            if (emailChanged) {
                db.get('SELECT id FROM players WHERE email = ? AND id != ?', [emailToUpdate, id], (emailErr, emailRow) => {
                    if (emailErr) {
                        db.close();
                        resolve(NextResponse.json({ error: 'Adatbázis hiba történt' }, { status: 500 }));
                        return;
                    }

                    if (emailRow) {
                        db.close();
                        resolve(NextResponse.json({ error: 'Ez az email cím már foglalt' }, { status: 400 }));
                        return;
                    }

                    updatePlayer();
                });
            } else {
                updatePlayer();
            }
        });
    });
}
