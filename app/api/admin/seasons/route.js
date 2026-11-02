import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { requireAdmin, requireCaptainOrAdmin } from "../../../../lib/auth";

export async function GET(request) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            "SELECT * FROM seasons ORDER BY created_at DESC",
            [],
            (err, rows) => {
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
            },
        );
    });
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { name, status, startDate, endDate } = body;

    if (!name) {
        return NextResponse.json(
            { error: "Szezon név szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.get(
            "SELECT id FROM seasons WHERE LOWER(name) = LOWER(?)",
            [name.trim()],
            (existingErr, existingRow) => {
                if (existingErr) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a szezon létrehozásakor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (existingRow) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Ilyen névvel már létezik szezon" },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                db.run(
                    `INSERT INTO seasons (league_id, name, status, start_date, end_date)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        null,
                        name.trim(),
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
            },
        );
    });
}

export async function PUT(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
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
