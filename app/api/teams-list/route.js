import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";

export async function GET() {
    try {
        const rows = getDatabase()
            .prepare(
                `SELECT t.id, t.name, t.league_id, t.captain_player_id, t.matches, t.wins, t.draws, t.losses, t.points,
                        l.name as leagueName, l.country as leagueCountry,
                        p.name as captainName
                 FROM teams t
                 JOIN leagues l ON l.id = t.league_id
                 LEFT JOIN players p ON p.id = t.captain_player_id
                 ORDER BY t.name COLLATE NOCASE ASC`,
            )
            .all();

        const teams = rows.map((row) => ({
            id: row.id,
            name: row.name,
            leagueId: row.league_id,
            leagueName: row.leagueName,
            leagueCountry: row.leagueCountry,
            captainPlayerId: row.captain_player_id,
            captainName: row.captainName,
            matches: row.matches,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            points: row.points,
        }));

        return NextResponse.json({ teams }, { status: 200 });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a csapatok lekérdezésekor");
    }
}
