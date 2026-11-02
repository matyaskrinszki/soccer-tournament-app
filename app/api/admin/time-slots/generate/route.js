import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
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

    try {
        const body = await request.json();
        const { seasonId } = body;

        if (!seasonId) {
            return jsonError(400, "Szezon ID szükséges");
        }

        const db = getDatabase();

        let season;
        try {
            season = db
                .prepare(
                    `SELECT id, start_date as startDate, end_date as endDate FROM seasons WHERE id = ?`,
                )
                .get(seasonId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a szezon lekérdezésekor");
        }

        if (!season) {
            return jsonError(404, "Szezon nem található");
        }

        const startDate = season.startDate;
        const endDate = season.endDate;

        if (!startDate || !endDate) {
            return jsonError(
                400,
                "A kiválasztott szezonhoz kezdő és záró dátum szükséges",
            );
        }

        if (startDate > endDate) {
            return jsonError(
                400,
                "A szezon kezdő dátuma nem lehet később, mint a záró dátum",
            );
        }

        const weekdayDates = buildWeekdayDates(startDate, endDate);
        if (weekdayDates.length === 0) {
            return jsonError(
                400,
                "A szezon dátumtartományában nincs hétköznap (hétfő-péntek)",
            );
        }

        let pitchRows;
        try {
            pitchRows = db
                .prepare(`SELECT id FROM pitches WHERE season_id = ? ORDER BY id`)
                .all(seasonId);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a pályák lekérdezésekor");
        }

        if (pitchRows.length === 0) {
            return jsonError(
                400,
                "Előbb legalább egy pályát adj hozzá a szezonhoz",
            );
        }

        const pitchIds = pitchRows.map((row) => row.id);

        let existingRows;
        try {
            existingRows = db
                .prepare(
                    `SELECT pitch_id as pitchId, slot_date as slotDate, start_time as startTime, end_time as endTime
                     FROM time_slots
                     WHERE season_id = ? AND slot_date >= ? AND slot_date <= ?`,
                )
                .all(seasonId, startDate, endDate);
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba a meglévő időpontok lekérdezésekor");
        }

        const existingSet = new Set(
            existingRows.map(
                (row) =>
                    `${row.pitchId}|${row.slotDate}|${row.startTime}|${row.endTime}`,
            ),
        );

        const toInsert = [];
        for (const pitchId of pitchIds) {
            for (const slotDate of weekdayDates) {
                const dayOfWeek = getMondayBasedDayOfWeek(slotDate);
                for (const [startTime, endTime] of HOURLY_WINDOWS) {
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

        const totalRequested =
            pitchIds.length * weekdayDates.length * HOURLY_WINDOWS.length;

        // All-or-nothing: either every missing slot is saved or none are
        try {
            const insertSlot = db.prepare(
                `INSERT INTO time_slots (season_id, pitch_id, slot_date, day_of_week, start_time, end_time)
                 VALUES (?, ?, ?, ?, ?, ?)`,
            );
            db.transaction(() => {
                for (const slot of toInsert) {
                    insertSlot.run(
                        seasonId,
                        slot.pitchId,
                        slot.slotDate,
                        slot.dayOfWeek,
                        slot.startTime,
                        slot.endTime,
                    );
                }
            })();
        } catch (err) {
            console.error(err);
            return jsonError(500, "Hiba az automatikus időpontok mentésekor");
        }

        return NextResponse.json({
            success: true,
            createdCount: toInsert.length,
            skippedCount: totalRequested - toInsert.length,
            totalRequested,
        });
    } catch (err) {
        return serverError(err);
    }
}
