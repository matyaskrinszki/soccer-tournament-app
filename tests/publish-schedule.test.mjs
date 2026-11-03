// Tests for lib/publish-schedule.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import { publishSeasonSchedule } from "../lib/publish-schedule.js";

// 002 only repairs old databases and is a no-op on a fresh one
function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    return db;
}

// One league with 4 teams, a season with one pitch, and four slots on one evening
function seed(db, { seasonStatus = "generated" } = {}) {
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('test-league', 'Test League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'A', 'test-league'), (2, 'B', 'test-league'),
            (3, 'C', 'test-league'), (4, 'D', 'test-league');
    `);
    db.prepare(
        "INSERT INTO seasons (id, name, status) VALUES (1, 'Spring', ?)",
    ).run(seasonStatus);
    db.exec(`
        INSERT INTO pitches (id, season_id, name) VALUES (1, 1, 'Pitch 1');
        INSERT INTO time_slots (id, season_id, pitch_id, slot_date, day_of_week, start_time, end_time) VALUES
            (1, 1, 1, '2026-03-02', 0, '17:00', '18:00'),
            (2, 1, 1, '2026-03-02', 0, '18:00', '19:00'),
            (3, 1, 1, '2026-03-09', 0, '17:00', '18:00'),
            (4, 1, 1, NULL, 0, '19:00', '20:00');
    `);
}

function addRun(db, { id, status, matches }) {
    db.prepare(
        "INSERT INTO schedule_runs (id, season_id, league_id, status) VALUES (?, 1, 'test-league', ?)",
    ).run(id, status);
    const insert = db.prepare(
        `INSERT INTO scheduled_matches (schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id, round_number)
         VALUES (?, ?, ?, ?, 1, ?)`,
    );
    matches.forEach(([home, away, slotId], index) => {
        insert.run(id, home, away, slotId, index + 1);
    });
}

const seasonStatus = (db) =>
    db.prepare("SELECT status FROM seasons WHERE id = 1").get().status;
const matchCount = (db) =>
    db.prepare("SELECT COUNT(*) as count FROM matches").get().count;

describe("publishSeasonSchedule", () => {
    let db;

    beforeEach(() => {
        db = createDatabase();
        seed(db);
    });

    it("copies the current run into matches and activates the season", () => {
        addRun(db, {
            id: 1,
            status: "current",
            matches: [
                [3, 4, 3],
                [1, 2, 1],
            ],
        });

        const result = publishSeasonSchedule(db, 1);

        assert.deepEqual(result, {
            ok: true,
            seasonName: "Spring",
            publishedMatchCount: 2,
            leagueCount: 1,
        });
        assert.equal(seasonStatus(db), "active");

        const matches = db
            .prepare(
                `SELECT league_id, season_id, home_team_id, away_team_id, home_score,
                        away_score, match_date, status
                 FROM matches ORDER BY match_date`,
            )
            .all();
        assert.deepEqual(matches, [
            {
                league_id: "test-league",
                season_id: 1,
                home_team_id: 1,
                away_team_id: 2,
                home_score: null,
                away_score: null,
                match_date: "2026-03-02T17:00:00",
                status: "upcoming",
            },
            {
                league_id: "test-league",
                season_id: 1,
                home_team_id: 3,
                away_team_id: 4,
                home_score: null,
                away_score: null,
                match_date: "2026-03-09T17:00:00",
                status: "upcoming",
            },
        ]);
    });

    it("links each match to the scheduled match it came from", () => {
        addRun(db, { id: 1, status: "current", matches: [[1, 2, 1]] });
        publishSeasonSchedule(db, 1);

        const row = db
            .prepare(
                `SELECT m.home_team_id, sm.home_team_id as scheduledHome
                 FROM matches m JOIN scheduled_matches sm ON sm.id = m.scheduled_match_id`,
            )
            .get();
        assert.equal(row.home_team_id, row.scheduledHome);
    });

    it("ignores archived runs", () => {
        addRun(db, { id: 1, status: "archived", matches: [[1, 2, 1], [3, 4, 2]] });
        addRun(db, { id: 2, status: "current", matches: [[1, 3, 3]] });

        const result = publishSeasonSchedule(db, 1);

        assert.equal(result.publishedMatchCount, 1);
        assert.deepEqual(
            db.prepare("SELECT home_team_id, away_team_id FROM matches").all(),
            [{ home_team_id: 1, away_team_id: 3 }],
        );
    });

    it("refuses to publish twice", () => {
        addRun(db, { id: 1, status: "current", matches: [[1, 2, 1]] });
        publishSeasonSchedule(db, 1);

        const again = publishSeasonSchedule(db, 1);

        assert.equal(again.ok, false);
        assert.equal(again.status, 400);
        assert.equal(matchCount(db), 1);
    });

    it("refuses when matches exist even if the status was changed back by hand", () => {
        addRun(db, { id: 1, status: "current", matches: [[1, 2, 1]] });
        publishSeasonSchedule(db, 1);
        db.prepare("UPDATE seasons SET status = 'generated' WHERE id = 1").run();

        const again = publishSeasonSchedule(db, 1);

        assert.equal(again.status, 409);
        assert.equal(matchCount(db), 1);
    });

    it("refuses when there is no current schedule", () => {
        addRun(db, { id: 1, status: "archived", matches: [[1, 2, 1]] });

        const result = publishSeasonSchedule(db, 1);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(seasonStatus(db), "generated");
    });

    it("refuses a schedule with an undated slot and changes nothing", () => {
        addRun(db, { id: 1, status: "current", matches: [[1, 2, 1], [3, 4, 4]] });

        const result = publishSeasonSchedule(db, 1);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(matchCount(db), 0);
        assert.equal(seasonStatus(db), "generated");
    });

    it("returns 404 for an unknown season", () => {
        const result = publishSeasonSchedule(db, 99);
        assert.deepEqual(result, {
            ok: false,
            status: 404,
            error: "Szezon nem található",
        });
    });

    it("rolls back everything if an insert fails midway", () => {
        addRun(db, { id: 1, status: "current", matches: [[1, 2, 1], [3, 4, 2]] });
        // Pre-existing legacy match already claims the second scheduled match
        db.prepare(
            `INSERT INTO matches (league_id, scheduled_match_id, home_team_id, away_team_id, match_date, status)
             VALUES ('test-league', 2, 3, 4, '2026-01-01', 'upcoming')`,
        ).run();

        assert.throws(() => publishSeasonSchedule(db, 1), /UNIQUE/);
        assert.equal(matchCount(db), 1);
        assert.equal(seasonStatus(db), "generated");
    });
});
