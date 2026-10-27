import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/auth";
import { generateSchedule, validateSchedule } from "../../../../lib/scheduler";

initializeDb();

const MIN_PREFERRED = 8;
const MAX_UNAVAILABLE = 8;
const START_TIMES = new Set([
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
]);

function buildRecurringKey(dayOfWeek, startTime) {
    return `${dayOfWeek}|${startTime}`;
}

function dbGet(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

function dbAll(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows || []);
        });
    });
}

function dbRun(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
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

    const db = getDb();

    try {
        const season = await dbGet(
            db,
            `SELECT id, name FROM seasons WHERE id = ?`,
            [seasonId],
        );

        if (!season) {
            return NextResponse.json(
                { error: "Szezon nem található" },
                { status: 404 },
            );
        }

        const timeSlots = await dbAll(
            db,
            `SELECT id, pitch_id as pitchId, slot_date as slotDate, day_of_week as dayOfWeek, start_time as startTime, end_time as endTime
             FROM time_slots
             WHERE season_id = ?
             ORDER BY slot_date IS NULL, slot_date, day_of_week, start_time`,
            [seasonId],
        );

        if (timeSlots.length === 0) {
            return NextResponse.json(
                { error: "Nincsenek időpontok konfigurálva" },
                { status: 400 },
            );
        }

        const leagueRows = await dbAll(
            db,
            `SELECT league_id as leagueId, COUNT(*) as teamCount
             FROM teams
             WHERE league_id IS NOT NULL
             GROUP BY league_id
             HAVING COUNT(*) >= 2
             ORDER BY league_id`,
        );

        if (leagueRows.length === 0) {
            return NextResponse.json(
                {
                    error: "Nincs legalább két csapatot tartalmazó liga az ütemezéshez",
                },
                { status: 400 },
            );
        }

        const allPreferences = await dbAll(
            db,
            `SELECT p.team_id as teamId,
                    p.time_slot_id as timeSlotId,
                    p.preference,
                    ts.day_of_week as dayOfWeek,
                    ts.start_time as startTime
             FROM team_availability_preferences p
             INNER JOIN time_slots ts ON ts.id = p.time_slot_id
             WHERE p.season_id = ?`,
            [seasonId],
        );

        const preferencesByTeam = new Map();
        for (const preference of allPreferences) {
            if (!preferencesByTeam.has(preference.teamId)) {
                preferencesByTeam.set(preference.teamId, []);
            }
            preferencesByTeam.get(preference.teamId).push(preference);
        }

        const recurringOptionKeys = new Set();
        for (const slot of timeSlots) {
            if (
                Number.isInteger(slot.dayOfWeek) &&
                slot.dayOfWeek >= 0 &&
                slot.dayOfWeek <= 4 &&
                START_TIMES.has(slot.startTime)
            ) {
                recurringOptionKeys.add(
                    buildRecurringKey(slot.dayOfWeek, slot.startTime),
                );
            }
        }

        const requiredPreferred = Math.min(
            MIN_PREFERRED,
            recurringOptionKeys.size,
        );

        let currentFreeSlots = timeSlots;

        await dbRun(db, "BEGIN TRANSACTION");
        try {
            const generationResults = [];

            for (const leagueRow of leagueRows) {
                const leagueId = leagueRow.leagueId;
                const teams = await dbAll(
                    db,
                    `SELECT id, name FROM teams WHERE league_id = ? ORDER BY id`,
                    [leagueId],
                );

                const teamIds = teams.map((team) => team.id);

                const preferenceIssues = [];
                for (const team of teams) {
                    const teamPreferenceRows =
                        preferencesByTeam.get(team.id) || [];

                    const preferredRecurring = new Set();
                    const unavailableRecurring = new Set();

                    for (const pref of teamPreferenceRows) {
                        if (
                            !Number.isInteger(pref.dayOfWeek) ||
                            pref.dayOfWeek < 0 ||
                            pref.dayOfWeek > 4 ||
                            !START_TIMES.has(pref.startTime)
                        ) {
                            continue;
                        }

                        const recurringKey = buildRecurringKey(
                            pref.dayOfWeek,
                            pref.startTime,
                        );

                        if (pref.preference === "preferred") {
                            preferredRecurring.add(recurringKey);
                        }

                        if (pref.preference === "unavailable") {
                            unavailableRecurring.add(recurringKey);
                        }
                    }

                    const preferredCount = preferredRecurring.size;
                    const unavailableCount = unavailableRecurring.size;

                    if (preferredCount < requiredPreferred) {
                        preferenceIssues.push({
                            teamId: team.id,
                            teamName: team.name,
                            preferredCount,
                            requiredPreferred,
                            unavailableCount,
                        });
                        continue;
                    }

                    if (unavailableCount > MAX_UNAVAILABLE) {
                        preferenceIssues.push({
                            teamId: team.id,
                            teamName: team.name,
                            preferredCount,
                            requiredPreferred,
                            unavailableCount,
                            maxUnavailable: MAX_UNAVAILABLE,
                        });
                    }
                }

                if (preferenceIssues.length > 0) {
                    throw {
                        type: "preference-coverage",
                        leagueId,
                        issues: preferenceIssues,
                        requiredPreferred,
                        maxUnavailable: MAX_UNAVAILABLE,
                    };
                }

                const teamPreferences = new Map();
                teamIds.forEach((id) => teamPreferences.set(id, new Map()));

                (allPreferences || []).forEach((pref) => {
                    if (!teamPreferences.has(pref.teamId)) {
                        return;
                    }
                    teamPreferences
                        .get(pref.teamId)
                        .set(pref.timeSlotId, pref.preference);
                });

                const result = generateSchedule({
                    teamIds,
                    timeSlots: currentFreeSlots,
                    teamPreferences,
                });

                if (!result.success) {
                    throw {
                        type: "generation-failure",
                        leagueId,
                        matchCount: result.matchCount,
                        reason: result.reason,
                    };
                }

                const validation = validateSchedule(
                    result.schedule,
                    currentFreeSlots,
                );
                if (!validation.isValid) {
                    throw {
                        type: "validation",
                        leagueId,
                        conflicts: validation.conflicts,
                    };
                }

                currentFreeSlots = currentFreeSlots.filter((slot) => {
                    return !result.schedule.some(
                        (match) => match.timeSlotId === slot.id,
                    );
                });

                await dbRun(
                    db,
                    `UPDATE schedule_runs SET status = 'archived'
                     WHERE season_id = ? AND league_id = ?`,
                    [seasonId, leagueId],
                );

                const scheduleRunInsert = await dbRun(
                    db,
                    `INSERT INTO schedule_runs (season_id, league_id, algorithm_score, status)
                     VALUES (?, ?, ?, 'current')`,
                    [seasonId, leagueId, result.satisfactionScore],
                );

                const scheduleRunId = scheduleRunInsert.lastID;

                for (let index = 0; index < result.schedule.length; index++) {
                    const match = result.schedule[index];
                    await dbRun(
                        db,
                        `INSERT INTO scheduled_matches
                         (schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id, round_number)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            scheduleRunId,
                            match.homeTeamId,
                            match.awayTeamId,
                            match.timeSlotId,
                            match.pitchId,
                            index + 1,
                        ],
                    );
                }

                generationResults.push({
                    leagueId,
                    scheduleRunId,
                    matchCount: result.scheduledMatchCount,
                    satisfactionScore: result.satisfactionScore,
                });
            }

            await dbRun(db, "COMMIT");

            const totalMatchCount = generationResults.reduce(
                (sum, current) => sum + current.matchCount,
                0,
            );

            return NextResponse.json(
                {
                    success: true,
                    seasonId,
                    seasonName: season.name,
                    generatedLeagueCount: generationResults.length,
                    totalMatchCount,
                    results: generationResults,
                },
                { status: 201 },
            );
        } catch (innerErr) {
            try {
                await dbRun(db, "ROLLBACK");
            } catch {
                // Ignore rollback errors and return the original failure.
            }

            if (innerErr?.type === "generation-failure") {
                let errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni.`;
                if (innerErr.reason === "not-enough-time-slots") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: ${innerErr.matchCount} mérkőzéshez nincs elég időpont.`;
                } else if (innerErr.reason === "no-valid-assignment-found") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: Nem található érvényes ütemezés.`;
                }
                return NextResponse.json(
                    {
                        error: errorMessage,
                    },
                    { status: 422 },
                );
            }

            if (innerErr?.type === "validation") {
                return NextResponse.json(
                    {
                        error: "Ütemezési konfliktusok",
                        leagueId: innerErr.leagueId,
                        conflicts: innerErr.conflicts,
                    },
                    { status: 400 },
                );
            }

            if (innerErr?.type === "preference-coverage") {
                return NextResponse.json(
                    {
                        error: "A generálás előtt minden csapatnak teljesítenie kell a preferencia szabályokat",
                        leagueId: innerErr.leagueId,
                        requiredPreferred: innerErr.requiredPreferred,
                        maxUnavailable: innerErr.maxUnavailable,
                        issues: innerErr.issues,
                    },
                    { status: 400 },
                );
            }

            console.error(innerErr);
            return NextResponse.json(
                { error: "Hiba az ütemezés mentésekor" },
                { status: 500 },
            );
        }
    } catch {
        return NextResponse.json(
            { error: "Hiba az ütemezés generálása során" },
            { status: 500 },
        );
    } finally {
        db.close();
    }
}

export async function GET(request) {
    const user = await requireAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

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
            `SELECT 
                sr.id,
                sr.season_id as seasonId,
                sr.league_id as leagueId,
                sr.generated_at as generatedAt,
                sr.algorithm_score as algorithmScore,
                sr.status,
                l.name as leagueName,
                l.country as leagueCountry
             FROM schedule_runs sr
             LEFT JOIN leagues l ON l.id = sr.league_id
             WHERE sr.season_id = ?
             ORDER BY sr.generated_at DESC`,
            [seasonId],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Hiba az ütemezések lekérdezésekor" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ schedules: rows || [] }));
            },
        );
    });
}
