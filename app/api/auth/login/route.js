import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, initializeDb } from "../../../../lib/db";
import { validateAuth } from "../../../../lib/validation";
import { signToken } from "../../../../lib/auth";

initializeDb();

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

        const db = getDb();

        return new Promise((resolve) => {
            db.get(
                "SELECT id, password, role FROM players WHERE email = ?",
                [email],
                async (err, row) => {
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

                    if (!row) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Hibás email cím vagy jelszó" },
                                { status: 401 },
                            ),
                        );
                        return;
                    }

                    // Check password
                    const passwordMatch = await bcrypt.compare(
                        password,
                        row.password,
                    );
                    if (!passwordMatch) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                { error: "Hibás email cím vagy jelszó" },
                                { status: 401 },
                            ),
                        );
                        return;
                    }

                    const token = signToken(
                        {
                            playerId: row.id,
                            userId: row.id,
                            email,
                            role: row.role,
                        }
                    );

                    db.close();
                    resolve(
                        NextResponse.json(
                            {
                                success: true,
                                token,
                                email,
                                playerId: row.id,
                                role: row.role,
                            },
                            { status: 200 },
                        ),
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
