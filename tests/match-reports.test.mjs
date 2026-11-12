// Tests for lib/match-reports.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m007 from "../lib/migrations/007_goal_scorers.js";
import * as m008 from "../lib/migrations/008_match_reports.js";
import {
    getReportForm,
    submitMatchReport,
    listSeasonMismatches,
    countOpenMismatches,
} from "../lib/match-reports.js";
import { recordMatchResult } from "../lib/match-results.js";

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 2026-11-03 12:00 local
const PLAYED = "2026-10-20T18:00:00";

// Alpha (home): 1 captain, 2. Bravo (away): 3 captain, 4. Player 5 has no team.
const ALPHA_CAPTAIN = 1;
const BRAVO_CAPTAIN = 3;

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    m007.up(db);
    m008.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('a-league', 'A League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league');
        INSERT INTO seasons (id, name, status) VALUES
            (1, '2026 ősz', 'active'),
            (2, 'Bemutató', 'completed');
        INSERT INTO players (id, email, password, name, team_id) VALUES
            (1, 'p1@example.com', 'x', 'Ádám', 1),
            (2, 'p2@example.com', 'x', 'Béla', 1),
            (3, 'p3@example.com', 'x', 'Csaba', 2),
            (4, 'p4@example.com', 'x', 'Dénes', 2),
            (5, 'p5@example.com', 'x', 'Elek', NULL);
        UPDATE teams SET captain_player_id = 1 WHERE id = 1;
        UPDATE teams SET captain_player_id = 3 WHERE id = 2;
    `);
    return db;
}

let nextId = 1;
function addMatch(db, { seasonId = 1, date = PLAYED, status = "upcoming" } = {}) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                              match_date, status)
         VALUES (?, 'a-league', ?, 1, 2, ?, ?)`,
    ).run(id, seasonId, date, status);
    return id;
}

function getMatch(db, id) {
    return db
        .prepare("SELECT home_score, away_score, status FROM matches WHERE id = ?")
        .get(id);
}

// Goal count per [teamId, playerId], in a stable order
function goalCounts(db, matchId) {
    return db
        .prepare(
            `SELECT team_id, player_id, COUNT(*) as goals FROM goals
             WHERE match_id = ? GROUP BY team_id, player_id ORDER BY team_id, player_id`,
        )
        .all(matchId)
        .map((row) => [row.team_id, row.player_id, row.goals]);
}

describe("submitMatchReport", () => {
    let db;
    const report = (matchId, playerId, homeScore, awayScore, scorers = []) =>
        submitMatchReport(db, matchId, playerId, { homeScore, awayScore, scorers }, { now: NOW });

    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("keeps the match upcoming while only one team has reported", () => {
        const id = addMatch(db);

        const result = report(id, ALPHA_CAPTAIN, 2, 1, [{ playerId: 2, goals: 2 }]);

        assert.equal(result.ok, true);
        assert.equal(result.outcome, "waiting");
        assert.deepEqual(result.report.scorers, [{ playerId: 2, goals: 2, playerName: "Béla" }]);
        assert.equal(getMatch(db, id).status, "upcoming");
        assert.equal(countOpenMismatches(db), 0);
    });

    it("records the result when both reports agree, each team's scorers from its own report", () => {
        const id = addMatch(db);
        report(id, ALPHA_CAPTAIN, 3, 1, [{ playerId: 2, goals: 2 }]);

        const result = report(id, BRAVO_CAPTAIN, "3", "1", [{ playerId: 4, goals: 1 }]);

        assert.equal(result.outcome, "finalized");
        assert.deepEqual(getMatch(db, id), { home_score: 3, away_score: 1, status: "finished" });
        // Alpha's third goal has no scorer, so it gets no goal row
        assert.deepEqual(goalCounts(db, id), [
            [1, 2, 2],
            [2, 4, 1],
        ]);
    });

    it("leaves differing reports as a mismatch, without a result", () => {
        const id = addMatch(db);
        report(id, ALPHA_CAPTAIN, 2, 1);

        const result = report(id, BRAVO_CAPTAIN, 1, 1);

        assert.equal(result.outcome, "mismatch");
        assert.equal(getMatch(db, id).status, "upcoming");
        assert.deepEqual(goalCounts(db, id), []);
        assert.equal(countOpenMismatches(db), 1);
    });

    it("lets a captain change their report, which can resolve a mismatch", () => {
        const id = addMatch(db);
        report(id, ALPHA_CAPTAIN, 2, 1);
        report(id, BRAVO_CAPTAIN, 1, 1);

        const result = report(id, ALPHA_CAPTAIN, 1, 1);

        assert.equal(result.outcome, "finalized");
        assert.deepEqual(getMatch(db, id), { home_score: 1, away_score: 1, status: "finished" });
        assert.equal(
            db.prepare("SELECT COUNT(*) FROM match_reports WHERE match_id = ?").pluck().get(id),
            2,
        );
    });

    it("refuses reports once the match is finished", () => {
        const id = addMatch(db);
        recordMatchResult(db, id, { homeScore: 0, awayScore: 0 }, { now: NOW });

        const result = report(id, ALPHA_CAPTAIN, 1, 0);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.deepEqual(getMatch(db, id), { home_score: 0, away_score: 0, status: "finished" });
    });

    it("refuses reports before kick-off and outside the active season", () => {
        const future = addMatch(db, { date: "2026-11-03T17:00:00" });
        const otherSeason = addMatch(db, { seasonId: 2 });
        const noSeason = addMatch(db);
        db.prepare("UPDATE matches SET season_id = NULL WHERE id = ?").run(noSeason);

        for (const id of [future, otherSeason, noSeason]) {
            const result = report(id, ALPHA_CAPTAIN, 1, 0);
            assert.equal(result.ok, false, `match ${id}`);
            assert.equal(result.status, 400);
        }
        assert.equal(db.prepare("SELECT COUNT(*) FROM match_reports").pluck().get(), 0);
    });

    it("only lets the captains of the two teams report", () => {
        const id = addMatch(db);

        for (const playerId of [2, 4, 5, 999]) {
            const result = report(id, playerId, 1, 0);
            assert.equal(result.ok, false, `player ${playerId}`);
            assert.equal(result.status, 403);
        }
        assert.equal(report(999, ALPHA_CAPTAIN, 1, 0).status, 404);
    });

    it("validates scores and scorers like recordMatchResult", () => {
        const id = addMatch(db);

        assert.equal(report(id, ALPHA_CAPTAIN, -1, 0).ok, false);
        assert.equal(report(id, ALPHA_CAPTAIN, 1, "x").ok, false);
        // More scorer goals than the team scored
        assert.equal(report(id, ALPHA_CAPTAIN, 1, 3, [{ playerId: 2, goals: 2 }]).ok, false);
        // Opponent's player and a player without a team
        assert.equal(report(id, ALPHA_CAPTAIN, 1, 0, [{ playerId: 3, goals: 1 }]).ok, false);
        assert.equal(report(id, ALPHA_CAPTAIN, 1, 0, [{ playerId: 5, goals: 1 }]).ok, false);
        // Duplicate scorer, invalid count, not a list
        assert.equal(
            report(id, ALPHA_CAPTAIN, 2, 0, [
                { playerId: 2, goals: 1 },
                { playerId: 2, goals: 1 },
            ]).ok,
            false,
        );
        assert.equal(report(id, ALPHA_CAPTAIN, 2, 0, [{ playerId: 2, goals: 1.5 }]).ok, false);
        assert.equal(report(id, ALPHA_CAPTAIN, 2, 0, "Béla").ok, false);

        assert.equal(db.prepare("SELECT COUNT(*) FROM match_reports").pluck().get(), 0);
    });

    it("validates scorers against the reporting team's score, not the opponent's", () => {
        const id = addMatch(db);

        assert.equal(report(id, BRAVO_CAPTAIN, 0, 2, [{ playerId: 4, goals: 2 }]).ok, true);
        assert.equal(report(id, BRAVO_CAPTAIN, 2, 0, [{ playerId: 4, goals: 2 }]).ok, false);
    });

    it("keeps agreeing reports for the admin if the result can't be recorded", () => {
        const id = addMatch(db);
        report(id, ALPHA_CAPTAIN, 1, 0, [{ playerId: 2, goals: 1 }]);
        // Béla leaves Alpha before the other captain reports
        db.exec("UPDATE players SET team_id = NULL WHERE id = 2");

        const result = report(id, BRAVO_CAPTAIN, 1, 0);

        assert.equal(result.ok, true);
        assert.equal(result.outcome, "mismatch");
        assert.match(result.finalizeError, /Alpha/);
        assert.equal(getMatch(db, id).status, "upcoming");
        assert.deepEqual(
            listSeasonMismatches(db, 1).map((m) => [m.matchId, m.scoresAgree]),
            [[id, true]],
        );
    });
});

describe("listSeasonMismatches", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("lists upcoming matches with two reports, both side by side", () => {
        const mismatch = addMatch(db);
        const oneReport = addMatch(db);
        submitMatchReport(db, mismatch, ALPHA_CAPTAIN, { homeScore: 2, awayScore: 1, scorers: [{ playerId: 2, goals: 1 }] }, { now: NOW });
        submitMatchReport(db, mismatch, BRAVO_CAPTAIN, { homeScore: 1, awayScore: 1 }, { now: NOW });
        submitMatchReport(db, oneReport, ALPHA_CAPTAIN, { homeScore: 0, awayScore: 0 }, { now: NOW });

        const [item, ...rest] = listSeasonMismatches(db, 1);

        assert.equal(rest.length, 0);
        assert.equal(item.matchId, mismatch);
        assert.equal(item.scoresAgree, false);
        assert.equal(item.home.teamId, 1);
        assert.deepEqual([item.home.homeScore, item.home.awayScore], [2, 1]);
        assert.deepEqual(item.home.scorers, [{ playerId: 2, goals: 1, playerName: "Béla" }]);
        assert.deepEqual(item.home.reportedBy, { id: ALPHA_CAPTAIN, name: "Ádám" });
        assert.equal(item.away.teamId, 2);
        assert.deepEqual([item.away.homeScore, item.away.awayScore], [1, 1]);
        assert.deepEqual(listSeasonMismatches(db, 2), []);
    });

    it("drops the match once the admin records the result", () => {
        const id = addMatch(db);
        submitMatchReport(db, id, ALPHA_CAPTAIN, { homeScore: 2, awayScore: 1 }, { now: NOW });
        submitMatchReport(db, id, BRAVO_CAPTAIN, { homeScore: 1, awayScore: 1 }, { now: NOW });

        recordMatchResult(db, id, { homeScore: 2, awayScore: 1 }, { now: NOW });

        assert.deepEqual(listSeasonMismatches(db, 1), []);
        assert.equal(countOpenMismatches(db), 0);
    });
});

describe("getReportForm", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    const form = (matchId, playerId) => getReportForm(db, matchId, playerId, { now: NOW });

    it("tells non-captains apart without details", () => {
        const id = addMatch(db);
        assert.deepEqual(form(id, 2), { ok: true, isCaptain: false });
        assert.deepEqual(form(id, 5), { ok: true, isCaptain: false });
        assert.equal(form(999, ALPHA_CAPTAIN).status, 404);
    });

    it("gives the captain their team's players and follows the report state", () => {
        const id = addMatch(db);

        const open = form(id, ALPHA_CAPTAIN);
        assert.equal(open.canReport, true);
        assert.equal(open.state, "open");
        assert.equal(open.team.id, 1);
        assert.deepEqual(open.team.players.map((p) => p.id), [1, 2]);

        submitMatchReport(db, id, BRAVO_CAPTAIN, { homeScore: 1, awayScore: 0 }, { now: NOW });
        const otherReported = form(id, ALPHA_CAPTAIN);
        assert.equal(otherReported.state, "other-reported");
        assert.equal(otherReported.report, null);
        // The other team's numbers are not shown to the captain
        assert.equal(otherReported.otherTeamReported, true);
        assert.equal(form(id, BRAVO_CAPTAIN).state, "waiting");

        submitMatchReport(db, id, ALPHA_CAPTAIN, { homeScore: 2, awayScore: 0 }, { now: NOW });
        assert.equal(form(id, ALPHA_CAPTAIN).state, "mismatch");

        recordMatchResult(db, id, { homeScore: 2, awayScore: 0 }, { now: NOW });
        const finished = form(id, ALPHA_CAPTAIN);
        assert.equal(finished.state, "finished");
        assert.equal(finished.canReport, false);
        assert.ok(finished.reason);
    });

    it("explains why a report isn't possible yet", () => {
        const id = addMatch(db, { date: "2026-11-05T18:00:00" });
        const result = form(id, ALPHA_CAPTAIN);
        assert.equal(result.canReport, false);
        assert.match(result.reason, /még nem kezdődött el/);
    });
});
