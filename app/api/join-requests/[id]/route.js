import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../../lib/auth";

initializeDb();

export async function POST(request, context) {
    // Require captain or admin role
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let requestId = context?.params?.id;

    if (!requestId) {
        // Fallback: extract from URL path /api/join-requests/123
        const pathParts = new URL(request.url).pathname
            .split("/")
            .filter(Boolean);
        const joinRequestsIndex = pathParts.indexOf("join-requests");
        if (
            joinRequestsIndex !== -1 &&
            joinRequestsIndex + 1 < pathParts.length
        ) {
            requestId = pathParts[joinRequestsIndex + 1];
        }
    }

    if (!requestId) {
        return NextResponse.json(
            { error: "Kérés azonosító hiányzik" },
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
        // Get the join request
        db.get(
            `SELECT jr.id, jr.player_id, jr.team_id, jr.status, t.captain_player_id
             FROM join_requests jr
             JOIN teams t ON t.id = jr.team_id
             WHERE jr.id = ?`,
            [requestId],
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
                            { error: "A kérés nem található" },
                            { status: 404 },
                        ),
                    );
                    return;
                }

                // Verify the user is the team captain (admins bypass this check)
                if (user.role !== "Admin") {
                    if (
                        Number(row.captain_player_id) !== Number(user.playerId)
                    ) {
                        db.close();
                        resolve(
                            NextResponse.json(
                                {
                                    error: "Csak a csapatkapitány kezelheti a kéréseket",
                                },
                                { status: 403 },
                            ),
                        );
                        return;
                    }
                }

                if (row.status !== "pending") {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Ez a kérés már kezelve lett" },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                // Update request status
                db.run(
                    "UPDATE join_requests SET status = ? WHERE id = ?",
                    [action === "accept" ? "accepted" : "rejected", requestId],
                    (updateErr) => {
                        if (updateErr) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "Nem sikerült frissíteni a kérést",
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
                                    // Also mark any other pending requests from this player as rejected
                                    db.run(
                                        `UPDATE join_requests SET status = 'rejected' 
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
