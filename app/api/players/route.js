import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request) {
    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT p.id, p.name, t.id as teamId, t.name as teamName, l.name as leagueName
             FROM players p
             LEFT JOIN teams t ON t.id = p.team_id
             LEFT JOIN leagues l ON l.id = t.league_id
             ORDER BY p.name COLLATE NOCASE ASC`,
            [],
            (err, rows) => {
                db.close();
                if (err) {
                    resolve(
                        NextResponse.json(
                            {
                                error: "Hiba történt a játékosok lekérdezésekor",
                            },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                const players = (rows || []).map((row) => ({
                    id: row.id,
                    name: row.name,
                    team: row.teamId
                        ? {
                              id: row.teamId,
                              name: row.teamName,
                              leagueName: row.leagueName,
                          }
                        : null,
                }));

                resolve(NextResponse.json({ players }, { status: 200 }));
            },
        );
    });
}
