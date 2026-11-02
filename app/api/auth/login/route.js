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

        const row = getDatabase()
            .prepare("SELECT id, password, role FROM players WHERE email = ?")
            .get(email);

        // Check password
        if (!row || !(await bcrypt.compare(password, row.password))) {
            return jsonError(401, "Hibás email cím vagy jelszó");
        }

        const token = signToken({
            playerId: row.id,
            userId: row.id,
            email,
            role: row.role,
        });

        return NextResponse.json(
            {
                success: true,
                token,
                email,
                playerId: row.id,
                role: row.role,
            },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}
