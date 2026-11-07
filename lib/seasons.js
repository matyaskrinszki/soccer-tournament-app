// Which season the public pages (tables, statistics, home) show. Only seasons with
// published matches have anything to show. Takes the database as a parameter so it
// can be tested on its own.

/**
 * @typedef {Object} DisplaySeason
 * @property {number} id
 * @property {string} name
 * @property {string} status
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {boolean} isSample - The seeded sample season (see migration 004)
 */

/**
 * Seasons that have matches, best default first:
 * active seasons (latest start first), then completed real seasons (latest end
 * first), then the sample season, then anything else with matches.
 * @param {import("better-sqlite3").Database} db
 * @param {Object} [options]
 * @param {number} [options.teamId] - Only seasons this team has a match in
 * @returns {DisplaySeason[]}
 */
export function listDisplaySeasons(db, { teamId } = {}) {
    const teamFilter =
        teamId === undefined ? "" : "AND (m.home_team_id = @teamId OR m.away_team_id = @teamId)";

    const rows = db
        .prepare(
            `SELECT s.id, s.name, s.status, s.start_date as startDate,
                    s.end_date as endDate, s.is_sample as isSample
             FROM seasons s
             WHERE EXISTS (
                 SELECT 1 FROM matches m WHERE m.season_id = s.id ${teamFilter}
             )`,
        )
        .all(teamId === undefined ? {} : { teamId });

    return rows
        .map((row) => ({ ...row, isSample: row.isSample === 1 }))
        .sort((a, b) => rank(a) - rank(b) || compareRecency(a, b));
}

/**
 * The season to show: the requested one, or the best default.
 * @param {import("better-sqlite3").Database} db
 * @param {*} requestedId - Raw `seasonId` query value; empty means "default"
 * @param {Object} [options] - Passed to listDisplaySeasons
 * @returns {{ok: true, season: DisplaySeason|null, seasons: DisplaySeason[]}
 *         | {ok: false, status: number, error: string}}
 */
export function resolveDisplaySeason(db, requestedId, options) {
    const seasons = listDisplaySeasons(db, options);

    if (requestedId === null || requestedId === undefined || requestedId === "") {
        return { ok: true, season: seasons[0] ?? null, seasons };
    }

    const id = Number(requestedId);
    const season = Number.isInteger(id) ? seasons.find((s) => s.id === id) : undefined;
    if (!season) {
        return {
            ok: false,
            status: 404,
            error: "A szezon nem található, vagy még nincs mérkőzése",
        };
    }
    return { ok: true, season, seasons };
}

function rank(season) {
    if (season.status === "active") return 0;
    if (season.isSample) return 2;
    if (season.status === "completed") return 1;
    return 3;
}

// Active seasons by start date, the rest by end date; newest first, then by id
function compareRecency(a, b) {
    const key = (season) =>
        (season.status === "active" ? season.startDate : season.endDate) ?? "";
    return key(b).localeCompare(key(a)) || b.id - a.id;
}
