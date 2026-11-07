import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { resolveDisplaySeason } from "../../../lib/seasons";
import { getSeasonStatistics } from "../../../lib/statistics";

/**
 * Statistics of one season.
 * GET /api/statistics?seasonId= -> { season, seasons, ...statistics }
 * Without seasonId the default season is used (see lib/seasons.js).
 */
export async function GET(request) {
    try {
        const db = getDatabase();
        const seasonId = new URL(request.url).searchParams.get("seasonId");

        const resolved = resolveDisplaySeason(db, seasonId);
        if (!resolved.ok) {
            return jsonError(resolved.status, resolved.error);
        }

        const { season, seasons } = resolved;
        const statistics = season ? getSeasonStatistics(db, season.id) : null;

        return NextResponse.json({ season, seasons, ...statistics });
    } catch (err) {
        return serverError(err);
    }
}
