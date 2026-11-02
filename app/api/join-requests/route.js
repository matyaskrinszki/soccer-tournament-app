import { NextResponse } from "next/server";
import { getDatabase } from "../../../lib/database";
import { jsonError, serverError } from "../../../lib/api";
import { requireAuth } from "../../../lib/auth";

export async function GET(request) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    if (!teamId) {
        return jsonError(400, "Team ID is required");
    }

    try {
        const row = getDatabase()
            .prepare(
                "SELECT id FROM join_requests WHERE player_id = ? AND team_id = ? AND status = ?",
            )
            .get(user.playerId, teamId, "pending");

        return NextResponse.json(
            { hasPendingRequest: !!row },
            { status: 200 },
        );
    } catch (err) {
        return serverError(err);
    }
}

export async function POST(request) {
    // Require authentication
    const user = await requireAuth(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const { teamId } = payload || {};

    if (!teamId) {
        return jsonError(400, "Hiányzó adatok");
    }

    const playerId = user.playerId;

    try {
        const db = getDatabase();

        // Check if player exists and is not already in a team
        const playerRow = db
            .prepare("SELECT id, team_id FROM players WHERE id = ?")
            .get(playerId);
        if (!playerRow) {
            return jsonError(404, "A játékos nem található");
        }

        if (playerRow.team_id) {
            return jsonError(400, "Már tagja egy csapatnak");
        }

        // Check if team exists
        const teamRow = db
            .prepare("SELECT id FROM teams WHERE id = ?")
            .get(teamId);
        if (!teamRow) {
            return jsonError(404, "A csapat nem található");
        }

        // Check if a pending request already exists
        const existingRequest = db
            .prepare(
                "SELECT id, status FROM join_requests WHERE player_id = ? AND team_id = ?",
            )
            .get(playerId, teamId);

        // Only block if there's a PENDING request
        if (existingRequest && existingRequest.status === "pending") {
            return jsonError(
                400,
                "Már van függőben lévő kérésed erre a csapatra",
            );
        }

        // If request exists but is not pending, update it to pending
        // Otherwise, create a new request
        let requestId;
        try {
            if (existingRequest) {
                db.prepare(
                    "UPDATE join_requests SET status = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                ).run("pending", existingRequest.id);
                requestId = existingRequest.id;
            } else {
                const result = db
                    .prepare(
                        "INSERT INTO join_requests (player_id, team_id, status) VALUES (?, ?, ?)",
                    )
                    .run(playerId, teamId, "pending");
                requestId = Number(result.lastInsertRowid);
            }
        } catch (err) {
            console.error(err);
            return jsonError(500, "Nem sikerült a kérést elküldeni");
        }

        return NextResponse.json(
            { success: true, requestId },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}
