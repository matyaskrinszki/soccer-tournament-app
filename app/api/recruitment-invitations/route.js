import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../lib/auth";

export async function GET(request) {
    // Require captain or admin role
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
        return jsonError(400, "Team ID is required");
    }

    // Verify captain owns this team (admins bypass this check)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, Number(teamId));
        if (!isCaptain) {
            return jsonError(
                403,
                "Csak a csapatkapitány kérheti le a meghívókat",
            );
        }
    }

    try {
        // Fetch all pending invitations for this team
        const rows = getDatabase()
            .prepare(
                "SELECT player_id FROM recruitment_invitations WHERE team_id = ? AND status = ?",
            )
            .all(teamId, "pending");

        const invitedPlayerIds = rows.map((row) => row.player_id);
        return NextResponse.json({ invitedPlayerIds }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}

export async function POST(request) {
    // Require captain or admin role
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const { playerId, teamId } = payload || {};

    if (!playerId || !teamId) {
        return jsonError(400, "Hiányzó adatok");
    }

    // Verify captain owns this team (admins bypass this check)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(user, teamId);
        if (!isCaptain) {
            return jsonError(403, "Csak a csapatkapitány küldhet meghívót");
        }
    }

    try {
        const db = getDatabase();

        // Verify team exists
        const teamRow = db
            .prepare("SELECT id FROM teams WHERE id = ?")
            .get(teamId);
        if (!teamRow) {
            return jsonError(404, "A csapat nem található");
        }

        // Check if player exists and is not already in a team
        const playerRow = db
            .prepare("SELECT id, team_id FROM players WHERE id = ?")
            .get(playerId);
        if (!playerRow) {
            return jsonError(404, "A játékos nem található");
        }

        if (playerRow.team_id) {
            return jsonError(400, "A játékos már tagja egy csapatnak");
        }

        // Check if a pending invitation already exists
        const existingInvitation = db
            .prepare(
                "SELECT id, status FROM recruitment_invitations WHERE player_id = ? AND team_id = ?",
            )
            .get(playerId, teamId);

        // Only block if there's a PENDING invitation
        if (existingInvitation && existingInvitation.status === "pending") {
            return jsonError(
                400,
                "Már van függőben lévő meghívó ennek a játékosnak erre a csapatra",
            );
        }

        // If invitation exists but is not pending, update it to pending
        // Otherwise, create a new invitation
        let invitationId;
        try {
            if (existingInvitation) {
                db.prepare(
                    "UPDATE recruitment_invitations SET status = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                ).run("pending", existingInvitation.id);
                invitationId = existingInvitation.id;
            } else {
                const result = db
                    .prepare(
                        "INSERT INTO recruitment_invitations (player_id, team_id, status) VALUES (?, ?, ?)",
                    )
                    .run(playerId, teamId, "pending");
                invitationId = Number(result.lastInsertRowid);
            }
        } catch (err) {
            console.error(err);
            return jsonError(500, "Nem sikerült a meghívót elküldeni");
        }

        return NextResponse.json(
            { success: true, invitationId },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}
