import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { serverError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { getAdminStats } from "../../../../lib/admin-stats";

/**
 * Counts for the admin overview.
 * GET /api/admin/stats -> { players, teams, leagues, seasons, activeSeasons,
 *     pendingJoinRequests, matches: { total, finished, upcoming, awaitingResult,
 *     mismatches } }
 */
export async function GET(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        return NextResponse.json(getAdminStats(getDatabase()));
    } catch (err) {
        return serverError(err);
    }
}
