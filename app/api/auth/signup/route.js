import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { validateAuth } from "../../../../lib/validation";
import { signToken } from "../../../../lib/auth";

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        // Validate input using shared utility
        const emailError = validateAuth.email(email);
        if (emailError) {
            return jsonError(400, emailError);
        }

        const passwordError = validateAuth.password(password);
        if (passwordError) {
            return jsonError(400, passwordError);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create player; the UNIQUE constraint on email rejects duplicates
        let playerId;
        try {
            const result = getDatabase()
                .prepare(
                    "INSERT INTO players (email, password, name, team_id) VALUES (?, ?, ?, NULL)",
                )
                .run(email, hashedPassword, email.split("@")[0]);
            playerId = Number(result.lastInsertRowid);
        } catch (err) {
            if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return jsonError(400, "Ez az email cím már regisztrálva van");
            }
            console.error(err);
            return jsonError(500, "Nem sikerült létrehozni a játékost");
        }

        // Create JWT token with playerId and role (new users are 'Player' by default)
        const token = signToken({
            playerId,
            userId: playerId,
            email,
            role: "Player",
        });

        return NextResponse.json(
            {
                success: true,
                token,
                email,
                playerId,
                role: "Player",
            },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}
