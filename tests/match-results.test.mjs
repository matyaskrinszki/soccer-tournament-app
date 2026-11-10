// Tests for lib/match-results.js and lib/admin-stats.js on an in-memory database
// with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m007 from "../lib/migrations/007_goal_scorers.js";
import * as m008 from "../lib/migrations/008_match_reports.js";
import {
    parseScore,
    listSeasonMatches,
    getMatchForResult,
    recordMatchResult,
} from "../lib/match-results.js";
import { getAdminStats } from "../lib/admin-stats.js";

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 2026-11-03 12:00 local

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
            (2, '2027 tavasz', 'setup');
    `);
    return db;
}

let nextId = 1;
function addMatch(db, { seasonId = 1, date, status = "upcoming", score = [null, null] }) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, 'a-league', ?, 1, 2, ?, ?, ?, ?)`,
    ).run(id, seasonId, score[0], score[1], date, status);
    return id;
}

function getMatch(db, id) {
    return db
        .prepare("SELECT home_score, away_score, status FROM matches WHERE id = ?")
        .get(id);
}

describe("parseScore", () => {
    it("accepts whole numbers and numeric strings in range", () => {
        assert.equal(parseScore(0), 0);
        assert.equal(parseScore("3"), 3);
        assert.equal(parseScore(99), 99);
    });

    it("rejects empty, negative, fractional, too large and non-numeric values", () => {
        for (const value of [null, undefined, "", -1, 1.5, 100, "abc", "2a"]) {
            assert.equal(parseScore(value), null, `value: ${value}`);
        }
    });
});

describe("listSeasonMatches", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("returns only the season's matches, in kick-off order, with team names", () => {
        const later = addMatch(db, { date: "2026-10-20T18:00:00" });
        const earlier = addMatch(db, { date: "2026-10-13T17:00:00" });
        addMatch(db, { seasonId: 2, date: "2026-10-01T17:00:00" });

        const matches = listSeasonMatches(db, 1);

        assert.deepEqual(matches.map((m) => m.id), [earlier, later]);
        assert.equal(matches[0].homeTeamName, "Alpha");
        assert.equal(matches[0].awayTeamName, "Bravo");
        assert.equal(matches[0].leagueName, "A League");
    });
});

describe("recordMatchResult", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("stores the score and marks the match finished", () => {
        // Goals without a scorer go to the captains
        db.exec(`
            INSERT INTO players (id, email, password, team_id) VALUES
                (1, 'a@example.com', 'x', 1),
                (2, 'b@example.com', 'x', 2);
            UPDATE teams SET captain_player_id = id;
        `);
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        const result = recordMatchResult(db, id, { homeScore: "2", awayScore: 1 }, { now: NOW });

        assert.equal(result.ok, true);
        assert.deepEqual(getMatch(db, id), { home_score: 2, away_score: 1, status: "finished" });
    });

    it("lets a finished result be corrected", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00", status: "finished", score: [2, 1] });

        recordMatchResult(db, id, { homeScore: 0, awayScore: 0 }, { now: NOW });

        assert.deepEqual(getMatch(db, id), { home_score: 0, away_score: 0, status: "finished" });
    });

    it("rejects invalid scores without changing the match", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        const result = recordMatchResult(db, id, { homeScore: -1, awayScore: 2 }, { now: NOW });

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(getMatch(db, id).status, "upcoming");
    });

    it("rejects matches that haven't kicked off yet", () => {
        const id = addMatch(db, { date: "2026-11-03T17:00:00" });

        const result = recordMatchResult(db, id, { homeScore: 1, awayScore: 0 }, { now: NOW });

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(getMatch(db, id).status, "upcoming");
    });

    it("returns 404 for an unknown match", () => {
        const result = recordMatchResult(db, 999, { homeScore: 1, awayScore: 0 }, { now: NOW });
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
    });
});

describe("goal scorers", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
        // Alpha: 1 (captain), 2. Bravo: 3 (captain), 4. Player 5 has no team.
        db.exec(`
            INSERT INTO players (id, email, password, name, team_id) VALUES
                (1, 'p1@example.com', 'x', 'Ádám', 1),
                (2, 'p2@example.com', 'x', 'Béla', 1),
                (3, 'p3@example.com', 'x', 'Csaba', 2),
                (4, 'p4@example.com', 'x', 'Dénes', 2),
                (5, 'p5@example.com', 'x', 'Elek', NULL);
            UPDATE teams SET captain_player_id = 1 WHERE id = 1;
            UPDATE teams SET captain_player_id = 3 WHERE id = 2;
        `);
    });

    // Goal count per [teamId, playerId], in a stable order
    function goalCounts(matchId) {
        return db
            .prepare(
                `SELECT team_id, player_id, COUNT(*) as goals FROM goals
                 WHERE match_id = ? GROUP BY team_id, player_id ORDER BY team_id, player_id`,
            )
            .all(matchId)
            .map((row) => [row.team_id, row.player_id, row.goals]);
    }

    function record(matchId, homeScore, awayScore, scorers) {
        return recordMatchResult(db, matchId, { homeScore, awayScore, scorers }, { now: NOW });
    }

    it("stores one goal row per goal for the given scorers", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        const result = record(id, 3, 1, [
            { teamId: 1, playerId: 2, goals: 2 },
            { teamId: 1, playerId: 1, goals: "1" },
            { teamId: 2, playerId: 4, goals: 1 },
        ]);

        assert.equal(result.ok, true);
        assert.deepEqual(goalCounts(id), [
            [1, 1, 1],
            [1, 2, 2],
            [2, 4, 1],
        ]);
    });

    it("credits goals without a scorer to the team's captain", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        record(id, 3, 2, [{ teamId: 1, playerId: 2, goals: 1 }]);

        assert.deepEqual(goalCounts(id), [
            [1, 1, 2],
            [1, 2, 1],
            [2, 3, 2],
        ]);
    });

    it("adds the leftover goals to the captain's own count", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        record(id, 3, 0, [{ teamId: 1, playerId: 1, goals: 1 }]);

        assert.deepEqual(goalCounts(id), [[1, 1, 3]]);
    });

    it("rejects more scorer goals than the team scored, without changing anything", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        const result = record(id, 1, 0, [{ teamId: 1, playerId: 2, goals: 2 }]);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(getMatch(db, id).status, "upcoming");
        assert.deepEqual(goalCounts(id), []);
    });

    it("rejects leftover goals when the team has no captain", () => {
        db.exec("UPDATE teams SET captain_player_id = NULL WHERE id = 2");
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        assert.equal(record(id, 0, 1, []).ok, false);
        assert.equal(record(id, 0, 1, [{ teamId: 2, playerId: 4, goals: 1 }]).ok, true);
    });

    it("rejects scorers who don't play for the team", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        for (const scorer of [
            { teamId: 1, playerId: 3, goals: 1 }, // plays for the opponent
            { teamId: 1, playerId: 5, goals: 1 }, // has no team
            { teamId: 9, playerId: 1, goals: 1 }, // team not in the match
        ]) {
            const result = record(id, 1, 0, [scorer]);
            assert.equal(result.ok, false, JSON.stringify(scorer));
            assert.equal(result.status, 400);
        }
        assert.deepEqual(goalCounts(id), []);
    });

    it("rejects invalid goal counts, duplicate scorers and a non-list", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });

        assert.equal(record(id, 2, 0, [{ teamId: 1, playerId: 2, goals: -1 }]).ok, false);
        assert.equal(record(id, 2, 0, [{ teamId: 1, playerId: 2, goals: 1.5 }]).ok, false);
        assert.equal(
            record(id, 2, 0, [
                { teamId: 1, playerId: 2, goals: 1 },
                { teamId: 1, playerId: 2, goals: 1 },
            ]).ok,
            false,
        );
        assert.equal(record(id, 2, 0, "Béla").ok, false);
        assert.equal(getMatch(db, id).status, "upcoming");
    });

    it("replaces the scorers when a result is corrected", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });
        record(id, 2, 1, [{ teamId: 1, playerId: 2, goals: 2 }]);

        record(id, 1, 0, [{ teamId: 1, playerId: 1, goals: 1 }]);

        assert.deepEqual(goalCounts(id), [[1, 1, 1]]);
    });

    it("keeps a scorer who has since left the team eligible for corrections", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });
        record(id, 1, 0, [{ teamId: 1, playerId: 2, goals: 1 }]);
        db.exec("UPDATE players SET team_id = NULL WHERE id = 2");

        const result = record(id, 2, 0, [{ teamId: 1, playerId: 2, goals: 2 }]);

        assert.equal(result.ok, true);
        assert.deepEqual(goalCounts(id), [[1, 2, 2]]);
    });

    it("lists both teams' possible scorers with their recorded goals", () => {
        const id = addMatch(db, { date: "2026-10-20T18:00:00" });
        record(id, 2, 0, [{ teamId: 1, playerId: 2, goals: 2 }]);
        db.exec("UPDATE players SET team_id = NULL WHERE id = 2");

        const match = getMatchForResult(db, id);

        assert.equal(match.homeTeam.captainPlayerId, 1);
        assert.deepEqual(
            match.homeTeam.players.map((p) => [p.id, p.goals]),
            [
                [1, 0],
                [2, 2],
            ],
        );
        assert.deepEqual(match.awayTeam.players.map((p) => p.id), [3, 4]);
        assert.equal(getMatchForResult(db, 999), null);
    });
});

describe("getAdminStats", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("counts zero matches on an empty table", () => {
        const stats = getAdminStats(db, { now: NOW });
        assert.deepEqual(stats.matches, {
            total: 0,
            finished: 0,
            upcoming: 0,
            awaitingResult: 0,
            mismatches: 0,
        });
    });

    it("counts entities and splits matches by status", () => {
        db.exec(`
            INSERT INTO players (id, email, password) VALUES
                (1, 'a@example.com', 'x'),
                (2, 'b@example.com', 'x');
            INSERT INTO join_requests (player_id, team_id, status) VALUES
                (1, 1, 'pending'),
                (2, 1, 'rejected');
        `);
        addMatch(db, { date: "2026-10-13T17:00:00", status: "finished", score: [1, 0] });
        addMatch(db, { date: "2026-10-20T17:00:00" }); // played, no result yet
        addMatch(db, { date: "2026-11-10T17:00:00" }); // in the future

        assert.deepEqual(getAdminStats(db, { now: NOW }), {
            players: 2,
            teams: 2,
            leagues: 1,
            seasons: 2,
            activeSeasons: 1,
            pendingJoinRequests: 1,
            matches: { total: 3, finished: 1, upcoming: 2, awaitingResult: 1, mismatches: 0 },
        });
    });
});
