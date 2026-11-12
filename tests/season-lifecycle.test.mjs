// Tests for lib/season-registration.js, lib/season-status.js, the publish rules
// that depend on the season status, and migration 006, on an in-memory database
// with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import * as m005 from "../lib/migrations/005_drop_team_stat_columns.js";
import * as m006 from "../lib/migrations/006_season_teams.js";
import {
    MIN_PLAYERS_TO_REGISTER,
    getTeamSeasonRegistrations,
    isTeamRegistered,
    listSeasonTeams,
    registerTeam,
    unregisterTeam,
} from "../lib/season-registration.js";
import { closeRegistration, completeSeason } from "../lib/season-status.js";
import { publishSeasonSchedule } from "../lib/publish-schedule.js";

function createDatabase() {
    const db = new Database(":memory:");
    for (const migration of [m001, m003, m004, m005, m006]) {
        migration.up(db);
    }
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES
            ('a-league', 'A League', 'HU'),
            ('b-league', 'B League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league'),
            (3, 'Charlie', 'b-league');
    `);
    return db;
}

let nextPlayerId;
function addPlayers(db, teamId, count) {
    const insert = db.prepare(
        "INSERT INTO players (id, email, password, name, team_id) VALUES (?, ?, 'x', ?, ?)",
    );
    for (let i = 0; i < count; i++) {
        const id = nextPlayerId++;
        insert.run(id, `p${id}@example.com`, `Player ${id}`, teamId);
    }
}

function addSeason(db, id, status) {
    db.prepare("INSERT INTO seasons (id, name, status) VALUES (?, ?, ?)").run(
        id,
        `Season ${id}`,
        status,
    );
}

function register(db, seasonId, teamId) {
    db.prepare("INSERT INTO season_teams (season_id, team_id) VALUES (?, ?)").run(seasonId, teamId);
}

const statusOf = (db, seasonId) =>
    db.prepare("SELECT status FROM seasons WHERE id = ?").pluck().get(seasonId);

describe("registerTeam / unregisterTeam", () => {
    let db;
    beforeEach(() => {
        nextPlayerId = 1;
        db = createDatabase();
        addSeason(db, 1, "setup");
        addSeason(db, 2, "team-preferences");
        addPlayers(db, 1, MIN_PLAYERS_TO_REGISTER);
        addPlayers(db, 2, MIN_PLAYERS_TO_REGISTER - 1);
    });

    it("registers a team with enough players for a season in setup", () => {
        assert.deepEqual(registerTeam(db, 1, 1), { ok: true });
        assert.equal(isTeamRegistered(db, 1, 1), true);
    });

    it("refuses a team with too few players and says how many it has", () => {
        const result = registerTeam(db, 1, 2);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.match(result.error, /jelenleg 4/);
        assert.equal(isTeamRegistered(db, 1, 2), false);
    });

    it("refuses registering twice", () => {
        registerTeam(db, 1, 1);
        assert.equal(registerTeam(db, 1, 1).status, 400);
    });

    it("only changes registrations while the season is in setup", () => {
        register(db, 2, 1);

        assert.equal(registerTeam(db, 2, 2).status, 400);
        assert.equal(unregisterTeam(db, 2, 1).status, 400);
        assert.equal(isTeamRegistered(db, 2, 1), true);
    });

    it("returns 404 for an unknown season or team", () => {
        assert.equal(registerTeam(db, 99, 1).status, 404);
        assert.equal(registerTeam(db, 1, 99).status, 404);
    });

    it("withdraws a registered team, and refuses one that isn't registered", () => {
        registerTeam(db, 1, 1);

        assert.deepEqual(unregisterTeam(db, 1, 1), { ok: true });
        assert.equal(isTeamRegistered(db, 1, 1), false);
        assert.equal(unregisterTeam(db, 1, 1).status, 400);
    });
});

describe("registration listings", () => {
    let db;
    beforeEach(() => {
        nextPlayerId = 1;
        db = createDatabase();
        addPlayers(db, 1, 6);
        addSeason(db, 1, "setup");
        addSeason(db, 2, "setup");
        addSeason(db, 3, "active");
        addSeason(db, 4, "completed");
        register(db, 1, 1);
        register(db, 3, 1);
    });

    it("gives a team the setup seasons plus the seasons it is registered for", () => {
        const { playerCount, minPlayers, seasons } = getTeamSeasonRegistrations(db, 1);

        assert.equal(playerCount, 6);
        assert.equal(minPlayers, MIN_PLAYERS_TO_REGISTER);
        assert.deepEqual(
            seasons.map((s) => [s.id, s.registered]).sort(),
            [
                [1, true],
                [2, false],
                [3, true],
            ],
        );
    });

    it("lists every team for the admin with player counts and registration", () => {
        const teams = listSeasonTeams(db, 1);

        assert.deepEqual(
            teams.map((t) => [t.name, t.leagueName, t.playerCount, t.registered]),
            [
                ["Alpha", "A League", 6, true],
                ["Bravo", "A League", 0, false],
                ["Charlie", "B League", 0, false],
            ],
        );
    });

    it("sorts names with an accented capital in Hungarian order, not after Z", () => {
        db.exec(`
            INSERT INTO teams (id, name, league_id) VALUES
                (4, 'Zulu', 'a-league'),
                (5, 'Építész', 'a-league');
        `);

        assert.deepEqual(
            listSeasonTeams(db, 1).map((t) => t.name),
            ["Alpha", "Bravo", "Építész", "Zulu", "Charlie"],
        );
    });
});

describe("closeRegistration", () => {
    let db;
    beforeEach(() => {
        nextPlayerId = 1;
        db = createDatabase();
        addSeason(db, 1, "setup");
        addPlayers(db, 1, 5);
        addPlayers(db, 2, 5);
        addPlayers(db, 3, 5);
    });

    it("moves the season to team-preferences when every check passes", () => {
        register(db, 1, 1);
        register(db, 1, 2);

        assert.deepEqual(closeRegistration(db, 1), { ok: true });
        assert.equal(statusOf(db, 1), "team-preferences");
    });

    it("re-checks player counts and names the teams that dropped below", () => {
        register(db, 1, 1);
        register(db, 1, 2);
        db.prepare("UPDATE players SET team_id = NULL WHERE id = 6").run(); // Bravo: 4 left

        const result = closeRegistration(db, 1);

        assert.equal(result.ok, false);
        assert.deepEqual(result.teams.map((t) => [t.name, t.playerCount]), [["Bravo", 4]]);
        assert.match(result.error, /Bravo \(4\)/);
        assert.equal(statusOf(db, 1), "setup");
    });

    it("refuses a league with a single registered team", () => {
        register(db, 1, 1);
        register(db, 1, 2);
        register(db, 1, 3);

        const result = closeRegistration(db, 1);

        assert.equal(result.ok, false);
        assert.deepEqual(result.leagues, [{ id: "b-league", name: "B League" }]);
        assert.equal(statusOf(db, 1), "setup");
    });

    it("refuses a season without registrations", () => {
        assert.equal(closeRegistration(db, 1).status, 400);
    });

    it("only works in setup, and returns 404 for an unknown season", () => {
        addSeason(db, 2, "team-preferences");
        assert.equal(closeRegistration(db, 2).status, 400);
        assert.equal(closeRegistration(db, 99).status, 404);
    });
});

describe("completeSeason", () => {
    let db;
    const addMatch = (status, seasonId = 1) =>
        db
            .prepare(
                `INSERT INTO matches (league_id, season_id, home_team_id, away_team_id,
                                      home_score, away_score, match_date, status)
                 VALUES ('a-league', ?, 1, 2, ?, ?, '2026-10-01T18:00:00', ?)`,
            )
            .run(
                seasonId,
                status === "finished" ? 1 : null,
                status === "finished" ? 0 : null,
                status,
            );

    beforeEach(() => {
        db = createDatabase();
        addSeason(db, 1, "active");
    });

    it("completes an active season once every match has a result", () => {
        addMatch("finished");
        addMatch("finished");

        assert.deepEqual(completeSeason(db, 1), { ok: true });
        assert.equal(statusOf(db, 1), "completed");
    });

    it("refuses while matches are missing a result, and says how many", () => {
        addMatch("finished");
        addMatch("upcoming");
        addMatch("upcoming");

        const result = completeSeason(db, 1);

        assert.equal(result.ok, false);
        assert.match(result.error, /2 mérkőzésnek/);
        assert.equal(statusOf(db, 1), "active");
    });

    it("only completes active seasons", () => {
        addSeason(db, 2, "generated");
        assert.equal(completeSeason(db, 2).status, 400);
        assert.equal(completeSeason(db, 99).status, 404);
    });
});

describe("publishing and the season status", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
    });

    // One pitch, one slot and one scheduled match, all with ids equal to the season id
    function addGeneratedSchedule(seasonId) {
        db.prepare("INSERT INTO pitches (id, season_id, name) VALUES (?, ?, 'Pitch')").run(
            seasonId,
            seasonId,
        );
        db.prepare(
            "INSERT INTO time_slots (id, season_id, pitch_id, slot_date, day_of_week, start_time, end_time) VALUES (?, ?, ?, '2026-03-02', 0, '17:00', '18:00')",
        ).run(seasonId, seasonId, seasonId);
        const runId = Number(
            db
                .prepare(
                    "INSERT INTO schedule_runs (season_id, league_id, status) VALUES (?, 'a-league', 'current')",
                )
                .run(seasonId).lastInsertRowid,
        );
        db.prepare(
            "INSERT INTO scheduled_matches (schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id) VALUES (?, 1, 2, ?, ?)",
        ).run(runId, seasonId, seasonId);
    }

    it("only publishes a season whose schedule was generated", () => {
        addSeason(db, 1, "team-preferences");
        addGeneratedSchedule(1);

        const result = publishSeasonSchedule(db, 1);

        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
        assert.equal(statusOf(db, 1), "team-preferences");
    });

    it("refuses while another season is active", () => {
        addSeason(db, 1, "generated");
        addSeason(db, 2, "active");
        addGeneratedSchedule(1);

        const result = publishSeasonSchedule(db, 1);

        assert.equal(result.ok, false);
        assert.equal(result.status, 409);
        assert.match(result.error, /Season 2/);
        assert.equal(db.prepare("SELECT COUNT(*) FROM matches").pluck().get(), 0);
    });

    it("lets the database refuse a second active season", () => {
        addSeason(db, 1, "active");
        assert.throws(() => addSeason(db, 2, "active"), /UNIQUE/);
    });
});

describe("migration 006_season_teams", () => {
    function createOldDatabase() {
        const db = new Database(":memory:");
        for (const migration of [m001, m003, m004, m005]) {
            migration.up(db);
        }
        db.exec(`
            INSERT INTO leagues (id, name) VALUES ('a-league', 'A League');
            INSERT INTO teams (id, name, league_id) VALUES
                (1, 'Alpha', 'a-league'), (2, 'Bravo', 'a-league'), (3, 'Charlie', 'a-league');
            INSERT INTO seasons (id, name, status) VALUES
                (1, 'Played', 'active'), (2, 'Preferences', 'team-preferences'), (3, 'Setup', 'setup');
            INSERT INTO pitches (id, season_id, name) VALUES (1, 2, 'Pitch');
            INSERT INTO time_slots (id, season_id, pitch_id, day_of_week, start_time, end_time)
                VALUES (1, 2, 1, 0, '17:00', '18:00');
            INSERT INTO matches (league_id, season_id, home_team_id, away_team_id, match_date, status)
                VALUES ('a-league', 1, 1, 2, '2026-10-01T18:00:00', 'upcoming');
            INSERT INTO team_availability_preferences (season_id, team_id, time_slot_id, preference)
                VALUES (2, 3, 1, 'preferred');
        `);
        return db;
    }

    it("registers teams from existing matches and preferences", () => {
        const db = createOldDatabase();

        m006.up(db);

        const rows = db
            .prepare("SELECT season_id, team_id FROM season_teams ORDER BY season_id, team_id")
            .raw()
            .all();
        assert.deepEqual(rows, [
            [1, 1],
            [1, 2],
            [2, 3],
        ]);
    });

    it("fails with the season names if more than one season is active", () => {
        const db = createOldDatabase();
        db.prepare("UPDATE seasons SET status = 'active' WHERE id = 3").run();

        assert.throws(() => m006.up(db), /Played, Setup/);
    });
});
