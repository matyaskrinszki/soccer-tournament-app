import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db";
import { requireAuth } from "../../../../../lib/auth";

export async function GET(request) {
    try {
        const user = await requireAuth(request);
        if (user instanceof NextResponse) return user;
        const playerId = user.playerId;

        return new Promise((resolve) => {
            const db = getDb();

            // Get teams where this player is the captain
            db.all(
                `SELECT t.id, t.name, t.league_id, l.name as league_name
                FROM teams t
                LEFT JOIN leagues l ON l.id = t.league_id
                WHERE t.captain_player_id = ?
                ORDER BY t.name`,
                [playerId],
                (err, rows) => {
                    db.close();
                    if (err) {
                        console.error("Database error:", err);
                        return resolve(
                            NextResponse.json(
                                {
                                    error: "Hiba történt a csapatok lekérdezésekor",
                                },
                                { status: 500 },
                            ),
                        );
                    }

                    resolve(NextResponse.json(rows || [], { status: 200 }));
                },
            );
        });
    } catch (err) {
        console.error("Error:", err);
        return NextResponse.json(
            { error: "Szerverhiba történt" },
            { status: 500 },
        );
    }
}
