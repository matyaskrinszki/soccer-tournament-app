import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireCaptainOrAdmin } from "../../../../lib/auth";
import { addPlayerToTeam } from "../../../../lib/membership";

export async function POST(request, context) {
    // Require captain or admin role
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id: requestId } = await context.params;

    if (!requestId) {
        return jsonError(400, "Kérés azonosító hiányzik");
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const { action } = payload || {};

    if (!action || !["accept", "reject"].includes(action)) {
        return jsonError(400, "Érvénytelen akció");
    }

    try {
        const db = getDatabase();

        // Get the join request
        const row = db
            .prepare(
                `SELECT jr.id, jr.player_id, jr.team_id, jr.status, t.captain_player_id,
                        p.team_id as player_team_id
                 FROM join_requests jr
                 JOIN teams t ON t.id = jr.team_id
                 JOIN players p ON p.id = jr.player_id
                 WHERE jr.id = ?`,
            )
            .get(requestId);

        if (!row) {
            return jsonError(404, "A kérés nem található");
        }

        // Verify the user is the team captain (admins bypass this check)
        if (
            user.role !== "Admin" &&
            Number(row.captain_player_id) !== Number(user.playerId)
        ) {
            return jsonError(403, "Csak a csapatkapitány kezelheti a kéréseket");
        }

        if (row.status !== "pending") {
            return jsonError(400, "Ez a kérés már kezelve lett");
        }

        if (action === "accept" && row.player_team_id !== null) {
            return jsonError(400, "A játékos már egy csapat tagja");
        }

        // Update the request and, when accepting, the player's team atomically
        let failMessage = "Nem sikerült frissíteni a kérést";
        try {
            db.transaction(() => {
                db.prepare("UPDATE join_requests SET status = ? WHERE id = ?").run(
                    action === "accept" ? "accepted" : "rejected",
                    requestId,
                );

                if (action === "accept") {
                    failMessage = "Nem sikerült a játékost a csapathoz adni";
                    // Also closes the player's other pending requests and invitations
                    addPlayerToTeam(db, row.player_id, row.team_id);
                }
            })();
        } catch (err) {
            console.error(err);
            return jsonError(500, failMessage);
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
