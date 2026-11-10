import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { listSeasonMatches } from "../../../../lib/match-results";
import { listSeasonMismatches } from "../../../../lib/match-reports";

/**
 * Published matches of a season, for entering results, and the matches whose
 * captains reported different results.
 * GET /api/admin/matches?seasonId=1 -> { matches, mismatches }
 */
export async function GET(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const seasonId = Number(new URL(request.url).searchParams.get("seasonId"));
    if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return jsonError(400, "Szezon ID szükséges");
    }

    try {
        const db = getDatabase();
        return NextResponse.json({
            matches: listSeasonMatches(db, seasonId),
            mismatches: listSeasonMismatches(db, seasonId),
        });
    } catch (err) {
        return serverError(err);
    }
}
