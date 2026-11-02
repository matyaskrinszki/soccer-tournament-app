import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { requireAuth, canAccessPlayerResource } from "../../../../lib/auth";

export async function POST(request, context) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id: invitationId } = await context.params;

    if (!invitationId) {
        return NextResponse.json(
            { error: "Meghívó azonosító hiányzik" },
            { status: 400 },
        );
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return NextResponse.json(
            { error: "Érvénytelen kérés" },
            { status: 400 },
        );
    }

    const { action } = payload || {};

    if (!action || !["accept", "reject"].includes(action)) {
        return NextResponse.json(
            { error: "Érvénytelen akció" },
            { status: 400 },
        );
    }

    const db = getDb();

    return new Promise((resolve) => {
        // Get the recruitment invitation
        db.get(
            "SELECT id, player_id, team_id, status FROM recruitment_invitations WHERE id = ?",
            [invitationId],
            (err, row) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Adatbázis hiba történt" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (!row) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "A meghívó nem található" },
                            { status: 404 },
                        ),
                    );
                    return;
                }

                // Verify the user is the player being invited or admin
                if (!canAccessPlayerResource(user, row.player_id)) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            {
                                error: "Csak a meghívott játékos kezelheti ezt a meghívót",
                            },
                            { status: 403 },
                        ),
                    );
                    return;
                }

                if (row.status !== "pending") {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Ez a meghívó már kezelve lett" },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                // Update invitation status
                db.run(
                    "UPDATE recruitment_invitations SET status = ? WHERE id = ?",
                    [
                        action === "accept" ? "accepted" : "rejected",
                        invitationId,
                    ],
                    (updateErr) => {
                        if (updateErr) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "Nem sikerült frissíteni a meghívót",
                                    },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        // If accepting, add player to team
                        if (action === "accept") {
                            db.run(
                                "UPDATE players SET team_id = ? WHERE id = ?",
                                [row.team_id, row.player_id],
                                (addErr) => {
                                    // Also mark any other pending invitations from this player as rejected
                                    db.run(
                                        `UPDATE recruitment_invitations SET status = 'rejected'
                                         WHERE player_id = ? AND team_id != ? AND status = 'pending'`,
                                        [row.player_id, row.team_id],
                                        () => {
                                            db.close();
                                            if (addErr) {
                                                resolve(
                                                    NextResponse.json(
                                                        {
                                                            error: "Nem sikerült a játékost a csapathoz adni",
                                                        },
                                                        { status: 500 },
                                                    ),
                                                );
                                                return;
                                            }
                                            resolve(
                                                NextResponse.json(
                                                    { success: true },
                                                    { status: 200 },
                                                ),
                                            );
                                        },
                                    );
                                },
                            );
                        } else {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { success: true },
                                    { status: 200 },
                                ),
                            );
                        }
                    },
                );
            },
        );
    });
}
