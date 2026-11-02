import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { requireAuth, canAccessPlayerResource } from "../../../lib/auth";

export async function GET(request) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) {
        return jsonError(400, "Játékos ID hiányzik");
    }

    // Verify user can access this player's data
    if (!canAccessPlayerResource(user, parseInt(playerId))) {
        return jsonError(403, "Nincs jogosultságod ehhez az adathoz");
    }

    try {
        const db = getDatabase();

        // Get player's pending join requests
        const joinRequests = db
            .prepare(
                `SELECT jr.id, jr.team_id, jr.status, t.name as teamName, l.name as leagueName
                 FROM join_requests jr
                 JOIN teams t ON t.id = jr.team_id
                 JOIN leagues l ON l.id = t.league_id
                 WHERE jr.player_id = ? AND jr.status = 'pending'
                 ORDER BY jr.created_at DESC`,
            )
            .all(playerId);

        // Get player's pending recruitment invitations
        const recruitmentInvitations = db
            .prepare(
                `SELECT ri.id, ri.team_id, ri.status, t.name as teamName, l.name as leagueName, p.name as captainName
                 FROM recruitment_invitations ri
                 JOIN teams t ON t.id = ri.team_id
                 JOIN leagues l ON l.id = t.league_id
                 JOIN players p ON p.id = t.captain_player_id
                 WHERE ri.player_id = ? AND ri.status = 'pending'
                 ORDER BY ri.created_at DESC`,
            )
            .all(playerId);

        // Check if player is a team captain and get pending applications for their team
        const captainTeam = db
            .prepare("SELECT id FROM teams WHERE captain_player_id = ?")
            .get(playerId);

        if (!captainTeam) {
            // Not a captain, return just requests and invitations
            return NextResponse.json(
                { joinRequests, recruitmentInvitations, teamApplications: [] },
                { status: 200 },
            );
        }

        // Get pending applications to this captain's team
        const teamApplications = db
            .prepare(
                `SELECT jr.id, jr.player_id, jr.status, p.name as playerName, p.email as playerEmail
                 FROM join_requests jr
                 JOIN players p ON p.id = jr.player_id
                 WHERE jr.team_id = ? AND jr.status = 'pending'
                 ORDER BY jr.created_at DESC`,
            )
            .all(captainTeam.id);

        return NextResponse.json(
            {
                joinRequests,
                recruitmentInvitations,
                teamApplications,
                captainTeamId: captainTeam.id,
            },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}
