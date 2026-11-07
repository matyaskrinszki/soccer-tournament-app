import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";
import { listDisplaySeasons } from "../../../lib/seasons";
import { getSeasonStandings } from "../../../lib/standings";

/**
 * Every team with its league and captain. `stats` is the team's table row in the
 * default season (see lib/seasons.js), or null if it has no match in that season.
 * GET /api/teams-list -> { season, teams }
 */
export async function GET() {
    try {
        const db = getDatabase();
        const rows = db
            .prepare(
                `SELECT t.id, t.name, t.league_id, t.captain_player_id,
                        l.name as leagueName, l.country as leagueCountry,
                        p.name as captainName
                 FROM teams t
                 JOIN leagues l ON l.id = t.league_id
                 LEFT JOIN players p ON p.id = t.captain_player_id
                 ORDER BY t.name COLLATE NOCASE ASC`,
            )
            .all();

        const [season = null] = listDisplaySeasons(db);
        const statsByTeam = new Map(
            (season ? getSeasonStandings(db, season.id) : [])
                .flatMap((league) => league.teams)
                .map((team) => [team.id, team]),
        );

        const teams = rows.map((row) => ({
            id: row.id,
            name: row.name,
            leagueId: row.league_id,
            leagueName: row.leagueName,
            leagueCountry: row.leagueCountry,
            captainPlayerId: row.captain_player_id,
            captainName: row.captainName,
            stats: statsByTeam.get(row.id) ?? null,
        }));

        return NextResponse.json({ season, teams }, { status: 200 });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a csapatok lekérdezésekor");
    }
}
