import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { publishSeasonSchedule } from "../../../../lib/publish-schedule";

/**
 * Publish a season's current schedule: copies the scheduled matches into
 * `matches` as upcoming fixtures and sets the season to "active".
 * POST { seasonId }
 */
export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const seasonId = Number(body?.seasonId);
    if (!Number.isInteger(seasonId)) {
        return jsonError(400, "Szezon ID szükséges");
    }

    try {
        const result = publishSeasonSchedule(getDatabase(), seasonId);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }

        return NextResponse.json(
            {
                success: true,
                seasonId,
                seasonName: result.seasonName,
                publishedMatchCount: result.publishedMatchCount,
                leagueCount: result.leagueCount,
            },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}
