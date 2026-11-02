import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";

export async function GET() {
    let db;
    let leagues;
    try {
        db = getDatabase();
        leagues = db
            .prepare("SELECT id, name, country FROM leagues ORDER BY name")
            .all();
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a bajnokságok betöltésekor");
    }

    try {
        // For each league, get its teams
        const teamsByLeague = db.prepare(
            "SELECT id, name, matches, wins, draws, losses, points FROM teams WHERE league_id = ? ORDER BY points DESC, name ASC",
        );

        const leaguesWithTeams = leagues.map((league) => ({
            id: league.id,
            name: league.name,
            country: league.country,
            teams: teamsByLeague.all(league.id),
        }));

        return NextResponse.json({ leagues: leaguesWithTeams });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a csapatok betöltésekor");
    }
}
