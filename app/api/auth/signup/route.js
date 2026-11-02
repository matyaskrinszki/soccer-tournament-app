import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "../../../../lib/db";
import { validateAuth } from "../../../../lib/validation";
import { signToken } from "../../../../lib/auth";

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        // Validate input using shared utility
        const emailError = validateAuth.email(email);
        if (emailError) {
            return NextResponse.json({ error: emailError }, { status: 400 });
        }

        const passwordError = validateAuth.password(password);
        if (passwordError) {
            return NextResponse.json({ error: passwordError }, { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Get database
        const db = getDb();

        // Check if player exists
        return new Promise((resolve) => {
            db.get(
                "SELECT id FROM players WHERE email = ?",
                [email],
                (err, row) => {
                    if (err) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Adatbázis hiba történt" },
                                { status: 500 },
                            ),
                        );
                        return;
                    }

                    if (row) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                {
                                    error: "Ez az email cím már regisztrálva van",
                                },
                                { status: 400 },
                            ),
                        );
                        return;
                    }

                    // Create player
                    db.run(
                        "INSERT INTO players (email, password, name, team_id) VALUES (?, ?, ?, NULL)",
                        [email, hashedPassword, email.split("@")[0]],
                        function (err) {
                            if (err) {
                                db.close();
                                resolve(
                                    NextResponse.json(
                                        {
                                            error: "Nem sikerült létrehozni a játékost",
                                        },
                                        { status: 500 },
                                    ),
                                );
                                return;
                            }

                            // Create JWT token with playerId and role (new users are 'Player' by default)
                            const token = signToken(
                                {
                                    playerId: this.lastID,
                                    userId: this.lastID,
                                    email,
                                    role: "Player",
                                }
                            );

                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        success: true,
                                        token,
                                        email,
                                        playerId: this.lastID,
                                        role: "Player",
                                    },
                                    { status: 201 },
                                ),
                            );
                        },
                    );
                },
            );
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Szerverhiba történt" },
            { status: 500 },
        );
    }
}
