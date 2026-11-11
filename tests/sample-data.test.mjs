// Tests for lib/sample-data.js: the seed of a new database, on an in-memory
// database with every migration applied.
// Run: npm test

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m002 from "../lib/migrations/002_fix_seasons_foreign_keys.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import * as m005 from "../lib/migrations/005_drop_team_stat_columns.js";
import * as m006 from "../lib/migrations/006_season_teams.js";
import * as m007 from "../lib/migrations/007_goal_scorers.js";
import * as m008 from "../lib/migrations/008_match_reports.js";
import {
    insertSampleData,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    SAMPLE_PLAYER_PASSWORD,
    PLAYERS_PER_TEAM,
    TEAMLESS_PLAYERS,
} from "../lib/sample-data.js";
import { validateAuth } from "../lib/validation.js";
import { getSeasonStandings } from "../lib/standings.js";

// Same as a first server start: migrations, then the seed in a transaction
function createSeededDatabase() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = OFF");
    for (const migration of [m001, m002, m003, m004, m005, m006, m007, m008]) {
        migration.up(db);
    }
    db.pragma("foreign_keys = ON");
    db.transaction(() => insertSampleData(db))();
    return db;
}

describe("insertSampleData", () => {
    let db;
    before(() => {
        db = createSeededDatabase();
    });

    it("creates Liga I-IV, which sort by name in tier order", () => {
        const leagues = db.prepare("SELECT id, name FROM leagues ORDER BY name").all();
        assert.deepEqual(leagues, [
            { id: "liga-1", name: "Liga I" },
            { id: "liga-2", name: "Liga II" },
            { id: "liga-3", name: "Liga III" },
            { id: "liga-4", name: "Liga IV" },
        ]);
    });

    it("gives every league six teams, each with a full roster and a captain", () => {
        const teams = db
            .prepare(
                `SELECT t.id, t.league_id as leagueId, t.captain_player_id as captainId,
                        c.team_id as captainTeamId, c.role as captainRole,
                        (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) as players
                 FROM teams t JOIN players c ON c.id = t.captain_player_id`,
            )
            .all();

        assert.equal(teams.length, 24);
        for (const leagueId of ["liga-1", "liga-2", "liga-3", "liga-4"]) {
            assert.equal(teams.filter((t) => t.leagueId === leagueId).length, 6, leagueId);
        }
        for (const team of teams) {
            assert.equal(team.players, PLAYERS_PER_TEAM, `team ${team.id}`);
            assert.equal(team.captainTeamId, team.id);
            assert.equal(team.captainRole, "Captain");
        }
        // Only captains have the Captain role
        assert.equal(
            db.prepare("SELECT COUNT(*) FROM players WHERE role = 'Captain'").pluck().get(),
            24,
        );
        assert.equal(
            db.prepare("SELECT COUNT(*) FROM players WHERE team_id IS NULL AND role = 'Player'").pluck().get(),
            TEAMLESS_PLAYERS,
        );
    });

    it("lets every seeded player log in with the shared password", () => {
        assert.equal(validateAuth.password(SAMPLE_PLAYER_PASSWORD), null);
        const hashes = db
            .prepare("SELECT DISTINCT password FROM players WHERE role != 'Admin'")
            .pluck()
            .all();

        assert.equal(hashes.length, 1);
        assert.equal(bcrypt.compareSync(SAMPLE_PLAYER_PASSWORD, hashes[0]), true);
        assert.ok(db.prepare("SELECT 1 FROM players WHERE email = 'player1@example.com'").get());
        assert.ok(db.prepare("SELECT 1 FROM players WHERE email = 'teamless1@example.com'").get());
    });

    it("creates the admin with its own password", () => {
        const admin = db
            .prepare("SELECT password, role, team_id FROM players WHERE email = ?")
            .get(ADMIN_EMAIL);

        assert.equal(admin.role, "Admin");
        assert.equal(admin.team_id, null);
        assert.equal(bcrypt.compareSync(ADMIN_PASSWORD, admin.password), true);
    });

    it("plays a completed sample season with a scorer for every goal", () => {
        const season = db.prepare("SELECT id, status, is_sample FROM seasons").all();
        assert.equal(season.length, 1);
        assert.equal(season[0].status, "completed");
        assert.equal(season[0].is_sample, 1);

        // Double round-robin: 6 teams -> 30 matches per league
        const matches = db
            .prepare(
                `SELECT m.id, m.status, m.season_id, m.home_team_id, m.away_team_id,
                        m.home_score + m.away_score as goals,
                        (SELECT COUNT(*) FROM goals g WHERE g.match_id = m.id) as scorers,
                        (SELECT COUNT(*) FROM goals g JOIN players p ON p.id = g.player_id
                         WHERE g.match_id = m.id AND p.team_id != g.team_id) as wrongTeam
                 FROM matches m`,
            )
            .all();
        assert.equal(matches.length, 120);
        for (const match of matches) {
            assert.equal(match.status, "finished");
            assert.equal(match.season_id, season[0].id);
            assert.equal(match.scorers, match.goals, `match ${match.id}`);
            assert.equal(match.wrongTeam, 0, `match ${match.id}`);
        }
        assert.equal(
            db.prepare("SELECT COUNT(*) FROM season_teams WHERE season_id = ?").pluck().get(season[0].id),
            24,
        );
    });

    it("gives tables in league order, with every team played 10 times", () => {
        const seasonId = db.prepare("SELECT id FROM seasons").pluck().get();
        const standings = getSeasonStandings(db, seasonId);

        assert.deepEqual(standings.map((league) => league.name), ["Liga I", "Liga II", "Liga III", "Liga IV"]);
        for (const league of standings) {
            assert.ok(league.teams.every((team) => team.played === 10), league.name);
        }
    });

    it("leaves no foreign key violations", () => {
        assert.deepEqual(db.pragma("foreign_key_check"), []);
    });

    it("gives the same names and scorers on every reseed", () => {
        const other = createSeededDatabase();
        const snapshot = (database) => ({
            names: database.prepare("SELECT id, name FROM players ORDER BY id").all(),
            goals: database.prepare("SELECT match_id, player_id FROM goals ORDER BY id").all(),
        });

        assert.deepEqual(snapshot(other), snapshot(db));
    });
});
