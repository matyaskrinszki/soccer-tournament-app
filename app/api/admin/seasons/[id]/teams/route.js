import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../../lib/database";
import { jsonError, serverError } from "../../../../../../lib/api";
import { requireAdmin } from "../../../../../../lib/auth";
import {
    MIN_PLAYERS_TO_REGISTER,
    listSeasonTeams,
} from "../../../../../../lib/season-registration";

/**
 * Every team with its player count and registration for the season.
 * Registering and withdrawing go through /api/teams/[id]/seasons.
 * GET -> { minPlayers, teams: [{ id, name, leagueId, leagueName, playerCount, registered }] }
 */
export async function GET(request, context) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const seasonId = Number(id);
    if (!Number.isInteger(seasonId)) {
        return jsonError(400, "Érvénytelen szezon azonosító");
    }

    try {
        const db = getDatabase();
        if (!db.prepare("SELECT 1 FROM seasons WHERE id = ?").get(seasonId)) {
            return jsonError(404, "Szezon nem található");
        }
        return NextResponse.json({
            minPlayers: MIN_PLAYERS_TO_REGISTER,
            teams: listSeasonTeams(db, seasonId),
        });
    } catch (err) {
        return serverError(err);
    }
}
