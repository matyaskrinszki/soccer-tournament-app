import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { resolveDisplaySeason } from "../../../lib/seasons";
import { getSeasonStandings } from "../../../lib/standings";

/**
 * League tables of one season.
 * GET /api/standings?seasonId= -> { season, seasons, leagues }
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
        const leagues = season ? getSeasonStandings(db, season.id) : [];

        return NextResponse.json({ season, seasons, leagues });
    } catch (err) {
        return serverError(err);
    }
}
