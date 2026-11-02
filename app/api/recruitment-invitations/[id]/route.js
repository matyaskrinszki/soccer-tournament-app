import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAuth, canAccessPlayerResource } from "../../../../lib/auth";

export async function POST(request, context) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id: invitationId } = await context.params;

    if (!invitationId) {
        return jsonError(400, "Meghívó azonosító hiányzik");
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

        // Get the recruitment invitation
        const row = db
            .prepare(
                "SELECT id, player_id, team_id, status FROM recruitment_invitations WHERE id = ?",
            )
            .get(invitationId);

        if (!row) {
            return jsonError(404, "A meghívó nem található");
        }

        // Verify the user is the player being invited or admin
        if (!canAccessPlayerResource(user, row.player_id)) {
            return jsonError(
                403,
                "Csak a meghívott játékos kezelheti ezt a meghívót",
            );
        }

        if (row.status !== "pending") {
            return jsonError(400, "Ez a meghívó már kezelve lett");
        }

        // Update the invitation and, when accepting, the player's team atomically
        let failMessage = "Nem sikerült frissíteni a meghívót";
        try {
            db.transaction(() => {
                db.prepare(
                    "UPDATE recruitment_invitations SET status = ? WHERE id = ?",
                ).run(action === "accept" ? "accepted" : "rejected", invitationId);

                if (action === "accept") {
                    failMessage = "Nem sikerült a játékost a csapathoz adni";
                    db.prepare("UPDATE players SET team_id = ? WHERE id = ?").run(
                        row.team_id,
                        row.player_id,
                    );

                    // Also mark any other pending invitations for this player as rejected
                    db.prepare(
                        `UPDATE recruitment_invitations SET status = 'rejected'
                         WHERE player_id = ? AND team_id != ? AND status = 'pending'`,
                    ).run(row.player_id, row.team_id);
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
