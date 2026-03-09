import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { getAuthHeaders } from "../../../../lib/client-auth";
import { requireCaptainOrAdmin, isCaptainOfTeam } from "../../../../lib/auth";

initializeDb();

export async function GET(request) {
    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const teamId = url.searchParams.get("teamId");

    if (!seasonId || !teamId) {
        return NextResponse.json(
            { error: "Szezon és csapat ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT 
                id,
                season_id as seasonId,
                team_id as teamId,
                time_slot_id as timeSlotId,
                preference
             FROM team_availability_preferences
             WHERE season_id = ? AND team_id = ?
             ORDER BY time_slot_id`,
            [seasonId, teamId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferenciák lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ preferences: rows || [] }));
            },
        );
    });
}

export async function POST(request) {
    const user = await requireCaptainOrAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { seasonId, teamId, timeSlotId, preference } = body;

    if (!seasonId || !teamId || !timeSlotId || !preference) {
        return NextResponse.json(
            { error: "Hiányzó kötelező mezők" },
            { status: 400 },
        );
    }

    if (!["preferred", "unavailable", "neutral"].includes(preference)) {
        return NextResponse.json(
            { error: "Érvénytelen preferencia típus" },
            { status: 400 },
        );
    }

    // Verify user is captain of this team (or admin)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(teamId, user.id);
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();

        // Use INSERT OR REPLACE pattern for upsert
        db.run(
            `INSERT INTO team_availability_preferences 
             (season_id, team_id, time_slot_id, preference)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(season_id, team_id, time_slot_id) DO UPDATE SET preference = ?`,
            [seasonId, teamId, timeSlotId, preference, preference],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferencia mentésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ success: true }, { status: 201 }));
            },
        );
    });
}

export async function DELETE(request) {
    const user = await requireCaptainOrAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { seasonId, teamId, timeSlotId } = body;

    if (!seasonId || !teamId || !timeSlotId) {
        return NextResponse.json(
            { error: "Hiányzó kötelező mezők" },
            { status: 400 },
        );
    }

    // Verify user is captain of this team (or admin)
    if (user.role !== "Admin") {
        const isCaptain = await isCaptainOfTeam(teamId, user.id);
        if (!isCaptain) {
            return NextResponse.json(
                { error: "Nincs jogosultságod" },
                { status: 403 },
            );
        }
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `DELETE FROM team_availability_preferences 
             WHERE season_id = ? AND team_id = ? AND time_slot_id = ?`,
            [seasonId, teamId, timeSlotId],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a preferencia törlésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ success: true }, { status: 200 }));
            },
        );
    });
}
