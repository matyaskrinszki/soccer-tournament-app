// Captains report the results of their published matches, and the two reports are
// cross-checked:
//
// - after kick-off, the captain of either team of an upcoming match in the active
//   season reports the score and their own team's scorers; they may change it
//   until the match is finished
// - when both teams have reported the same score, the result is recorded from the
//   two reports (each team's scorers from its own report) with recordMatchResult
// - otherwise the match is a mismatch ("eltérés"): it stays upcoming with both
//   reports, until the admin records the result in the Eredmények tab
//
// Mismatches are not stored: an upcoming match with two reports is one. Agreeing
// reports that couldn't be recorded (e.g. a reported scorer left the team since)
// are left for the admin the same way.
//
// Takes the database as a parameter so it can be tested on its own.
import { toLocalDateTimeKey } from "./home.js";
import {
    MAX_SCORE,
    getMatchForResult,
    parseScore,
    recordMatchResult,
    resolveTeamGoals,
} from "./match-results.js";

/**
 * What the given player may report for a match, for the captain's form on the
 * match page. Players who aren't captain of either team get `isCaptain: false`
 * and nothing else.
 * @param {import("better-sqlite3").Database} db
 * @param {number} matchId
 * @param {number} playerId - The logged-in player
 * @param {Object} [options]
 * @param {Date} [options.now]
 * @returns {{ok: true, isCaptain: false} | {ok: true, isCaptain: true, canReport: boolean,
 *   reason: string|null, state: string, team: Object, report: Object|null,
 *   otherTeamReported: boolean} | {ok: false, status: number, error: string}}
 *   state: "open" (nobody reported yet), "waiting" (only this team reported),
 *   "other-reported", "mismatch" or "finished"
 */
export function getReportForm(db, matchId, playerId, { now = new Date() } = {}) {
    const match = getMatchForResult(db, matchId);
    if (!match) {
        return fail(404, "A mérkőzés nem található");
    }

    const team = [match.homeTeam, match.awayTeam].find(
        (side) => side.captainPlayerId != null && side.captainPlayerId === playerId,
    );
    if (!team) {
        return { ok: true, isCaptain: false };
    }

    const reports = getReports(db, matchId);
    const report = reports.find((r) => r.teamId === team.id) ?? null;
    const otherTeamReported = reports.some((r) => r.teamId !== team.id);
    const denied = checkCanReport(db, match, now);

    return {
        ok: true,
        isCaptain: true,
        canReport: denied === null,
        reason: denied?.error ?? null,
        state: reportState(match, report, otherTeamReported),
        team,
        report,
        otherTeamReported,
    };
}

/**
 * Save the captain's report and, once both teams have reported, record the result
 * if the scores agree.
 * @param {import("better-sqlite3").Database} db
 * @param {number} matchId
 * @param {number} playerId - The logged-in player; must be captain of one of the teams
 * @param {{homeScore: *, awayScore: *, scorers?: {playerId: *, goals: *}[]}} body
 *   Raw values from the request; scorers are the reporting team's own players
 * @param {Object} [options]
 * @param {Date} [options.now]
 * @returns {{ok: true, outcome: "waiting"|"finalized"|"mismatch", report: Object,
 *   finalizeError?: string} | {ok: false, status: number, error: string}}
 */
export function submitMatchReport(db, matchId, playerId, body, { now = new Date() } = {}) {
    return db.transaction(() => {
        const match = getMatchForResult(db, matchId);
        if (!match) {
            return fail(404, "A mérkőzés nem található");
        }

        const team = [match.homeTeam, match.awayTeam].find(
            (side) => side.captainPlayerId != null && side.captainPlayerId === playerId,
        );
        if (!team) {
            return fail(403, "Csak a két csapat kapitánya jelenthet eredményt");
        }

        const denied = checkCanReport(db, match, now);
        if (denied) {
            return denied;
        }

        const homeScore = parseScore(body?.homeScore);
        const awayScore = parseScore(body?.awayScore);
        if (homeScore === null || awayScore === null) {
            return fail(400, `Az eredmény 0 és ${MAX_SCORE} közötti egész szám lehet`);
        }

        const scorers = body?.scorers ?? [];
        if (!Array.isArray(scorers)) {
            return fail(400, "Érvénytelen góllövő lista");
        }
        // Captains only report their own scorers, so every entry is for their team
        const entries = scorers.map((entry) => ({
            teamId: team.id,
            playerId: Number(entry?.playerId),
            goals: entry?.goals,
        }));
        const ownScore = team.id === match.homeTeam.id ? homeScore : awayScore;
        const validated = resolveTeamGoals(team, ownScore, entries);
        if (!validated.ok) {
            return validated;
        }

        // Stored as entered; goals without a scorer stay unassigned
        const stored = entries
            .map((entry) => ({ playerId: entry.playerId, goals: parseScore(entry.goals) }))
            .filter((entry) => entry.goals > 0)
            .sort((a, b) => a.playerId - b.playerId);

        db.prepare(
            `INSERT INTO match_reports
                 (match_id, team_id, home_score, away_score, scorers, reported_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT (match_id, team_id) DO UPDATE SET
                 home_score = excluded.home_score,
                 away_score = excluded.away_score,
                 scorers = excluded.scorers,
                 reported_by = excluded.reported_by,
                 updated_at = excluded.updated_at`,
        ).run(matchId, team.id, homeScore, awayScore, JSON.stringify(stored), playerId);

        const reports = getReports(db, matchId);
        const report = reports.find((r) => r.teamId === team.id);
        if (reports.length < 2) {
            return { ok: true, outcome: "waiting", report };
        }
        if (!scoresAgree(reports)) {
            return { ok: true, outcome: "mismatch", report };
        }

        const recorded = recordMatchResult(db, matchId, combineReports(reports), { now });
        if (!recorded.ok) {
            // Both reports are kept and the match is listed for the admin
            return { ok: true, outcome: "mismatch", report, finalizeError: recorded.error };
        }
        return { ok: true, outcome: "finalized", report };
    }).immediate();
}

/**
 * Upcoming matches of a season with reports from both teams, for the admin's
 * "Eltérések" list. Recording the result (recordMatchResult) finishes the match,
 * which takes it off the list.
 * @param {import("better-sqlite3").Database} db
 * @param {number} seasonId
 * @returns {{matchId: number, scoresAgree: boolean, home: Object, away: Object}[]}
 *   home/away: that team's report
 */
export function listSeasonMismatches(db, seasonId) {
    const matches = db
        .prepare(
            `SELECT m.id, m.home_team_id as homeTeamId, m.away_team_id as awayTeamId
             FROM matches m
             WHERE m.season_id = ? AND m.status = 'upcoming'
               AND (SELECT COUNT(*) FROM match_reports r WHERE r.match_id = m.id) = 2
             ORDER BY m.match_date ASC, m.id ASC`,
        )
        .all(seasonId);

    return matches.map((match) => {
        const reports = getReports(db, match.id);
        return {
            matchId: match.id,
            scoresAgree: scoresAgree(reports),
            home: reports.find((r) => r.teamId === match.homeTeamId),
            away: reports.find((r) => r.teamId === match.awayTeamId),
        };
    });
}

/**
 * Number of open mismatches in all seasons, for the admin overview.
 * @param {import("better-sqlite3").Database} db
 * @returns {number}
 */
export function countOpenMismatches(db) {
    return db
        .prepare(
            `SELECT COUNT(*) FROM matches m
             WHERE m.status = 'upcoming'
               AND (SELECT COUNT(*) FROM match_reports r WHERE r.match_id = m.id) = 2`,
        )
        .pluck()
        .get();
}

/**
 * The match's reports with the reporter's and the scorers' names.
 * @returns {{teamId: number, homeScore: number, awayScore: number,
 *   scorers: {playerId: number, playerName: string|null, goals: number}[],
 *   reportedBy: {id: number, name: string|null}, updatedAt: string}[]}
 */
function getReports(db, matchId) {
    const rows = db
        .prepare(
            `SELECT r.team_id as teamId, r.home_score as homeScore, r.away_score as awayScore,
                    r.scorers, r.reported_by as reportedById, p.name as reportedByName,
                    r.updated_at as updatedAt
             FROM match_reports r
             LEFT JOIN players p ON p.id = r.reported_by
             WHERE r.match_id = ?
             ORDER BY r.team_id`,
        )
        .all(matchId);

    const playerName = db.prepare("SELECT name FROM players WHERE id = ?").pluck();
    return rows.map(({ scorers, reportedById, reportedByName, ...row }) => ({
        ...row,
        scorers: JSON.parse(scorers).map((scorer) => ({
            ...scorer,
            playerName: playerName.get(scorer.playerId) ?? null,
        })),
        reportedBy: { id: reportedById, name: reportedByName },
    }));
}

function checkCanReport(db, match, now) {
    if (match.status !== "upcoming") {
        return fail(400, "A mérkőzés eredménye már rögzítve van");
    }
    const seasonStatus = db
        .prepare(
            "SELECT s.status FROM matches m JOIN seasons s ON s.id = m.season_id WHERE m.id = ?",
        )
        .pluck()
        .get(match.id);
    if (seasonStatus !== "active") {
        return fail(400, "Csak a folyamatban lévő szezon mérkőzéseire lehet eredményt jelenteni");
    }
    if (match.matchDate > toLocalDateTimeKey(now)) {
        return fail(400, "A mérkőzés még nem kezdődött el, ezért nem jelenthető eredmény");
    }
    return null;
}

function reportState(match, report, otherTeamReported) {
    if (match.status === "finished") return "finished";
    if (report && otherTeamReported) return "mismatch";
    if (report) return "waiting";
    if (otherTeamReported) return "other-reported";
    return "open";
}

function scoresAgree([first, second]) {
    return first.homeScore === second.homeScore && first.awayScore === second.awayScore;
}

// The result both reports agree on, each team's scorers taken from its own report
function combineReports(reports) {
    const [{ homeScore, awayScore }] = reports;
    const scorers = reports.flatMap((report) =>
        report.scorers.map(({ playerId, goals }) => ({ teamId: report.teamId, playerId, goals })),
    );
    return { homeScore, awayScore, scorers };
}

function fail(status, error) {
    return { ok: false, status, error };
}
