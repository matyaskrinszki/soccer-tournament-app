// Tests for lib/player-stats.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import * as m005 from "../lib/migrations/005_drop_team_stat_columns.js";
import * as m007 from "../lib/migrations/007_goal_scorers.js";
import { getPlayerStats } from "../lib/player-stats.js";

// Ann plays for Alpha (she used to play for Bravo), Bob for Bravo, Tom has no team.
function createDatabase() {
    const db = new Database(":memory:");
    for (const migration of [m001, m003, m004, m005, m007]) {
        migration.up(db);
    }
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('a-league', 'A League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league'),
            (3, 'Charlie', 'a-league');
        INSERT INTO players (id, email, password, name, team_id) VALUES
            (1, 'a@example.com', 'x', 'Ann', 1),
            (2, 'b@example.com', 'x', 'Bob', 2),
            (3, 't@example.com', 'x', 'Tom', NULL);
        INSERT INTO seasons (id, name, status, start_date, end_date, is_sample) VALUES
            (1, 'Minta', 'completed', NULL, '2025-06-01', 1),
            (2, '2026 tavasz', 'completed', '2026-02-01', '2026-06-01', 0),
            (3, '2026 ősz', 'active', '2026-09-01', NULL, 0);
    `);
    return db;
}

let nextId;
function addMatch(db, { seasonId, home = 1, away = 2, date, score = null }) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, 'a-league', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, seasonId, home, away, score?.[0] ?? null, score?.[1] ?? null, date,
        score ? "finished" : "upcoming");
    return id;
}

function addGoals(db, matchId, teamId, playerId, count) {
    const insert = db.prepare("INSERT INTO goals (match_id, team_id, player_id) VALUES (?, ?, ?)");
    for (let i = 0; i < count; i++) insert.run(matchId, teamId, playerId);
}

describe("getPlayerStats", () => {
    let db;
    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("returns 404 for an unknown player", () => {
        const result = getPlayerStats(db, 999);
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
    });

    it("gives empty stats to a player without a team or goals", () => {
        addMatch(db, { seasonId: 3, date: "2026-10-01T18:00:00", score: [1, 0] });

        assert.deepEqual(getPlayerStats(db, 3), {
            ok: true,
            stats: { totalGoals: 0, goalsBySeason: [], teamSeason: null, teamMatches: [] },
        });
    });

    it("counts goals per season and team, best season first", () => {
        // Sample season: 1 goal for Alpha
        const sample = addMatch(db, { seasonId: 1, date: "2025-05-01T18:00:00", score: [1, 0] });
        addGoals(db, sample, 1, 1, 1);
        // Spring: 2 goals for Bravo, her former team, in one match
        const spring = addMatch(db, { seasonId: 2, home: 2, away: 3, date: "2026-03-01T18:00:00", score: [2, 0] });
        addGoals(db, spring, 2, 1, 2);
        // Autumn: 3 goals for Alpha in two matches
        const first = addMatch(db, { seasonId: 3, date: "2026-09-10T18:00:00", score: [2, 0] });
        const second = addMatch(db, { seasonId: 3, home: 3, away: 1, date: "2026-09-17T18:00:00", score: [0, 1] });
        addGoals(db, first, 1, 1, 2);
        addGoals(db, second, 1, 1, 1);
        // Bob's goal doesn't count for Ann
        addGoals(db, first, 2, 2, 1);

        const { stats } = getPlayerStats(db, 1);

        assert.equal(stats.totalGoals, 6);
        assert.deepEqual(
            stats.goalsBySeason.map((row) => [row.seasonName, row.teamName, row.goals, row.matchesWithGoal, row.isSample]),
            [
                ["2026 ősz", "Alpha", 3, 2, false],
                ["2026 tavasz", "Bravo", 2, 1, false],
                ["Minta", "Alpha", 1, 1, true],
            ],
        );
    });

    it("doesn't count goals recorded without a scorer", () => {
        // 3-0, one goal by Ann, two with an unknown scorer (no goal rows)
        const id = addMatch(db, { seasonId: 3, date: "2026-09-10T18:00:00", score: [3, 0] });
        addGoals(db, id, 1, 1, 1);

        assert.equal(getPlayerStats(db, 1).stats.totalGoals, 1);
    });

    it("lists the current team's matches in its display season, with the player's goals", () => {
        addMatch(db, { seasonId: 2, date: "2026-03-01T18:00:00", score: [1, 1] });
        const later = addMatch(db, { seasonId: 3, home: 3, away: 1, date: "2026-10-01T18:00:00" });
        const earlier = addMatch(db, { seasonId: 3, date: "2026-09-10T18:00:00", score: [2, 1] });
        addMatch(db, { seasonId: 3, home: 2, away: 3, date: "2026-09-12T18:00:00", score: [0, 0] });
        addGoals(db, earlier, 1, 1, 2);

        const { stats } = getPlayerStats(db, 1);

        assert.deepEqual(stats.teamSeason, { id: 3, name: "2026 ősz", status: "active", isSample: false });
        assert.deepEqual(stats.teamMatches.map((m) => [m.id, m.playerGoals]), [
            [earlier, 2],
            [later, 0],
        ]);
        assert.equal(stats.teamMatches[0].homeName, "Alpha");
        assert.equal(stats.teamMatches[1].status, "upcoming");
    });

    it("has no match list when the team has no matches yet", () => {
        addMatch(db, { seasonId: 3, home: 2, away: 3, date: "2026-09-12T18:00:00" });

        const { stats } = getPlayerStats(db, 1);

        assert.equal(stats.teamSeason, null);
        assert.deepEqual(stats.teamMatches, []);
    });
});
