import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireAuth } from "../../../../../lib/auth";
import { getReportForm, submitMatchReport } from "../../../../../lib/match-reports";

/**
 * The logged-in captain's result report for a match, with their team's players.
 * GET -> { isCaptain: false } | { isCaptain: true, canReport, reason, state, team,
 *     report, otherTeamReported }
 */
export async function GET(request, context) {
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const matchId = await parseMatchId(context);
    if (matchId === null) {
        return jsonError(400, "Érvénytelen mérkőzés azonosító");
    }

    try {
        const result = getReportForm(getDatabase(), matchId, user.playerId);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        const { ok, ...form } = result;
        return NextResponse.json(form);
    } catch (err) {
        return serverError(err);
    }
}

/**
 * Submit or change the captain's report. When both teams agree, the result is
 * recorded; when they differ, the admin decides.
 * PUT { homeScore, awayScore, scorers: [{ playerId, goals }] }
 *     -> { outcome: "waiting" | "finalized" | "mismatch", report, finalizeError? }
 */
export async function PUT(request, context) {
    const user = await requireAuth(request);
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
        const result = submitMatchReport(getDatabase(), matchId, user.playerId, body);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        const { ok, ...rest } = result;
        return NextResponse.json(rest);
    } catch (err) {
        return serverError(err);
    }
}

async function parseMatchId(context) {
    const { id } = await context.params;
    const matchId = Number(id);
    return Number.isInteger(matchId) ? matchId : null;
}
