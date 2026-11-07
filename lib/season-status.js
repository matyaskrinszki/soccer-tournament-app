// Season lifecycle. A season only moves forward:
//
//   setup ──(close registration)──> team-preferences ──(generate schedule)──> generated
//     ──(publish)──> active ──(close season)──> completed
//
// - setup: teams register (lib/season-registration.js)
// - team-preferences: captains of registered teams save availability preferences
// - generated: a schedule exists; it can be regenerated until it is published
// - active: published fixtures are being played; only one season at a time
// - completed: every match has a result
//
// Only "close registration" and "close season" are separate admin actions; the
// other steps happen as part of generating (generate-schedule route) and
// publishing (lib/publish-schedule.js). Takes the database as a parameter so it
// can be tested on its own.
import { MIN_PLAYERS_TO_REGISTER } from "./season-registration.js";

export const SEASON_STATUSES = ["setup", "team-preferences", "generated", "active", "completed"];

// A schedule can be (re)generated in these statuses
export const GENERATABLE_STATUSES = ["team-preferences", "generated"];

/**
 * setup -> team-preferences. Every registered team must still have enough players,
 * and every league with a registered team needs at least two, so each team gets
 * matches.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{ok: true} | {ok: false, status: number, error: string, teams?: Object[], leagues?: Object[]}}
 */
export function closeRegistration(db, seasonId) {
    return db.transaction(() => {
        const season = getSeason(db, seasonId);
        if (!season) return fail(404, "Szezon nem található");
        if (season.status !== "setup") {
            return fail(400, "Csak előkészítés alatt álló szezon nevezése zárható le");
        }

        const teams = db
            .prepare(
                `SELECT t.id, t.name, t.league_id as leagueId, l.name as leagueName,
                        (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as playerCount
                 FROM season_teams st
                 JOIN teams t ON t.id = st.team_id
                 JOIN leagues l ON l.id = t.league_id
                 WHERE st.season_id = ?
                 ORDER BY l.name, t.name`,
            )
            .all(seasonId);

        if (teams.length === 0) {
            return fail(400, "Még egy csapat sem nevezett a szezonra");
        }

        const shortTeams = teams.filter((team) => team.playerCount < MIN_PLAYERS_TO_REGISTER);
        if (shortTeams.length > 0) {
            return {
                ...fail(
                    400,
                    `Ezeknek a csapatoknak kevesebb mint ${MIN_PLAYERS_TO_REGISTER} játékosa van: ` +
                        shortTeams.map((team) => `${team.name} (${team.playerCount})`).join(", "),
                ),
                teams: shortTeams,
            };
        }

        const teamsPerLeague = new Map();
        for (const team of teams) {
            const league = teamsPerLeague.get(team.leagueId) ?? { name: team.leagueName, count: 0 };
            league.count += 1;
            teamsPerLeague.set(team.leagueId, league);
        }
        const loneLeagues = [...teamsPerLeague.entries()]
            .filter(([, league]) => league.count < 2)
            .map(([id, league]) => ({ id, name: league.name }));
        if (loneLeagues.length > 0) {
            return {
                ...fail(
                    400,
                    "Ezekben a ligákban csak egy csapat nevezett, így nem lenne ellenfele: " +
                        loneLeagues.map((league) => league.name).join(", "),
                ),
                leagues: loneLeagues,
            };
        }

        setStatus(db, seasonId, "team-preferences");
        return { ok: true };
    }).immediate();
}

/**
 * active -> completed, once every match of the season has a result.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function completeSeason(db, seasonId) {
    return db.transaction(() => {
        const season = getSeason(db, seasonId);
        if (!season) return fail(404, "Szezon nem található");
        if (season.status !== "active") {
            return fail(400, "Csak folyamatban lévő szezon zárható le");
        }

        const missing = db
            .prepare(
                "SELECT COUNT(*) FROM matches WHERE season_id = ? AND status != 'finished'",
            )
            .pluck()
            .get(seasonId);
        if (missing > 0) {
            return fail(
                400,
                `A szezon nem zárható le: ${missing} mérkőzésnek még nincs eredménye`,
            );
        }

        setStatus(db, seasonId, "completed");
        return { ok: true };
    }).immediate();
}

/**
 * Name of the active season other than `seasonId`, if there is one.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {string|null}
 */
export function otherActiveSeasonName(db, seasonId) {
    return (
        db
            .prepare("SELECT name FROM seasons WHERE status = 'active' AND id != ?")
            .pluck()
            .get(seasonId) ?? null
    );
}

function getSeason(db, seasonId) {
    return db.prepare("SELECT id, name, status FROM seasons WHERE id = ?").get(seasonId);
}

function setStatus(db, seasonId, status) {
    db.prepare("UPDATE seasons SET status = ? WHERE id = ?").run(status, seasonId);
}

function fail(status, error) {
    return { ok: false, status, error };
}
