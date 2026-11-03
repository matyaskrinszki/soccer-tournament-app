import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/auth";
import { generateSchedule, validateSchedule } from "../../../../lib/scheduler";
import {
    MIN_PREFERRED,
    MAX_UNAVAILABLE,
    START_TIMES,
    buildRecurringKey,
} from "../../../../lib/preference-rules";

// A team plays at most this many matches in one calendar week (Monday-Sunday)
const MAX_MATCHES_PER_TEAM_PER_WEEK = 1;

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

    try {
        const db = getDatabase();

        const season = db
            .prepare(`SELECT id, name FROM seasons WHERE id = ?`)
            .get(seasonId);

        if (!season) {
            return NextResponse.json(
                { error: "Szezon nem található" },
                { status: 404 },
            );
        }

        const timeSlots = db
            .prepare(
                `SELECT id, pitch_id as pitchId, slot_date as slotDate, day_of_week as dayOfWeek, start_time as startTime, end_time as endTime
                 FROM time_slots
                 WHERE season_id = ?
                 ORDER BY slot_date IS NULL, slot_date, day_of_week, start_time`,
            )
            .all(seasonId);

        if (timeSlots.length === 0) {
            return NextResponse.json(
                { error: "Nincsenek időpontok konfigurálva" },
                { status: 400 },
            );
        }

        const leagueRows = db
            .prepare(
                `SELECT league_id as leagueId, COUNT(*) as teamCount
                 FROM teams
                 WHERE league_id IS NOT NULL
                 GROUP BY league_id
                 HAVING COUNT(*) >= 2
                 ORDER BY league_id`,
            )
            .all();

        if (leagueRows.length === 0) {
            return NextResponse.json(
                {
                    error: "Nincs legalább két csapatot tartalmazó liga az ütemezéshez",
                },
                { status: 400 },
            );
        }

        const allPreferences = db
            .prepare(
                `SELECT p.team_id as teamId,
                        p.time_slot_id as timeSlotId,
                        p.preference,
                        ts.day_of_week as dayOfWeek,
                        ts.start_time as startTime
                 FROM team_availability_preferences p
                 INNER JOIN time_slots ts ON ts.id = p.time_slot_id
                 WHERE p.season_id = ?`,
            )
            .all(seasonId);

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

        const teamsInLeague = db.prepare(
            `SELECT id, name FROM teams WHERE league_id = ? ORDER BY id`,
        );
        const archiveRuns = db.prepare(
            `UPDATE schedule_runs SET status = 'archived'
             WHERE season_id = ? AND league_id = ?`,
        );
        const insertRun = db.prepare(
            `INSERT INTO schedule_runs (season_id, league_id, algorithm_score, status)
             VALUES (?, ?, ?, 'current')`,
        );
        const insertMatch = db.prepare(
            `INSERT INTO scheduled_matches
             (schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id, round_number)
             VALUES (?, ?, ?, ?, ?, ?)`,
        );

        // Generates and saves every league. Runs inside one transaction: any throw
        // (the typed failures below or a SQLite error) rolls back all leagues.
        const generateAllLeagues = db.transaction(() => {
            const generationResults = [];
            let currentFreeSlots = timeSlots;

            for (const leagueRow of leagueRows) {
                const leagueId = leagueRow.leagueId;
                const teams = teamsInLeague.all(leagueId);

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

                allPreferences.forEach((pref) => {
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
                    maxMatchesPerTeamPerWeek: MAX_MATCHES_PER_TEAM_PER_WEEK,
                });

                if (!result.success) {
                    throw {
                        type: "generation-failure",
                        leagueId,
                        matchCount: result.matchCount,
                        reason: result.reason,
                        weekCount: result.weekCount,
                        requiredWeeks: result.requiredWeeks,
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

                archiveRuns.run(seasonId, leagueId);

                const scheduleRunId = Number(
                    insertRun.run(seasonId, leagueId, result.satisfactionScore)
                        .lastInsertRowid,
                );

                for (let index = 0; index < result.schedule.length; index++) {
                    const match = result.schedule[index];
                    insertMatch.run(
                        scheduleRunId,
                        match.homeTeamId,
                        match.awayTeamId,
                        match.timeSlotId,
                        match.pitchId,
                        index + 1,
                    );
                }

                generationResults.push({
                    leagueId,
                    scheduleRunId,
                    matchCount: result.scheduledMatchCount,
                    satisfactionScore: result.satisfactionScore,
                });
            }

            return generationResults;
        });

        try {
            const generationResults = generateAllLeagues();

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
            if (innerErr?.type === "generation-failure") {
                let errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni.`;
                if (innerErr.reason === "not-enough-time-slots") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: ${innerErr.matchCount} mérkőzéshez nincs elég időpont.`;
                } else if (innerErr.reason === "not-enough-weeks") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: heti ${MAX_MATCHES_PER_TEAM_PER_WEEK} mérkőzés mellett legalább ${innerErr.requiredWeeks} hét kell, a szezonban csak ${innerErr.weekCount} hét van.`;
                } else if (innerErr.reason === "no-valid-assignment-found") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: Nem található érvényes ütemezés.`;
                } else if (innerErr.reason === "search-limit-reached") {
                    errorMessage = `A(z) ${innerErr.leagueId} ligához nem sikerült ütemezést generálni: a keresés elérte a lépéskorlátot. Adj hozzá több időpontot vagy pályát.`;
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
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba az ütemezés generálása során");
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

    try {
        const schedules = getDatabase()
            .prepare(
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
                 ORDER BY sr.generated_at DESC, sr.id DESC`,
            )
            .all(seasonId);

        return NextResponse.json({ schedules });
    } catch (err) {
        console.error(err);
        return jsonError(500, "Hiba az ütemezések lekérdezésekor");
    }
}
