// Publishing turns a season's generated schedule into real fixtures: every match of the
// league's current schedule run is copied into `matches` as "upcoming", and the season
// becomes "active". Takes the database as a parameter so it can be tested on its own.

// After publishing the schedule is fixed: it can't be regenerated or published again
export const PUBLISHED_STATUSES = ["active", "completed"];

/**
 * Publish the current schedule runs of a season.
 * Runs in one transaction: either every match is published and the season becomes
 * active, or nothing changes.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{ok: true, seasonName: string, publishedMatchCount: number, leagueCount: number}
 *         | {ok: false, status: number, error: string}}
 */
export function publishSeasonSchedule(db, seasonId) {
    const publish = db.transaction(() => {
        const season = db
            .prepare("SELECT id, name, status FROM seasons WHERE id = ?")
            .get(seasonId);

        if (!season) {
            return fail(404, "Szezon nem található");
        }

        if (PUBLISHED_STATUSES.includes(season.status)) {
            return fail(400, "A szezon menetrendje már publikálva van");
        }

        // Guards against publishing twice if the status was changed back by hand
        const existing = db
            .prepare("SELECT COUNT(*) as count FROM matches WHERE season_id = ?")
            .get(seasonId);
        if (existing.count > 0) {
            return fail(
                409,
                "A szezonhoz már tartoznak mérkőzések, ezért nem publikálható újra",
            );
        }

        const scheduledMatches = db
            .prepare(
                `SELECT sm.id,
                        sm.home_team_id as homeTeamId,
                        sm.away_team_id as awayTeamId,
                        sr.league_id as leagueId,
                        ts.slot_date as slotDate,
                        ts.start_time as startTime
                 FROM scheduled_matches sm
                 JOIN schedule_runs sr ON sr.id = sm.schedule_run_id
                 JOIN time_slots ts ON ts.id = sm.time_slot_id
                 WHERE sr.season_id = ? AND sr.status = 'current'
                 ORDER BY ts.slot_date, ts.start_time, sm.id`,
            )
            .all(seasonId);

        if (scheduledMatches.length === 0) {
            return fail(400, "Nincs publikálható ütemezés. Előbb generálj ütemezést.");
        }

        if (scheduledMatches.some((match) => !match.slotDate)) {
            return fail(
                400,
                "Az ütemezés dátum nélküli időpontot tartalmaz, ezért nem publikálható",
            );
        }

        const insertMatch = db.prepare(
            `INSERT INTO matches
             (league_id, season_id, scheduled_match_id, home_team_id, away_team_id,
              home_score, away_score, match_date, status)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 'upcoming')`,
        );
        for (const match of scheduledMatches) {
            insertMatch.run(
                match.leagueId,
                seasonId,
                match.id,
                match.homeTeamId,
                match.awayTeamId,
                // Local kick-off time, without a time zone
                `${match.slotDate}T${match.startTime}:00`,
            );
        }

        db.prepare("UPDATE seasons SET status = 'active' WHERE id = ?").run(
            seasonId,
        );

        return {
            ok: true,
            seasonName: season.name,
            publishedMatchCount: scheduledMatches.length,
            leagueCount: new Set(scheduledMatches.map((m) => m.leagueId)).size,
        };
    });

    // IMMEDIATE takes the write lock before the status check, so two publishes
    // can't both pass it
    return publish.immediate();
}

function fail(status, error) {
    return { ok: false, status, error };
}
