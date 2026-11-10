// Tests for migration 004 (sample matches move into a sample season), on an
// in-memory database with the schema as it was before it.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('a-league', 'A League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league');
        INSERT INTO players (id, email, password, name, team_id) VALUES
            (1, 'a@example.com', 'x', 'Scorer', 1);
        INSERT INTO seasons (id, name, status) VALUES (1, '2026 ősz', 'active');
    `);
    return db;
}

function addMatch(db, { id, seasonId = null, date, status, score = [null, null] }) {
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, 'a-league', ?, 1, 2, ?, ?, ?, ?)`,
    ).run(id, seasonId, score[0], score[1], date, status);
}

function addGoal(db, matchId) {
    db.prepare(
        "INSERT INTO goals (match_id, team_id, player_id) VALUES (?, 1, 1)",
    ).run(matchId);
}

describe("migration 004_sample_season", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
    });

    it("moves seasonless finished matches into one completed sample season", () => {
        addMatch(db, { id: 1, date: "2025-10-01T00:00:00.000Z", status: "finished", score: [2, 1] });
        addMatch(db, { id: 2, date: "2025-11-04T00:00:00.000Z", status: "finished", score: [0, 0] });

        m004.up(db);

        const season = db
            .prepare("SELECT id, name, status, start_date, end_date, is_sample FROM seasons WHERE is_sample = 1")
            .get();
        assert.deepEqual(
            { ...season, id: undefined },
            {
                id: undefined,
                name: m004.SAMPLE_SEASON_NAME,
                status: "completed",
                start_date: "2025-10-01",
                end_date: "2025-11-04",
                is_sample: 1,
            },
        );
        const seasonIds = db.prepare("SELECT DISTINCT season_id FROM matches").pluck().all();
        assert.deepEqual(seasonIds, [season.id]);
    });

    it("rewrites sample dates to the local format published matches use", () => {
        addMatch(db, { id: 1, date: "2025-10-01T00:00:00.000Z", status: "finished", score: [1, 0] });

        m004.up(db);

        const date = db.prepare("SELECT match_date FROM matches WHERE id = 1").pluck().get();
        assert.equal(date, "2025-10-01T00:00:00");
    });

    it("deletes seasonless upcoming matches and their goals", () => {
        addMatch(db, { id: 1, date: "2025-10-01T00:00:00.000Z", status: "finished", score: [1, 0] });
        addMatch(db, { id: 2, date: "2026-02-01T00:00:00.000Z", status: "upcoming" });
        addGoal(db, 1);
        addGoal(db, 2);

        m004.up(db);

        assert.deepEqual(db.prepare("SELECT id FROM matches").pluck().all(), [1]);
        assert.deepEqual(db.prepare("SELECT match_id FROM goals").pluck().all(), [1]);
    });

    it("leaves matches of real seasons untouched", () => {
        addMatch(db, { id: 1, seasonId: 1, date: "2026-10-01T18:00:00", status: "upcoming" });
        addMatch(db, { id: 2, date: "2025-10-01T00:00:00.000Z", status: "finished", score: [1, 0] });

        m004.up(db);

        const real = db.prepare("SELECT season_id, match_date, status FROM matches WHERE id = 1").get();
        assert.deepEqual(real, { season_id: 1, match_date: "2026-10-01T18:00:00", status: "upcoming" });
        assert.equal(db.prepare("SELECT is_sample FROM seasons WHERE id = 1").pluck().get(), 0);
    });

    it("only adds the column when there are no sample matches", () => {
        addMatch(db, { id: 1, date: "2026-02-01T00:00:00.000Z", status: "upcoming" });

        m004.up(db);

        assert.equal(db.prepare("SELECT COUNT(*) FROM seasons").pluck().get(), 1);
        assert.equal(db.prepare("SELECT COUNT(*) FROM matches").pluck().get(), 0);
    });
});
