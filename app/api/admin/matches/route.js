import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { listSeasonMatches } from "../../../../lib/match-results";

/**
 * Published matches of a season, for entering results.
 * GET /api/admin/matches?seasonId=1 -> { matches }
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
        return NextResponse.json({ matches: listSeasonMatches(getDatabase(), seasonId) });
    } catch (err) {
        return serverError(err);
    }
}
