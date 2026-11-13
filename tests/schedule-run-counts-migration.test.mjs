// Tests for migration 010 (preference counts on schedule runs), on an in-memory
// database with the schema as it was before it.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m010 from "../lib/migrations/010_schedule_run_preference_counts.js";

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('a-league', 'A League', 'HU');
        INSERT INTO seasons (id, name, status) VALUES (1, '2026 ősz', 'generated');
        INSERT INTO schedule_runs (id, season_id, league_id, algorithm_score, status)
        VALUES (1, 1, 'a-league', 67, 'archived');
    `);
    return db;
}

describe("migration 010_schedule_run_preference_counts", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
        m010.up(db);
    });

    it("keeps an old run's score and leaves its counts empty", () => {
        assert.deepEqual(
            db
                .prepare(
                    `SELECT algorithm_score, preferred_sides, unavailable_sides, total_sides
                     FROM schedule_runs WHERE id = 1`,
                )
                .get(),
            {
                algorithm_score: 67,
                preferred_sides: null,
                unavailable_sides: null,
                total_sides: null,
            },
        );
    });

    it("stores the counts of a new run", () => {
        db.prepare(
            `INSERT INTO schedule_runs
             (id, season_id, league_id, algorithm_score, preferred_sides, unavailable_sides, total_sides)
             VALUES (2, 1, 'a-league', NULL, 18, 1, 30)`,
        ).run();
        assert.deepEqual(
            db
                .prepare(
                    `SELECT algorithm_score, preferred_sides, unavailable_sides, total_sides
                     FROM schedule_runs WHERE id = 2`,
                )
                .get(),
            {
                algorithm_score: null,
                preferred_sides: 18,
                unavailable_sides: 1,
                total_sides: 30,
            },
        );
    });
});
