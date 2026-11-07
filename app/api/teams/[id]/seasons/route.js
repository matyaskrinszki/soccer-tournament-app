import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../../../lib/auth";
import {
    getTeamSeasonRegistrations,
    registerTeam,
    unregisterTeam,
} from "../../../../../lib/season-registration";

/**
 * Seasons the team can register for (setup) or is registered for.
 * GET -> { playerCount, minPlayers, seasons: [{ id, name, status, registered }] }
 */
export async function GET(request, context) {
    const { id } = await context.params;
    const teamId = Number(id);
    if (!Number.isInteger(teamId)) {
        return jsonError(400, "Érvénytelen csapat azonosító");
    }

    try {
        const db = getDatabase();
        if (!db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
            return jsonError(404, "A csapat nem található");
        }
        return NextResponse.json(getTeamSeasonRegistrations(db, teamId));
    } catch (err) {
        return serverError(err);
    }
}

/**
 * Register the team for a season in setup. Team captain or admin.
 * POST { seasonId }
 */
export function POST(request, context) {
    return changeRegistration(request, context, registerTeam, 201);
}

/**
 * Withdraw the team from a season in setup. Team captain or admin.
 * DELETE { seasonId }
 */
export function DELETE(request, context) {
    return changeRegistration(request, context, unregisterTeam, 200);
}

async function changeRegistration(request, context, change, successStatus) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const teamId = Number(id);
    if (!Number.isInteger(teamId)) {
        return jsonError(400, "Érvénytelen csapat azonosító");
    }

    if (!(await isCaptainOfTeam(user, teamId))) {
        return jsonError(403, "Csak a csapatkapitány nevezheti a csapatot");
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
        const result = change(getDatabase(), seasonId, teamId);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        return NextResponse.json({ success: true }, { status: successStatus });
    } catch (err) {
        return serverError(err);
    }
}
