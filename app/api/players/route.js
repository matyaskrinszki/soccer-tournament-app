import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";

export async function GET(request) {
    try {
        const rows = getDatabase()
            .prepare(
                `SELECT p.id, p.name, t.id as teamId, t.name as teamName, l.name as leagueName
                 FROM players p
                 LEFT JOIN teams t ON t.id = p.team_id
                 LEFT JOIN leagues l ON l.id = t.league_id
                 ORDER BY p.name COLLATE NOCASE ASC`,
            )
            .all();

        const players = rows.map((row) => ({
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

        return NextResponse.json({ players }, { status: 200 });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a játékosok lekérdezésekor");
    }
}
