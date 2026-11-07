import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAdmin, requireCaptainOrAdmin } from "../../../../lib/auth";
import { closeRegistration, completeSeason } from "../../../../lib/season-status";

// Manual status changes; the other steps happen when generating and publishing
const ACTIONS = {
    "close-registration": closeRegistration,
    complete: completeSeason,
};

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const db = getDatabase();
        const seasons = db
            .prepare("SELECT * FROM seasons ORDER BY created_at DESC, id DESC")
            .all();
        const registeredTeams = db.prepare(
            "SELECT team_id FROM season_teams WHERE season_id = ? ORDER BY team_id",
        );

        return NextResponse.json({
            seasons: seasons.map((season) => ({
                ...season,
                registeredTeamIds: registeredTeams.pluck().all(season.id),
            })),
        });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba a szezonok lekérdezésekor");
    }
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { name, startDate, endDate } = body;

        if (!name) {
            return jsonError(400, "Szezon név szükséges");
        }

        const db = getDatabase();

        let seasonId;
        try {
            const existingRow = db
                .prepare("SELECT id FROM seasons WHERE LOWER(name) = LOWER(?)")
                .get(name.trim());
            if (existingRow) {
                return jsonError(400, "Ilyen névvel már létezik szezon");
            }

            const result = db
                .prepare(
                    `INSERT INTO seasons (league_id, name, status, start_date, end_date)
                     VALUES (?, ?, ?, ?, ?)`,
                )
                // Every season starts in setup, open for registration
                .run(null, name.trim(), "setup", startDate || null, endDate || null);
            seasonId = Number(result.lastInsertRowid);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a szezon létrehozásakor");
        }

        return NextResponse.json({ seasonId }, { status: 201 });
    } catch (err) {
        return serverError(err);
    }
}

/**
 * Move a season to its next status.
 * PUT { seasonId, action: "close-registration" | "complete" }
 */
export async function PUT(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return jsonError(400, "Érvénytelen kérés");
    }

    const seasonId = Number(body?.seasonId);
    if (!Number.isInteger(seasonId)) {
        return jsonError(400, "Szezon ID szükséges");
    }

    const action = ACTIONS[body?.action];
    if (!action) {
        return jsonError(400, "Érvénytelen művelet");
    }

    try {
        const result = action(getDatabase(), seasonId);
        if (!result.ok) {
            const { ok, status, ...details } = result;
            return NextResponse.json(details, { status });
        }

        const season = getDatabase()
            .prepare("SELECT id, status FROM seasons WHERE id = ?")
            .get(seasonId);
        return NextResponse.json({ success: true, status: season.status });
    } catch (err) {
        return serverError(err);
    }
}
