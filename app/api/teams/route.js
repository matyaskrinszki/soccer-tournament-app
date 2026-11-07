import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { requireAuth } from "../../../lib/auth";

export async function POST(request) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const { name, leagueId } = payload || {};

    if (!name || !leagueId) {
        return jsonError(400, "Hiányzó adatok");
    }

    const playerId = user.playerId;

    try {
        const db = getDatabase();

        const leagueRow = db
            .prepare("SELECT id FROM leagues WHERE id = ?")
            .get(leagueId);
        if (!leagueRow) {
            return jsonError(404, "A liga nem található");
        }

        const playerRow = db
            .prepare("SELECT id, team_id FROM players WHERE id = ?")
            .get(playerId);
        if (!playerRow) {
            return jsonError(404, "A játékos nem található");
        }

        if (playerRow.team_id) {
            return jsonError(
                400,
                "Csak csapat nélküli játékos hozhat létre új csapatot",
            );
        }

        // Create the team and make the player its captain atomically
        let failMessage = "Nem sikerült létrehozni a csapatot";
        let newTeamId;
        try {
            db.transaction(() => {
                const result = db
                    .prepare(
                        "INSERT INTO teams (name, league_id, captain_player_id) VALUES (?, ?, ?)",
                    )
                    .run(name.trim(), leagueId, playerId);
                newTeamId = Number(result.lastInsertRowid);

                failMessage = "Nem sikerült a játékost a csapathoz rendelni";
                db.prepare(
                    "UPDATE players SET team_id = ?, role = ? WHERE id = ?",
                ).run(newTeamId, "Captain", playerId);
            })();
        } catch (err) {
            console.error(err);
            return jsonError(500, failMessage);
        }

        return NextResponse.json(
            { success: true, teamId: newTeamId },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}
