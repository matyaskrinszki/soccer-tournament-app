import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import {
    requireCaptainOrAdmin,
    isCaptainOfTeam,
} from "../../../../../lib/auth";

export async function POST(request, context) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const teamId = Number(id);

    if (!teamId) {
        return jsonError(400, "A csapat azonosító hiányzik");
    }

    if (user.role !== "Admin") {
        const captainCheck = await isCaptainOfTeam(user, teamId);
        if (!captainCheck) {
            return jsonError(
                403,
                "Csak a csapatkapitány távolíthat el játékost",
            );
        }
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const playerId = Number(payload?.playerId);
    if (!playerId) {
        return jsonError(400, "A játékos azonosító hiányzik");
    }

    try {
        const db = getDatabase();

        const teamRow = db
            .prepare("SELECT captain_player_id FROM teams WHERE id = ?")
            .get(teamId);
        if (!teamRow) {
            return jsonError(404, "A csapat nem található");
        }

        if (Number(teamRow.captain_player_id) === playerId) {
            return jsonError(400, "A csapatkapitány nem távolítható el");
        }

        let result;
        try {
            result = db
                .prepare(
                    "UPDATE players SET team_id = NULL, role = CASE WHEN role = 'Captain' THEN 'Player' ELSE role END WHERE id = ? AND team_id = ?",
                )
                .run(playerId, teamId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Nem sikerült eltávolítani a játékost");
        }

        if (result.changes === 0) {
            return jsonError(404, "A játékos nem tagja ennek a csapatnak");
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
