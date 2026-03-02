import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../lib/db";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../lib/auth";

initializeDb();

export async function POST(request) {
    // Require captain or admin role
    const user = requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
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

    const { playerId, teamId } = payload || {};

    if (!playerId || !teamId) {
        return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });
    }

    const db = getDb();

    return new Promise(async (resolve) => {
        // Verify captain owns this team (admins bypass this check)
        if (user.role !== "Admin") {
            const isCaptain = await isCaptainOfTeam(user, teamId);
            if (!isCaptain) {
                resolve(
                    NextResponse.json(
                        { error: "Csak a csapatkapitány küldhet meghívót" },
                        { status: 403 },
                    ),
                );
                return;
            }
        }

        // Verify team and check if player exists and is not already in a team
        // Verify team and check if player exists and is not already in a team
        db.get(
            "SELECT id FROM teams WHERE id = ?",
            [teamId],
            (teamErr, teamRow) => {
                if (teamErr) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Adatbázis hiba történt" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (!teamRow) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "A csapat nem található" },
                            { status: 404 },
                        ),
                    );
                    return;
                }

                // Check if player exists and is not already in a team
                db.get(
                    "SELECT id, team_id FROM players WHERE id = ?",
                    [playerId],
                    (playerErr, playerRow) => {
                        if (playerErr) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { error: "Adatbázis hiba történt" },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        if (!playerRow) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { error: "A játékos nem található" },
                                    { status: 404 },
                                ),
                            );
                            return;
                        }

                        if (playerRow.team_id) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "A játékos már tagja egy csapatnak",
                                    },
                                    { status: 400 },
                                ),
                            );
                            return;
                        }

                        // Check if an invitation already exists
                        db.get(
                            "SELECT id, status FROM recruitment_invitations WHERE player_id = ? AND team_id = ?",
                            [playerId, teamId],
                            (checkErr, existingInvitation) => {
                                if (checkErr) {
                                    db.close();
                                    resolve(
                                        NextResponse.json(
                                            { error: "Adatbázis hiba történt" },
                                            { status: 500 },
                                        ),
                                    );
                                    return;
                                }

                                if (existingInvitation) {
                                    db.close();
                                    if (
                                        existingInvitation.status === "pending"
                                    ) {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Már van függőben lévő meghívó erre a játékosnak erre a csapatra",
                                                },
                                                { status: 400 },
                                            ),
                                        );
                                    } else {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Már van meghívó erre a játékosnak erre a csapatra",
                                                },
                                                { status: 400 },
                                            ),
                                        );
                                    }
                                    return;
                                }

                                // Create recruitment invitation
                                db.run(
                                    "INSERT INTO recruitment_invitations (player_id, team_id, status) VALUES (?, ?, ?)",
                                    [playerId, teamId, "pending"],
                                    function (insertErr) {
                                        db.close();
                                        if (insertErr) {
                                            resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Nem sikerült a meghívót elküldeni",
                                                    },
                                                    { status: 500 },
                                                ),
                                            );
                                            return;
                                        }

                                        resolve(
                                            NextResponse.json(
                                                {
                                                    success: true,
                                                    invitationId: this.lastID,
                                                },
                                                { status: 201 },
                                            ),
                                        );
                                    },
                                );
                            },
                        );
                    },
                );
            },
        );
    });
}
