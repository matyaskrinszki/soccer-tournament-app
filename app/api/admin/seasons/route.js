import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";

initializeDb();

export async function GET(request) {
    const url = new URL(request.url);
    const leagueId = url.searchParams.get("leagueId");

    return new Promise((resolve) => {
        const db = getDb();

        let query = "SELECT * FROM seasons";
        let params = [];

        if (leagueId) {
            query += " WHERE league_id = ?";
            params.push(leagueId);
        }

        query += " ORDER BY created_at DESC";

        db.all(query, params, (err, rows) => {
            if (err) {
                db.close();
                resolve(
                    NextResponse.json(
                        { error: "Hiba a szezonok lekérdezésekor" },
                        { status: 500 },
                    ),
                );
                return;
            }

            db.close();
            resolve(NextResponse.json({ seasons: rows || [] }));
        });
    });
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { leagueId, name, status, startDate, endDate } = body;

    if (!leagueId || !name) {
        return NextResponse.json(
            { error: "Liga és szezon név szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `INSERT INTO seasons (league_id, name, status, start_date, end_date)
             VALUES (?, ?, ?, ?, ?)`,
            [
                leagueId,
                name,
                status || "setup",
                startDate || null,
                endDate || null,
            ],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a szezon létrehozásakor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(
                    NextResponse.json(
                        { seasonId: this.lastID },
                        { status: 201 },
                    ),
                );
            },
        );
    });
}

export async function PUT(request) {
    const user = await requireAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { seasonId, status, startDate, endDate } = body;

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `UPDATE seasons 
             SET status = ?, start_date = ?, end_date = ?
             WHERE id = ?`,
            [status || "setup", startDate || null, endDate || null, seasonId],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a szezon frissítésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (this.changes === 0) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Szezon nem található" },
                            { status: 404 },
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
