import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db";
import { requireAdmin } from "../../../../../lib/auth";

const HOURLY_WINDOWS = [
    ["17:00", "18:00"],
    ["18:00", "19:00"],
    ["19:00", "20:00"],
    ["20:00", "21:00"],
    ["21:00", "22:00"],
    ["22:00", "23:00"],
];

function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getMondayBasedDayOfWeek(isoDate) {
    const date = parseLocalDate(isoDate);
    const jsDay = date.getDay();
    return (jsDay + 6) % 7;
}

function buildWeekdayDates(startDate, endDate) {
    const dates = [];
    const current = parseLocalDate(startDate);
    const last = parseLocalDate(endDate);

    while (current <= last) {
        const jsDay = current.getDay();
        if (jsDay >= 1 && jsDay <= 5) {
            dates.push(formatLocalDate(current));
        }
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const body = await request.json();
    const { seasonId } = body;

    if (!seasonId) {
        return NextResponse.json(
            { error: "Szezon ID szükséges" },
            { status: 400 },
        );
    }

    return new Promise((resolve) => {
        const db = getDb();

        db.get(
            `SELECT id, start_date as startDate, end_date as endDate FROM seasons WHERE id = ?`,
            [seasonId],
            (seasonErr, season) => {
                if (seasonErr) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            { error: "Hiba a szezon lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                }

                if (!season) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            { error: "Szezon nem található" },
                            { status: 404 },
                        ),
                    );
                }

                const startDate = season.startDate;
                const endDate = season.endDate;

                if (!startDate || !endDate) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            {
                                error: "A kiválasztott szezonhoz kezdő és záró dátum szükséges",
                            },
                            { status: 400 },
                        ),
                    );
                }

                if (startDate > endDate) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            {
                                error: "A szezon kezdő dátuma nem lehet később, mint a záró dátum",
                            },
                            { status: 400 },
                        ),
                    );
                }

                const weekdayDates = buildWeekdayDates(startDate, endDate);
                if (weekdayDates.length === 0) {
                    db.close();
                    return resolve(
                        NextResponse.json(
                            {
                                error: "A szezon dátumtartományában nincs hétköznap (hétfő-péntek)",
                            },
                            { status: 400 },
                        ),
                    );
                }

                db.all(
                    `SELECT id FROM pitches WHERE season_id = ? ORDER BY id`,
                    [seasonId],
                    (pitchErr, pitchRows) => {
                        if (pitchErr) {
                            db.close();
                            return resolve(
                                NextResponse.json(
                                    { error: "Hiba a pályák lekérdezésekor" },
                                    { status: 500 },
                                ),
                            );
                        }

                        if (!pitchRows || pitchRows.length === 0) {
                            db.close();
                            return resolve(
                                NextResponse.json(
                                    {
                                        error: "Előbb legalább egy pályát adj hozzá a szezonhoz",
                                    },
                                    { status: 400 },
                                ),
                            );
                        }

                        const pitchIds = pitchRows.map((row) => row.id);

                        db.all(
                            `SELECT pitch_id as pitchId, slot_date as slotDate, start_time as startTime, end_time as endTime
                             FROM time_slots
                             WHERE season_id = ? AND slot_date >= ? AND slot_date <= ?`,
                            [seasonId, startDate, endDate],
                            (existingErr, existingRows) => {
                                if (existingErr) {
                                    db.close();
                                    return resolve(
                                        NextResponse.json(
                                            {
                                                error: "Hiba a meglévő időpontok lekérdezésekor",
                                            },
                                            { status: 500 },
                                        ),
                                    );
                                }

                                const existingSet = new Set(
                                    (existingRows || []).map(
                                        (row) =>
                                            `${row.pitchId}|${row.slotDate}|${row.startTime}|${row.endTime}`,
                                    ),
                                );

                                const toInsert = [];
                                for (const pitchId of pitchIds) {
                                    for (const slotDate of weekdayDates) {
                                        const dayOfWeek =
                                            getMondayBasedDayOfWeek(slotDate);
                                        for (const [
                                            startTime,
                                            endTime,
                                        ] of HOURLY_WINDOWS) {
                                            const key = `${pitchId}|${slotDate}|${startTime}|${endTime}`;
                                            if (!existingSet.has(key)) {
                                                toInsert.push({
                                                    pitchId,
                                                    slotDate,
                                                    dayOfWeek,
                                                    startTime,
                                                    endTime,
                                                });
                                            }
                                        }
                                    }
                                }

                                if (toInsert.length === 0) {
                                    db.close();
                                    return resolve(
                                        NextResponse.json({
                                            success: true,
                                            createdCount: 0,
                                            skippedCount:
                                                pitchIds.length *
                                                weekdayDates.length *
                                                HOURLY_WINDOWS.length,
                                            totalRequested:
                                                pitchIds.length *
                                                weekdayDates.length *
                                                HOURLY_WINDOWS.length,
                                        }),
                                    );
                                }

                                let inserted = 0;
                                for (const slot of toInsert) {
                                    db.run(
                                        `INSERT INTO time_slots (season_id, pitch_id, slot_date, day_of_week, start_time, end_time)
                                         VALUES (?, ?, ?, ?, ?, ?)`,
                                        [
                                            seasonId,
                                            slot.pitchId,
                                            slot.slotDate,
                                            slot.dayOfWeek,
                                            slot.startTime,
                                            slot.endTime,
                                        ],
                                        (insertErr) => {
                                            if (insertErr) {
                                                db.close();
                                                return resolve(
                                                    NextResponse.json(
                                                        {
                                                            error: "Hiba az automatikus időpontok mentésekor",
                                                        },
                                                        { status: 500 },
                                                    ),
                                                );
                                            }

                                            inserted += 1;
                                            if (inserted === toInsert.length) {
                                                db.close();
                                                const totalRequested =
                                                    pitchIds.length *
                                                    weekdayDates.length *
                                                    HOURLY_WINDOWS.length;
                                                return resolve(
                                                    NextResponse.json({
                                                        success: true,
                                                        createdCount: inserted,
                                                        skippedCount:
                                                            totalRequested -
                                                            inserted,
                                                        totalRequested,
                                                    }),
                                                );
                                            }
                                        },
                                    );
                                }
                            },
                        );
                    },
                );
            },
        );
    });
}
