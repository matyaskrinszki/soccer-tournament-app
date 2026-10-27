// DEV / DEMO TOOL: fills random but valid availability preferences for every team
// in one league (or all leagues) of a season, so schedule generation can be tested
// without logging in as each captain.

import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";
import { dbGet, dbAll, dbRun } from "../../../../lib/db-async";
import {
    MIN_PREFERRED,
    MAX_UNAVAILABLE,
    WEEKDAY_INDEXES,
    START_TIMES,
    buildRecurringKey,
} from "../../../../lib/preference-rules";

initializeDb();

const ALL_LEAGUES = "all";
// Preferences may only be seeded before a schedule exists
const SEEDABLE_STATUSES = ["setup", "team-preferences"];

// Fisher-Yates shuffle on a copy, so every ordering is equally likely
function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function randomIntInclusive(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

// Picks which weekly cells a team prefers / avoids. Everything else stays neutral.
function pickWeeklyPreferences(weeklyKeys) {
    const requiredPreferred = Math.min(MIN_PREFERRED, weeklyKeys.length);
    const shuffled = shuffle(weeklyKeys);

    // Between the minimum and minimum + 4 preferred cells (never more than exist)
    const preferredCount = randomIntInclusive(
        requiredPreferred,
        Math.min(requiredPreferred + 4, weeklyKeys.length),
    );
    // Between 0 and the maximum unavailable cells, from what is left
    const unavailableCount = randomIntInclusive(
        0,
        Math.min(MAX_UNAVAILABLE, weeklyKeys.length - preferredCount),
    );

    return {
        preferred: shuffled.slice(0, preferredCount),
        unavailable: shuffled.slice(
            preferredCount,
            preferredCount + unavailableCount,
        ),
    };
}

export async function POST(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Érvénytelen kérés" },
            { status: 400 },
        );
    }

    const { seasonId, leagueId } = body || {};
    if (!seasonId || !leagueId) {
        return NextResponse.json(
            { error: "Szezon és liga kiválasztása szükséges" },
            { status: 400 },
        );
    }

    const db = getDb();

    try {
        const season = await dbGet(
            db,
            `SELECT id, name, status FROM seasons WHERE id = ?`,
            [seasonId],
        );
        if (!season) {
            return NextResponse.json(
                { error: "Szezon nem található" },
                { status: 404 },
            );
        }
        if (!SEEDABLE_STATUSES.includes(season.status)) {
            return NextResponse.json(
                {
                    error: "Teszt preferenciák csak 'setup' vagy 'team-preferences' állapotú szezonhoz tölthetők fel",
                },
                { status: 400 },
            );
        }

        // Map each weekly cell ("day|time") to all concrete dated slots it covers,
        // the same way the captain's preference save does.
        const slots = await dbAll(
            db,
            `SELECT id, day_of_week as dayOfWeek, start_time as startTime
             FROM time_slots
             WHERE season_id = ? AND slot_date IS NOT NULL`,
            [seasonId],
        );

        const slotIdsByWeeklyKey = new Map();
        for (const slot of slots) {
            if (
                !WEEKDAY_INDEXES.includes(slot.dayOfWeek) ||
                !START_TIMES.has(slot.startTime)
            ) {
                continue;
            }
            const key = buildRecurringKey(slot.dayOfWeek, slot.startTime);
            if (!slotIdsByWeeklyKey.has(key)) {
                slotIdsByWeeklyKey.set(key, []);
            }
            slotIdsByWeeklyKey.get(key).push(slot.id);
        }

        if (slotIdsByWeeklyKey.size === 0) {
            return NextResponse.json(
                {
                    error: "A szezonhoz még nincsenek időpontok. Előbb generálj időpontokat a Pályák fülön.",
                },
                { status: 400 },
            );
        }

        const teams =
            leagueId === ALL_LEAGUES
                ? await dbAll(
                      db,
                      `SELECT id, name, league_id as leagueId FROM teams ORDER BY league_id, name`,
                  )
                : await dbAll(
                      db,
                      `SELECT id, name, league_id as leagueId FROM teams WHERE league_id = ? ORDER BY name`,
                      [leagueId],
                  );

        if (teams.length === 0) {
            return NextResponse.json(
                { error: "A kiválasztott ligában nincsenek csapatok" },
                { status: 404 },
            );
        }

        const weeklyKeys = [...slotIdsByWeeklyKey.keys()];
        const summary = [];

        // All-or-nothing: either every team gets new preferences or none do
        await dbRun(db, "BEGIN TRANSACTION");
        try {
            for (const team of teams) {
                const { preferred, unavailable } =
                    pickWeeklyPreferences(weeklyKeys);

                // Replace, don't merge: same behaviour as a captain saving the grid
                await dbRun(
                    db,
                    `DELETE FROM team_availability_preferences
                     WHERE season_id = ? AND team_id = ?`,
                    [seasonId, team.id],
                );

                const entries = [
                    ...preferred.map((key) => [key, "preferred"]),
                    ...unavailable.map((key) => [key, "unavailable"]),
                ];
                for (const [key, preference] of entries) {
                    for (const slotId of slotIdsByWeeklyKey.get(key)) {
                        await dbRun(
                            db,
                            `INSERT INTO team_availability_preferences
                             (season_id, team_id, time_slot_id, preference)
                             VALUES (?, ?, ?, ?)`,
                            [seasonId, team.id, slotId, preference],
                        );
                    }
                }

                summary.push({
                    teamId: team.id,
                    teamName: team.name,
                    leagueId: team.leagueId,
                    preferredCount: preferred.length,
                    unavailableCount: unavailable.length,
                });
            }
            await dbRun(db, "COMMIT");
        } catch (err) {
            await dbRun(db, "ROLLBACK").catch(() => {});
            throw err;
        }

        return NextResponse.json(
            {
                success: true,
                seasonId: season.id,
                seasonName: season.name,
                teamCount: summary.length,
                teams: summary,
            },
            { status: 201 },
        );
    } catch (err) {
        console.error("Seed preferences error:", err);
        return NextResponse.json(
            { error: "Hiba a teszt preferenciák feltöltésekor" },
            { status: 500 },
        );
    } finally {
        db.close();
    }
}
