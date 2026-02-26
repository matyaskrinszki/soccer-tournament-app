import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../lib/db";

initializeDb();

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) {
        return NextResponse.json(
            { error: "Játékos ID hiányzik" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        // Get player's pending join requests
        db.all(
            `SELECT jr.id, jr.team_id, jr.status, t.name as teamName, l.name as leagueName
             FROM join_requests jr
             JOIN teams t ON t.id = jr.team_id
             JOIN leagues l ON l.id = t.league_id
             WHERE jr.player_id = ? AND jr.status = 'pending'
             ORDER BY jr.created_at DESC`,
            [playerId],
            (err, joinRequests) => {
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

                // Get player's pending recruitment invitations
                db.all(
                    `SELECT ri.id, ri.team_id, ri.status, t.name as teamName, l.name as leagueName, p.name as captainName
                     FROM recruitment_invitations ri
                     JOIN teams t ON t.id = ri.team_id
                     JOIN leagues l ON l.id = t.league_id
                     JOIN players p ON p.id = t.captain_player_id
                     WHERE ri.player_id = ? AND ri.status = 'pending'
                     ORDER BY ri.created_at DESC`,
                    [playerId],
                    (err2, recruitmentInvitations) => {
                        if (err2) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    { error: "Adatbázis hiba történt" },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        // Check if player is a team captain and get pending applications for their team
                        db.get(
                            "SELECT id FROM teams WHERE captain_player_id = ?",
                            [playerId],
                            (err3, captainTeam) => {
                                if (err3) {
                                    db.close();
                                    resolve(
                                        NextResponse.json(
                                            { error: "Adatbázis hiba történt" },
                                            { status: 500 },
                                        ),
                                    );
                                    return;
                                }

                                if (!captainTeam) {
                                    // Not a captain, return just requests and invitations
                                    db.close();
                                    resolve(
                                        NextResponse.json(
                                            {
                                                joinRequests:
                                                    joinRequests || [],
                                                recruitmentInvitations:
                                                    recruitmentInvitations ||
                                                    [],
                                                teamApplications: [],
                                            },
                                            { status: 200 },
                                        ),
                                    );
                                    return;
                                }

                                // Get pending applications to this captain's team
                                db.all(
                                    `SELECT jr.id, jr.player_id, jr.status, p.name as playerName, p.email as playerEmail
                                     FROM join_requests jr
                                     JOIN players p ON p.id = jr.player_id
                                     WHERE jr.team_id = ? AND jr.status = 'pending'
                                     ORDER BY jr.created_at DESC`,
                                    [captainTeam.id],
                                    (err4, teamApplications) => {
                                        db.close();
                                        if (err4) {
                                            resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Adatbázis hiba történt",
                                                    },
                                                    { status: 500 },
                                                ),
                                            );
                                            return;
                                        }

                                        resolve(
                                            NextResponse.json(
                                                {
                                                    joinRequests:
                                                        joinRequests || [],
                                                    recruitmentInvitations:
                                                        recruitmentInvitations ||
                                                        [],
                                                    teamApplications:
                                                        teamApplications || [],
                                                    captainTeamId:
                                                        captainTeam.id,
                                                },
                                                { status: 200 },
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
