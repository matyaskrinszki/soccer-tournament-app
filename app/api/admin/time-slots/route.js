import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";

initializeDb();

export async function GET(request) {
    const url = new URL(request.url);
    const seasonId = url.searchParams.get("seasonId");
    const pitchId = url.searchParams.get("pitchId");

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        let query = `SELECT 
                        ts.id, 
                        ts.season_id as seasonId, 
                        ts.pitch_id as pitchId,
                        ts.slot_date as slotDate,
                        ts.day_of_week as dayOfWeek,
                        ts.start_time as startTime,
                        ts.end_time as endTime,
                        p.name as pitchName
                     FROM time_slots ts
                     LEFT JOIN pitches p ON p.id = ts.pitch_id
                     WHERE ts.season_id = ?`;
        let params = [seasonId];

        if (pitchId) {
            query += " AND ts.pitch_id = ?";
            params.push(pitchId);
        }

        query +=
            " ORDER BY ts.slot_date IS NULL, ts.slot_date, ts.day_of_week, ts.start_time";

        db.all(query, params, (err, rows) => {
            if (err) {
                db.close();
                resolve(
                    NextResponse.json(
                        { error: "Hiba az időpontok lekérdezésekor" },
                        { status: 500 },
                    ),
                );
                return;
            }

            db.close();
            resolve(NextResponse.json({ timeSlots: rows || [] }));
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
    const { seasonId, pitchId, dayOfWeek, startTime, endTime, slotDate } = body;

    if (
        !seasonId ||
        !pitchId ||
        dayOfWeek === undefined ||
        !startTime ||
        !endTime
    ) {
        return NextResponse.json(
            { error: "Hiányzó kötelező mezők" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `INSERT INTO time_slots (season_id, pitch_id, slot_date, day_of_week, start_time, end_time)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                seasonId,
                pitchId,
                slotDate || null,
                dayOfWeek,
                startTime,
                endTime,
            ],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba az időpont létrehozásakor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(
                    NextResponse.json(
                        { timeSlotId: this.lastID },
                        { status: 201 },
                    ),
                );
            },
        );
    });
}

export async function DELETE(request) {
    const user = await requireAdmin(request);
    if (!user) {
        return NextResponse.json(
            { error: "Nincs jogosultságod" },
            { status: 403 },
        );
    }

    const body = await request.json();
    const { timeSlotId } = body;

    if (!timeSlotId) {
        return NextResponse.json(
            { error: "Időpont ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.run(
            `DELETE FROM time_slots WHERE id = ?`,
            [timeSlotId],
            function (err) {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba az időpont törlésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (this.changes === 0) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Időpont nem található" },
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
