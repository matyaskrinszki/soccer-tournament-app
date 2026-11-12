import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { validateAuth } from "../../../../lib/validation";
import { getUserFromRequest, getPlayerById, requireAuth, canAccessPlayerResource } from "../../../../lib/auth";
import { getPlayerStats } from "../../../../lib/player-stats";
import { getPlayerBadges } from "../../../../lib/badges";

export async function GET(request, context) {
    const { id } = await context.params;

    if (!id) {
        return jsonError(400, "A játékos azonosító hiányzik");
    }

    const user = getUserFromRequest(request);

    let failMessage = "Hiba történt a játékos lekérdezésekor";
    try {
        if (user) {
            user.role = getPlayerById(user.playerId)?.role ?? null;
        }

        const db = getDatabase();

        const row = db
            .prepare(
                `SELECT p.id, p.name, p.email, t.id as teamId, t.name as teamName, l.name as leagueName
                 FROM players p
                 LEFT JOIN teams t ON t.id = p.team_id
                 LEFT JOIN leagues l ON l.id = t.league_id
                 WHERE p.id = ?`,
            )
            .get(id);

        if (!row) {
            return jsonError(404, "A játékos nem található");
        }

        const protectedEmail = canAccessPlayerResource(user, parseInt(id)) ? row.email : null;

        failMessage = "Hiba történt a statisztikák lekérdezésekor";
        const statsResult = getPlayerStats(db, row.id);
        if (!statsResult.ok) {
            return jsonError(statsResult.status, statsResult.error);
        }

        failMessage = "Hiba történt a kitűzők lekérdezésekor";
        const badgesResult = getPlayerBadges(db, row.id);
        if (!badgesResult.ok) {
            return jsonError(badgesResult.status, badgesResult.error);
        }
        // Everyone gets the badges shown on the public profile; only the player
        // themself gets the hidden ones too, with the setting
        const isSelf = user != null && user.playerId === row.id;

        return NextResponse.json(
            {
                player: {
                    id: row.id,
                    name: row.name,
                    email: protectedEmail,
                    team: row.teamId ? { id: row.teamId, name: row.teamName, leagueName: row.leagueName } : null,
                    goals: statsResult.stats.totalGoals,
                    stats: statsResult.stats,
                    badges: badgesResult.badges
                        .filter((badge) => badge.visible)
                        .map(({ visible, ...badge }) => badge),
                    allBadges: isSelf ? badgesResult.badges : null,
                },
            },
            { status: 200 },
        );
    } catch (err) {
        console.error(err);
        return jsonError(500, failMessage);
    }
}

export async function PUT(request, context) {
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;

    if (!id) {
        return jsonError(400, "A játékos azonosító hiányzik");
    }

    if (!canAccessPlayerResource(user, parseInt(id))) {
        return jsonError(403, "Csak a saját profilodat frissítheted");
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const { email, password } = payload || {};

    if (!email && !password) {
        return jsonError(400, "Nincs frissítendő adat");
    }

    if (email) {
        const emailError = validateAuth.email(email);
        if (emailError) {
            return jsonError(400, emailError);
        }
    }

    if (password) {
        const passwordError = validateAuth.password(password);
        if (passwordError) {
            return jsonError(400, passwordError);
        }
    }

    try {
        const db = getDatabase();

        const row = db
            .prepare("SELECT id FROM players WHERE id = ?")
            .get(id);
        if (!row) {
            return jsonError(404, "A játékos nem található");
        }

        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

        // The UNIQUE constraint on email rejects addresses used by another player
        try {
            db.prepare(
                "UPDATE players SET email = COALESCE(?, email), password = COALESCE(?, password) WHERE id = ?",
            ).run(email?.trim() || null, hashedPassword, id);
        } catch (err) {
            if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return jsonError(400, "Ez az email cím már foglalt");
            }
            console.error(err);
            return jsonError(500, "Nem sikerült frissíteni az adatokat");
        }

        let updatedRow;
        try {
            updatedRow = db
                .prepare("SELECT id, email FROM players WHERE id = ?")
                .get(id);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Nem sikerült lekérdezni a frissített adatokat");
        }

        return NextResponse.json(
            { success: true, player: updatedRow },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}
