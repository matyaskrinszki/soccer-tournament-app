import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";

export async function GET(request) {
    try {
        const matches = getDatabase()
            .prepare(
                `SELECT
                    m.id,
                    m.league_id as leagueId,
                    m.home_team_id as homeTeamId,
                    m.away_team_id as awayTeamId,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    m.match_date as matchDate,
                    m.status,
                    ht.name as homeTeamName,
                    at.name as awayTeamName,
                    l.name as leagueName
                 FROM matches m
                 LEFT JOIN teams ht ON ht.id = m.home_team_id
                 LEFT JOIN teams at ON at.id = m.away_team_id
                 LEFT JOIN leagues l ON l.id = m.league_id
                 ORDER BY m.match_date DESC`,
            )
            .all();

        return NextResponse.json({ matches });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a mérkőzések lekérdezésekor");
    }
}
