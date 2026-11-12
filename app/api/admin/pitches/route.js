import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError, serverError, isForeignKeyError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { sortByName } from "../../../../lib/sort";

export async function GET(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");

    if (!seasonId) {
        return jsonError(400, "Szezon ID szükséges");
    }

    try {
        const pitches = getDatabase()
            .prepare(
                `SELECT id, season_id as seasonId, name, location
                 FROM pitches
                 WHERE season_id = ?`,
            )
            .all(seasonId);

        return NextResponse.json({ pitches: sortByName(pitches) });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba a pályák lekérdezésekor");
    }
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { seasonId, name, location } = body;

        if (!seasonId || !name) {
            return jsonError(400, "Szezon ID és pálya név szükséges");
        }

        let result;
        try {
            result = getDatabase()
                .prepare(
                    `INSERT INTO pitches (season_id, name, location, created_by_admin)
                     VALUES (?, ?, ?, ?)`,
                )
                .run(seasonId, name, location || null, user.playerId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a pálya létrehozásakor");
        }

        return NextResponse.json(
            { pitchId: Number(result.lastInsertRowid) },
            { status: 201 },
        );
    } catch (err) {
        return serverError(err);
    }
}

export async function DELETE(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    try {
        const body = await request.json();
        const { pitchId } = body;

        if (!pitchId) {
            return jsonError(400, "Pálya ID szükséges");
        }

        let result;
        try {
            result = getDatabase()
                .prepare("DELETE FROM pitches WHERE id = ?")
                .run(pitchId);
        } catch (err) {
            if (isForeignKeyError(err)) {
                return jsonError(
                    400,
                    "A pálya nem törölhető, mert időpontok vagy ütemezett mérkőzések hivatkoznak rá",
                );
            }
            console.error(err);
            return jsonError(500, "Hiba a pálya törlésekor");
        }

        if (result.changes === 0) {
            return jsonError(404, "Pálya nem található");
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        return serverError(err);
    }
}
