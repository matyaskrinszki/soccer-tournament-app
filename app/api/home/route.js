import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError } from "../../../lib/api";
import { getHomeData } from "../../../lib/home";

/**
 * Public home page data.
 * GET /api/home -> { latestResults, nextFixtures, standings }
 */
export async function GET() {
    try {
        return NextResponse.json(getHomeData(getDatabase()));
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba történt a kezdőlap adatainak betöltésekor");
    }
}
