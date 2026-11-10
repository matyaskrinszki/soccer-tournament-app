import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireAdmin } from "../../../../../lib/auth";
import { getMatchForResult, recordMatchResult } from "../../../../../lib/match-results";

/**
 * A match with both teams' possible scorers and their recorded goals.
 * GET -> { match }
 */
export async function GET(request, context) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const matchId = await parseMatchId(context);
    if (matchId === null) {
        return jsonError(400, "Érvénytelen mérkőzés azonosító");
    }

    try {
        const match = getMatchForResult(getDatabase(), matchId);
        if (!match) {
            return jsonError(404, "A mérkőzés nem található");
        }
        return NextResponse.json({ match });
    } catch (err) {
        return serverError(err);
    }
}

/**
 * Record (or correct) the final score and the goal scorers of a match. Goals not
 * given to a scorer are credited to the team's captain.
 * PUT { homeScore, awayScore, scorers: [{ teamId, playerId, goals }] } -> { match }
 */
export async function PUT(request, context) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const matchId = await parseMatchId(context);
    if (matchId === null) {
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

async function parseMatchId(context) {
    const { id } = await context.params;
    const matchId = Number(id);
    return Number.isInteger(matchId) ? matchId : null;
}
