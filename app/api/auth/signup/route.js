import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, initializeDb } from '../../../../lib/db';

initializeDb();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        // Validate input
        if (!email || !password) {
            return NextResponse.json(
                { error: 'Az email cím és a jelszó megadása kötelező' },
                { status: 400 }
            );
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Érvénytelen email cím formátum' },
                { status: 400 }
            );
        }

        // Password validation
        if (password.length < 8) {
            return NextResponse.json(
                { error: 'A jelszónak legalább 8 karakter hosszúnak kell lennie' },
                { status: 400 }
            );
        }

        if (!/[A-Z]/.test(password)) {
            return NextResponse.json(
                { error: 'A jelszónak tartalmaznia kell legalább egy nagybetűt' },
                { status: 400 }
            );
        }

        if (!/[a-z]/.test(password)) {
            return NextResponse.json(
                { error: 'A jelszónak tartalmaznia kell legalább egy kisbetűt' },
                { status: 400 }
            );
        }

        if (!/[0-9]/.test(password)) {
            return NextResponse.json(
                { error: 'A jelszónak tartalmaznia kell legalább egy számot' },
                { status: 400 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Get database
        const db = getDb();

        // Check if user exists
        return new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
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

                if (row) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: 'Ez az email cím már regisztrálva van' },
                            { status: 400 }
                        )
                    );
                    return;
                }

                // Create user
                db.run(
                    'INSERT INTO users (email, password) VALUES (?, ?)',
                    [email, hashedPassword],
                    function (err) {
                        if (err) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { error: 'Nem sikerült létrehozni a felhasználót' },
                                    { status: 500 }
                                )
                            );
                            return;
                        }

                        // Create JWT token
                        const token = jwt.sign(
                            { userId: this.lastID, email },
                            JWT_SECRET,
                            { expiresIn: '7d' }
                        );

                        db.close();
                        resolve(
                            NextResponse.json(
                                { success: true, token, email },
                                { status: 201 }
                            )
                        );
                    }
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
