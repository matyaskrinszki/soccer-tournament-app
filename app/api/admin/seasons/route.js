import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError } from "../../../../lib/api";
import { requireAdmin, requireCaptainOrAdmin } from "../../../../lib/auth";

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const seasons = getDatabase()
            .prepare("SELECT * FROM seasons ORDER BY created_at DESC")
            .all();

        return NextResponse.json({ seasons });
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
        const { name, status, startDate, endDate } = body;

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
                .run(
                    null,
                    name.trim(),
                    status || "setup",
                    startDate || null,
                    endDate || null,
                );
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

export async function PUT(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { seasonId, status, startDate, endDate } = body;

        if (!seasonId) {
            return jsonError(400, "Szezon ID szükséges");
        }

        let result;
        try {
            result = getDatabase()
                .prepare(
                    `UPDATE seasons
                     SET status = ?, start_date = ?, end_date = ?
                     WHERE id = ?`,
                )
                .run(status || "setup", startDate || null, endDate || null, seasonId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a szezon frissítésekor");
        }

        if (result.changes === 0) {
            return jsonError(404, "Szezon nem található");
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
