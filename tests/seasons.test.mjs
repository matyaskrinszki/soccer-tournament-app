// Tests for lib/seasons.js, lib/statistics.js and migration 005 on an in-memory
// database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import * as m005 from "../lib/migrations/005_drop_team_stat_columns.js";
import { listDisplaySeasons, resolveDisplaySeason } from "../lib/seasons.js";
import { getSeasonStatistics } from "../lib/statistics.js";

function createDatabase() {
    const db = new Database(":memory:");
    for (const migration of [m001, m003, m004, m005]) {
        migration.up(db);
    }
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES
            ('a-league', 'A League', 'HU'),
            ('b-league', 'B League', 'AT');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league'),
            (3, 'Charlie', 'a-league'),
            (4, 'Delta', 'b-league'),
            (5, 'Echo', 'b-league');
        INSERT INTO players (id, email, password, name, team_id) VALUES
            (1, 'a@example.com', 'x', 'Ann', 1),
            (2, 'b@example.com', 'x', 'Bob', 2),
            (3, 'd@example.com', 'x', 'Dan', 4);
    `);
    return db;
}

let nextId;
function addSeason(db, { id, status, start = null, end = null, sample = false }) {
    db.prepare(
        `INSERT INTO seasons (id, name, status, start_date, end_date, is_sample)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, `Season ${id}`, status, start, end, sample ? 1 : 0);
}

function addMatch(db, { seasonId, home = 1, away = 2, league = "a-league", score = null }) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-01T18:00:00', ?)`,
    ).run(
        id,
        league,
        seasonId,
        home,
        away,
        score?.[0] ?? null,
        score?.[1] ?? null,
        score ? "finished" : "upcoming",
    );
    return id;
}

function addGoals(db, matchId, playerId, teamId, count) {
    for (let i = 0; i < count; i++) {
        db.prepare(
            "INSERT INTO goals (match_id, team_id, player_id) VALUES (?, ?, ?)",
        ).run(matchId, teamId, playerId);
    }
}

const ids = (seasons) => seasons.map((season) => season.id);

describe("listDisplaySeasons", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("orders active, then completed, then the sample season, then the rest", () => {
        addSeason(db, { id: 1, status: "completed", end: "2025-12-01", sample: true });
        addSeason(db, { id: 2, status: "generated", end: "2027-01-01" });
        addSeason(db, { id: 3, status: "completed", end: "2026-06-01" });
        addSeason(db, { id: 4, status: "active", start: "2026-09-01" });
        addSeason(db, { id: 5, status: "completed", end: "2026-01-01" });
        for (const seasonId of [1, 2, 3, 4, 5]) addMatch(db, { seasonId });

        assert.deepEqual(ids(listDisplaySeasons(db)), [4, 3, 5, 1, 2]);
    });

    it("puts the latest active season first", () => {
        addSeason(db, { id: 1, status: "active", start: "2026-02-01" });
        addSeason(db, { id: 2, status: "active", start: "2026-09-01" });
        addMatch(db, { seasonId: 1 });
        addMatch(db, { seasonId: 2 });

        assert.deepEqual(ids(listDisplaySeasons(db)), [2, 1]);
    });

    it("leaves out seasons without matches and converts isSample", () => {
        addSeason(db, { id: 1, status: "completed", sample: true });
        addSeason(db, { id: 2, status: "active" });
        addMatch(db, { seasonId: 1 });

        const seasons = listDisplaySeasons(db);

        assert.deepEqual(ids(seasons), [1]);
        assert.equal(seasons[0].isSample, true);
    });

    it("can be limited to the seasons a team played in", () => {
        addSeason(db, { id: 1, status: "active" });
        addSeason(db, { id: 2, status: "completed" });
        addMatch(db, { seasonId: 1, home: 1, away: 2 });
        addMatch(db, { seasonId: 2, home: 2, away: 3 });

        assert.deepEqual(ids(listDisplaySeasons(db, { teamId: 3 })), [2]);
        assert.deepEqual(ids(listDisplaySeasons(db, { teamId: 2 })), [1, 2]);
    });
});

describe("resolveDisplaySeason", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
        addSeason(db, { id: 1, status: "active" });
        addSeason(db, { id: 2, status: "completed" });
        addSeason(db, { id: 3, status: "setup" });
        addMatch(db, { seasonId: 1 });
        addMatch(db, { seasonId: 2 });
    });

    it("uses the default season when none is requested", () => {
        for (const requested of [null, undefined, ""]) {
            const result = resolveDisplaySeason(db, requested);
            assert.equal(result.ok, true);
            assert.equal(result.season.id, 1);
            assert.deepEqual(ids(result.seasons), [1, 2]);
        }
    });

    it("returns the requested season, given as a string", () => {
        assert.equal(resolveDisplaySeason(db, "2").season.id, 2);
    });

    it("rejects unknown ids, seasons without matches and garbage with 404", () => {
        for (const requested of ["99", "3", "abc"]) {
            const result = resolveDisplaySeason(db, requested);
            assert.equal(result.ok, false, `requested: ${requested}`);
            assert.equal(result.status, 404);
        }
    });

    it("returns no season when nothing has been published", () => {
        const empty = createDatabase();
        assert.deepEqual(resolveDisplaySeason(empty, null), { ok: true, season: null, seasons: [] });
    });
});

describe("getSeasonStatistics", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
        addSeason(db, { id: 1, status: "active" });
        addSeason(db, { id: 2, status: "completed" });
    });

    it("counts only the requested season", () => {
        const match = addMatch(db, { seasonId: 1, score: [2, 1] });
        addGoals(db, match, 1, 1, 2);
        addGoals(db, match, 2, 2, 1);
        addMatch(db, { seasonId: 1, home: 2, away: 3 });
        const other = addMatch(db, { seasonId: 2, home: 2, away: 1, score: [7, 0] });
        addGoals(db, other, 2, 2, 7);

        const stats = getSeasonStatistics(db, 1);

        assert.deepEqual(
            stats.topScorers.map((s) => [s.name, s.goals]),
            [
                ["Ann", 2],
                ["Bob", 1],
            ],
        );
        assert.deepEqual(stats.matchStats, {
            totalMatches: 2,
            finishedMatches: 1,
            upcomingMatches: 1,
            avgGoalsPerMatch: 3,
            maxGoalsInMatch: 3,
        });
        assert.deepEqual(stats.highestScoringMatches.map((m) => m.totalGoals), [3]);
    });

    it("takes team figures from the calculated standings", () => {
        addMatch(db, { seasonId: 1, home: 1, away: 2, score: [3, 0] });
        addMatch(db, { seasonId: 1, home: 2, away: 3, score: [1, 1] });
        addMatch(db, { seasonId: 1, home: 4, away: 5, league: "b-league", score: [0, 2] });

        const stats = getSeasonStatistics(db, 1);

        assert.deepEqual(
            stats.topTeams.map((t) => [t.name, t.points, t.winPercentage]),
            [
                ["Alpha", 3, 100],
                ["Echo", 3, 100],
                ["Charlie", 1, 0],
                ["Bravo", 1, 0],
                ["Delta", 0, 0],
            ],
        );
        assert.deepEqual(
            stats.defensiveTeams.slice(0, 2).map((t) => [t.name, t.goalsAgainst, t.avgConcededPerMatch]),
            [
                ["Alpha", 0, 0],
                ["Echo", 0, 0],
            ],
        );
        assert.deepEqual(
            stats.leagueStats.map((l) => [l.id, l.teamCount, l.totalMatches, l.finishedMatches]),
            [
                ["a-league", 3, 2, 2],
                ["b-league", 2, 1, 1],
            ],
        );
    });

    it("leaves teams without a finished match out of the team lists", () => {
        addMatch(db, { seasonId: 1, home: 1, away: 2 });

        const stats = getSeasonStatistics(db, 1);

        assert.deepEqual(stats.topTeams, []);
        assert.deepEqual(stats.defensiveTeams, []);
        assert.equal(stats.leagueStats[0].teamCount, 2);
    });
});

describe("migration 005_drop_team_stat_columns", () => {
    it("drops the stored counters and keeps the teams", () => {
        const db = new Database(":memory:");
        m001.up(db);
        m003.up(db);
        m004.up(db);
        db.exec(`
            INSERT INTO leagues (id, name) VALUES ('a-league', 'A League');
            INSERT INTO teams (id, name, league_id, points) VALUES (1, 'Alpha', 'a-league', 9);
        `);

        m005.up(db);

        const columns = db.pragma("table_info(teams)").map((column) => column.name);
        assert.deepEqual(columns, ["id", "name", "league_id", "captain_player_id"]);
        assert.deepEqual(db.prepare("SELECT id, name FROM teams").all(), [{ id: 1, name: "Alpha" }]);
    });
});
