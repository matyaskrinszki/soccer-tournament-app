import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireAuth } from "../../../../../lib/auth";
import { sortByName } from "../../../../../lib/sort";

export async function GET(request) {
    try {
        const user = await requireAuth(request);
        if (user instanceof NextResponse) return user;
        const playerId = user.playerId;

        let rows;
        try {
            // Get teams where this player is the captain
            rows = getDatabase()
                .prepare(
                    `SELECT t.id, t.name, t.league_id, l.name as league_name
                    FROM teams t
                    LEFT JOIN leagues l ON l.id = t.league_id
                    WHERE t.captain_player_id = ?`,
                )
                .all(playerId);
        } catch (err) {
            console.error("Database error:", err);
            return jsonError(500, "Hiba történt a csapatok lekérdezésekor");
        }

        return NextResponse.json(sortByName(rows), { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
