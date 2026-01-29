import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, initializeDb } from '../../../../lib/db';
import { validateAuth } from '../../../../lib/validation';

initializeDb();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        // Validate input using shared utility
        const emailError = validateAuth.email(email);
        if (emailError) {
            return NextResponse.json(
                { error: emailError },
                { status: 400 }
            );
        }

        const passwordError = validateAuth.password(password);
        if (passwordError) {
            return NextResponse.json(
                { error: passwordError },
                { status: 400 }
            );
        }

        const db = getDb();

        return new Promise((resolve) => {
            db.get('SELECT id, password FROM players WHERE email = ?', [email], async (err, row) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: 'Adatbázis hiba történt' },
                            { status: 500 }
                        )
                    );
                    return;
                }

                if (!row) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: 'Hibás email cím vagy jelszó' },
                            { status: 401 }
                        )
                    );
                    return;
                }

                // Check password
                const passwordMatch = await bcrypt.compare(password, row.password);
                if (!passwordMatch) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: 'Hibás email cím vagy jelszó' },
                            { status: 401 }
                        )
                    );
                    return;
                }

                const token = jwt.sign(
                    { playerId: row.id, userId: row.id, email },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                db.close();
                resolve(
                    NextResponse.json(
                        { success: true, token, email, playerId: row.id },
                        { status: 200 }
                    )
                );
            });
        });
    } catch (err) {
        return NextResponse.json(
            { error: 'Szerverhiba történt' },
            { status: 500 }
        );
    }
}
