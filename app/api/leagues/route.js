import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { serverError } from "../../../lib/api";
import { sortByName } from "../../../lib/sort";

/**
 * Every league with its current teams, e.g. for "create team" and admin dropdowns.
 * League tables are served by /api/standings.
 * GET /api/leagues -> { leagues: [{ id, name, country, teams: [{ id, name }] }] }
 */
export async function GET() {
    try {
        const db = getDatabase();
        const leagues = db
            .prepare("SELECT id, name, country FROM leagues ORDER BY name")
            .all();
        const teamsByLeague = db.prepare(
            "SELECT id, name FROM teams WHERE league_id = ?",
        );

        return NextResponse.json({
            leagues: leagues.map((league) => ({
                ...league,
                teams: sortByName(teamsByLeague.all(league.id)),
            })),
        });
    } catch (err) {
        return serverError(err);
    }
}
