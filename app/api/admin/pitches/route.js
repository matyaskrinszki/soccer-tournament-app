import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";

initializeDb();

export async function GET(request) {
    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.all(
            `SELECT id, season_id as seasonId, name, location 
             FROM pitches 
             WHERE season_id = ?
             ORDER BY name`,
            [seasonId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a pályák lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ pitches: rows || [] }));
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
    const { seasonId, name, location } = body;

    if (!seasonId || !name) {
        return NextResponse.json(
            { error: "Szezon ID és pálya név szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `INSERT INTO pitches (season_id, name, location, created_by_admin)
             VALUES (?, ?, ?, ?)`,
            [seasonId, name, location || null, user.id],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba a pálya létrehozásakor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(
                    NextResponse.json(
                        { pitchId: this.lastID },
                        { status: 201 },
                    ),
                );
            },
        );
    });
}

export async function DELETE(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { pitchId } = body;

    if (!pitchId) {
        return NextResponse.json(
            { error: "Pálya ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(`DELETE FROM pitches WHERE id = ?`, [pitchId], function (err) {
            if (err) {
                db.close();
                resolve(
                    NextResponse.json(
                        { error: "Hiba a pálya törlésekor" },
                        { status: 500 },
                    ),
                );
                return;
            }

            if (this.changes === 0) {
                db.close();
                resolve(
                    NextResponse.json(
                        { error: "Pálya nem található" },
                        { status: 404 },
                    ),
                );
                return;
            }

            db.close();
            resolve(NextResponse.json({ success: true }, { status: 200 }));
        });
    });
}
