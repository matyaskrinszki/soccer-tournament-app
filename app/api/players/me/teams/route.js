import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getDb, initializeDb } from "../../../../../lib/db";

initializeDb();

export async function GET(request) {
    try {
        // Get token from Authorization header
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json(
                { error: "Hiányzik az autentikációs token" },
                { status: 401 },
            );
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "mysupersecretkey",
        );
        const playerId = decoded.playerId;
        console.log(`[teams] Decoded playerId: ${playerId}`);

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
                    console.log(
                        `[teams] Found ${rows?.length || 0} teams for playerId ${playerId}`,
                    );
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
            { error: "Autentikációs hiba" },
            { status: 401 },
        );
    }
}
