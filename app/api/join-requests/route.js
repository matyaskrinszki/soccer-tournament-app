import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";

initializeDb();

export async function POST(request) {
    // Require authentication
    const user = requireAuth(request);
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

    const { teamId } = payload || {};

    if (!teamId) {
        return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });
    }

    const playerId = user.playerId;

    const db = getDb();

    return new Promise((resolve) => {
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
                            { error: "Már tagja egy csapatnak" },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                // Check if team exists
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

                        // Check if a request already exists
                        db.get(
                            "SELECT id, status FROM join_requests WHERE player_id = ? AND team_id = ?",
                            [playerId, teamId],
                            (checkErr, existingRequest) => {
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

                                if (existingRequest) {
                                    db.close();
                                    if (existingRequest.status === "pending") {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Már van függőben lévő kérésed erre a csapatra",
                                                },
                                                { status: 400 },
                                            ),
                                        );
                                    } else {
                                        resolve(
                                            NextResponse.json(
                                                {
                                                    error: "Már van felterjesztésed erre a csapatra",
                                                },
                                                { status: 400 },
                                            ),
                                        );
                                    }
                                    return;
                                }

                                // Create join request
                                db.run(
                                    "INSERT INTO join_requests (player_id, team_id, status) VALUES (?, ?, ?)",
                                    [playerId, teamId, "pending"],
                                    function (insertErr) {
                                        db.close();
                                        if (insertErr) {
                                            resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Nem sikerült a kérést elküldeni",
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
                                                    requestId: this.lastID,
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
