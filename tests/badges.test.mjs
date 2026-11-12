// Tests for lib/badges.js and migration 009 on an in-memory database with the
// real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m007 from "../lib/migrations/007_goal_scorers.js";
import * as m009 from "../lib/migrations/009_hidden_badges.js";
import { BADGES, getPlayerBadges, setBadgeVisibility } from "../lib/badges.js";

// Ann captains Alpha, Bob plays for Bravo, Tom has no team.
function createDatabase() {
    const db = new Database(":memory:");
    for (const migration of [m001, m003, m007, m009]) {
        migration.up(db);
    }
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('a-league', 'A League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES (1, 'Alpha', 'a-league'), (2, 'Bravo', 'a-league');
        INSERT INTO players (id, email, password, name, team_id) VALUES
            (1, 'a@example.com', 'x', 'Ann', 1),
            (2, 'b@example.com', 'x', 'Bob', 2),
            (3, 't@example.com', 'x', 'Tom', NULL);
        UPDATE teams SET captain_player_id = 1 WHERE id = 1;
        INSERT INTO matches (id, league_id, home_team_id, away_team_id, home_score, away_score, match_date, status)
        VALUES (1, 'a-league', 1, 2, 3, 2, '2026-10-01T18:00:00', 'finished'),
               (2, 'a-league', 2, 1, 2, 0, '2026-10-08T18:00:00', 'finished');
    `);
    return db;
}

function addGoals(db, matchId, teamId, playerId, count) {
    const insert = db.prepare("INSERT INTO goals (match_id, team_id, player_id) VALUES (?, ?, ?)");
    for (let i = 0; i < count; i++) insert.run(matchId, teamId, playerId);
}

const ids = (result) => result.badges.map((badge) => badge.id);

describe("getPlayerBadges", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
    });

    it("defines each badge once, with a Hungarian name", () => {
        assert.equal(new Set(BADGES.map((badge) => badge.id)).size, BADGES.length);
        for (const badge of BADGES) {
            assert.ok(badge.name && badge.description, badge.id);
        }
    });

    it("returns 404 for an unknown player", () => {
        assert.equal(getPlayerBadges(db, 999).status, 404);
    });

    it("gives no badges to a player without goals or captaincy", () => {
        assert.deepEqual(getPlayerBadges(db, 3), { ok: true, badges: [] });
    });

    it("awards the captain badge to the current captain only", () => {
        assert.deepEqual(ids(getPlayerBadges(db, 1)), ["captain"]);
        assert.deepEqual(ids(getPlayerBadges(db, 2)), []);

        db.exec("UPDATE teams SET captain_player_id = 2 WHERE id = 1");
        assert.deepEqual(ids(getPlayerBadges(db, 1)), []);
        assert.deepEqual(ids(getPlayerBadges(db, 2)), ["captain"]);
    });

    it("awards the first goal for one goal", () => {
        addGoals(db, 1, 2, 2, 1);
        assert.deepEqual(ids(getPlayerBadges(db, 2)), ["first-goal"]);
    });

    it("needs three goals in one match for a hat-trick, not three in total", () => {
        addGoals(db, 1, 2, 2, 2);
        addGoals(db, 2, 2, 2, 2);
        assert.deepEqual(ids(getPlayerBadges(db, 2)), ["first-goal"]);

        addGoals(db, 2, 2, 2, 1);
        assert.deepEqual(ids(getPlayerBadges(db, 2)), ["first-goal", "hat-trick"]);
    });

    it("doesn't count goals recorded without a scorer", () => {
        // Match 1 ended 3-2 for Alpha, but no Alpha goal has a scorer
        assert.deepEqual(ids(getPlayerBadges(db, 1)), ["captain"]);
    });

    it("shows earned badges as visible by default", () => {
        addGoals(db, 1, 1, 1, 3);
        const { badges } = getPlayerBadges(db, 1);
        assert.deepEqual(ids({ badges }), ["first-goal", "hat-trick", "captain"]);
        assert.ok(badges.every((badge) => badge.visible));
    });
});

describe("setBadgeVisibility", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
        addGoals(db, 1, 1, 1, 1);
    });

    const visibility = (result) => Object.fromEntries(result.badges.map((b) => [b.id, b.visible]));

    it("hides and shows a badge again", () => {
        const hidden = setBadgeVisibility(db, 1, "captain", false);
        assert.deepEqual(visibility(hidden), { "first-goal": true, captain: false });
        // Hiding twice is fine
        assert.equal(setBadgeVisibility(db, 1, "captain", false).ok, true);

        const shown = setBadgeVisibility(db, 1, "captain", true);
        assert.deepEqual(visibility(shown), { "first-goal": true, captain: true });
    });

    it("keeps a badge hidden if it is lost and earned again", () => {
        setBadgeVisibility(db, 1, "captain", false);
        db.exec("UPDATE teams SET captain_player_id = NULL WHERE id = 1");
        db.exec("UPDATE teams SET captain_player_id = 1 WHERE id = 1");

        assert.equal(visibility(getPlayerBadges(db, 1)).captain, false);
    });

    it("rejects unknown and unearned badges, bad values and unknown players", () => {
        assert.equal(setBadgeVisibility(db, 1, "nope", false).status, 400);
        assert.equal(setBadgeVisibility(db, 1, "hat-trick", false).status, 400);
        assert.equal(setBadgeVisibility(db, 1, "captain", "false").status, 400);
        assert.equal(setBadgeVisibility(db, 999, "captain", false).status, 404);
        assert.equal(db.prepare("SELECT COUNT(*) as n FROM hidden_badges").get().n, 0);
    });

    it("only changes the given player's settings", () => {
        db.exec("UPDATE teams SET captain_player_id = 2 WHERE id = 2");
        setBadgeVisibility(db, 1, "captain", false);

        assert.equal(visibility(getPlayerBadges(db, 2)).captain, true);
    });
});
