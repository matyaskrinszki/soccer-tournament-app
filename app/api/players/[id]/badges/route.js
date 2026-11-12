import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { requireAuth } from "../../../../../lib/auth";
import { setBadgeVisibility } from "../../../../../lib/badges";

/**
 * Show or hide one of the logged-in player's badges on their public profile. Only
 * the player themself may change it, not an admin: it's their choice.
 * PUT { badgeId, visible } -> { badges: [{ id, name, description, visible }] }
 */
export async function PUT(request, context) {
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const playerId = Number(id);
    if (!Number.isInteger(playerId)) {
        return jsonError(400, "Érvénytelen játékos azonosító");
    }
    if (user.playerId !== playerId) {
        return jsonError(403, "Csak a saját kitűzőid láthatóságát állíthatod be");
    }

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    try {
        const result = setBadgeVisibility(getDatabase(), playerId, body?.badgeId, body?.visible);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        return NextResponse.json({ badges: result.badges });
    } catch (err) {
        return serverError(err);
    }
}
