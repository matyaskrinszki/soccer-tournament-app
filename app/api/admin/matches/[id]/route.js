import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireAdmin } from "../../../../../lib/auth";
import { recordMatchResult } from "../../../../../lib/match-results";

/**
 * Record (or correct) the final score of a match.
 * PUT { homeScore, awayScore } -> { match }
 */
export async function PUT(request, context) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const matchId = Number(id);
    if (!Number.isInteger(matchId)) {
        return jsonError(400, "Érvénytelen mérkőzés azonosító");
    }

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    try {
        const result = recordMatchResult(getDatabase(), matchId, body);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        return NextResponse.json({ match: result.match });
    } catch (err) {
        return serverError(err);
    }
}
