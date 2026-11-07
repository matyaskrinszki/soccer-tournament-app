// Teams register for a season while it is in "setup"; only registered teams are
// scheduled. Takes the database as a parameter so it can be tested on its own.

// A team needs this many players to register, and still needs them when
// registration closes (see lib/season-status.js)
export const MIN_PLAYERS_TO_REGISTER = 5;

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} teamId
 * @returns {number}
 */
export function countTeamPlayers(db, teamId) {
    return db.prepare("SELECT COUNT(*) FROM players WHERE team_id = ?").pluck().get(teamId);
}

/**
 * Seasons a team can register for (in setup) and seasons it is registered for.
 * @param {import("better-sqlite3").Database} db
 * @param {number} teamId
 * @returns {{playerCount: number, minPlayers: number,
 *            seasons: {id: number, name: string, status: string, registered: boolean}[]}}
 */
export function getTeamSeasonRegistrations(db, teamId) {
    const seasons = db
        .prepare(
            `SELECT s.id, s.name, s.status, s.start_date as startDate, s.end_date as endDate,
                    st.team_id IS NOT NULL as registered
             FROM seasons s
             LEFT JOIN season_teams st ON st.season_id = s.id AND st.team_id = ?
             WHERE s.is_sample = 0 AND (s.status = 'setup' OR st.team_id IS NOT NULL)
             ORDER BY s.start_date IS NULL, s.start_date DESC, s.id DESC`,
        )
        .all(teamId)
        .map((season) => ({ ...season, registered: season.registered === 1 }));

    return {
        playerCount: countTeamPlayers(db, teamId),
        minPlayers: MIN_PLAYERS_TO_REGISTER,
        seasons,
    };
}

/**
 * Every team with its player count and whether it is registered for the season
 * (admin view).
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {Object[]}
 */
export function listSeasonTeams(db, seasonId) {
    return db
        .prepare(
            `SELECT t.id, t.name, t.league_id as leagueId, l.name as leagueName,
                    (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as playerCount,
                    st.team_id IS NOT NULL as registered
             FROM teams t
             JOIN leagues l ON l.id = t.league_id
             LEFT JOIN season_teams st ON st.team_id = t.id AND st.season_id = ?
             ORDER BY l.name, t.name COLLATE NOCASE`,
        )
        .all(seasonId)
        .map((team) => ({ ...team, registered: team.registered === 1 }));
}

/**
 * Register a team for a season in setup.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @param {number} teamId
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function registerTeam(db, seasonId, teamId) {
    return db.transaction(() => {
        const check = checkSetupSeasonAndTeam(db, seasonId, teamId);
        if (check) return check;

        const playerCount = countTeamPlayers(db, teamId);
        if (playerCount < MIN_PLAYERS_TO_REGISTER) {
            return fail(
                400,
                `A nevezéshez legalább ${MIN_PLAYERS_TO_REGISTER} játékos kell (jelenleg ${playerCount})`,
            );
        }

        const result = db
            .prepare("INSERT OR IGNORE INTO season_teams (season_id, team_id) VALUES (?, ?)")
            .run(seasonId, teamId);
        if (result.changes === 0) {
            return fail(400, "A csapat már nevezett erre a szezonra");
        }
        return { ok: true };
    }).immediate();
}

/**
 * Withdraw a team from a season in setup.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @param {number} teamId
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function unregisterTeam(db, seasonId, teamId) {
    return db.transaction(() => {
        const check = checkSetupSeasonAndTeam(db, seasonId, teamId);
        if (check) return check;

        const result = db
            .prepare("DELETE FROM season_teams WHERE season_id = ? AND team_id = ?")
            .run(seasonId, teamId);
        if (result.changes === 0) {
            return fail(400, "A csapat nem nevezett erre a szezonra");
        }
        return { ok: true };
    }).immediate();
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @param {number} teamId
 * @returns {boolean}
 */
export function isTeamRegistered(db, seasonId, teamId) {
    return Boolean(
        db
            .prepare("SELECT 1 FROM season_teams WHERE season_id = ? AND team_id = ?")
            .get(seasonId, teamId),
    );
}

// Registration only changes while the season is in setup
function checkSetupSeasonAndTeam(db, seasonId, teamId) {
    const season = db.prepare("SELECT status FROM seasons WHERE id = ?").get(seasonId);
    if (!season) {
        return fail(404, "Szezon nem található");
    }
    if (season.status !== "setup") {
        return fail(400, "Nevezni csak előkészítés alatt álló szezonra lehet");
    }
    if (!db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId)) {
        return fail(404, "A csapat nem található");
    }
    return null;
}

function fail(status, error) {
    return { ok: false, status, error };
}
