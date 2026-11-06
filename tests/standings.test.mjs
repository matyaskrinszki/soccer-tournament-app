// Tests for lib/standings.js. The table rules are tested on plain objects, the
// season loading on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import { calculateStandings, getSeasonStandings } from "../lib/standings.js";

const team = (id, name) => ({ id, name });
const result = (homeTeamId, awayTeamId, homeScore, awayScore) => ({
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
});
const names = (rows) => rows.map((row) => row.name);

describe("calculateStandings", () => {
    it("counts wins, draws, losses, goals and points for both sides", () => {
        const rows = calculateStandings(
            [team(1, "Alpha"), team(2, "Bravo"), team(3, "Charlie")],
            [result(1, 2, 3, 1), result(2, 3, 2, 2)],
        );

        const byId = new Map(rows.map((row) => [row.id, row]));
        assert.deepEqual(byId.get(1), {
            position: 1, id: 1, name: "Alpha", played: 1, wins: 1, draws: 0, losses: 0,
            goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 3,
        });
        assert.deepEqual(byId.get(2), {
            position: 3, id: 2, name: "Bravo", played: 2, wins: 0, draws: 1, losses: 1,
            goalsFor: 3, goalsAgainst: 5, goalDifference: -2, points: 1,
        });
        assert.deepEqual(byId.get(3), {
            position: 2, id: 3, name: "Charlie", played: 1, wins: 0, draws: 1, losses: 0,
            goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 1,
        });
    });

    it("lists teams without matches with zeros", () => {
        const rows = calculateStandings([team(1, "Alpha"), team(2, "Bravo")], []);

        assert.deepEqual(names(rows), ["Alpha", "Bravo"]);
        assert.equal(rows[0].played, 0);
        assert.equal(rows[0].points, 0);
    });

    it("orders by points, then goal difference, then goals scored", () => {
        // Every team only plays "Zero", which ends up last. Each neighbouring pair is
        // decided by a different rule, against what the next rule would say.
        const rows = calculateStandings(
            [team(1, "Few"), team(2, "Many"), team(3, "Diff"), team(4, "Points"), team(9, "Zero")],
            [
                result(4, 9, 1, 0), // Points: 6 pts, +2 (lower GD than Diff)
                result(4, 9, 1, 0),
                result(3, 9, 3, 0), // Diff: 3 pts, +3, 3 scored (fewer than Many)
                result(2, 9, 4, 2), // Many: 3 pts, +2, 4 scored
                result(1, 9, 2, 0), // Few: 3 pts, +2, 2 scored
            ],
        );

        assert.deepEqual(names(rows), ["Points", "Diff", "Many", "Few", "Zero"]);
        assert.deepEqual(rows.map((row) => row.position), [1, 2, 3, 4, 5]);
    });

    it("breaks a tie on points, goal difference and goals with head-to-head", () => {
        // Alpha and Zulu both end on 3 pts, 1-1 goals; Zulu won their match, so it
        // goes first even though Alpha comes first alphabetically.
        const rows = calculateStandings(
            [team(1, "Alpha"), team(2, "Zulu"), team(3, "Top"), team(4, "Bottom")],
            [
                result(2, 1, 1, 0), // Zulu beats Alpha
                result(3, 2, 1, 0), // Top beats Zulu
                result(1, 4, 1, 0), // Alpha beats Bottom
            ],
        );

        assert.deepEqual(names(rows), ["Top", "Zulu", "Alpha", "Bottom"]);
    });

    it("uses head-to-head among the tied teams only", () => {
        // Three teams level at 3 pts, 1-1 goals, beating each other in a circle:
        // their head-to-head is level too, so they fall back to name order.
        const rows = calculateStandings(
            [team(1, "Charlie"), team(2, "Alpha"), team(3, "Bravo")],
            [result(1, 2, 1, 0), result(2, 3, 1, 0), result(3, 1, 1, 0)],
        );

        assert.deepEqual(names(rows), ["Alpha", "Bravo", "Charlie"]);
    });

    it("orders teams level on everything by name", () => {
        const rows = calculateStandings([team(1, "Bravo"), team(2, "Alpha")], [result(1, 2, 1, 1)]);

        assert.deepEqual(names(rows), ["Alpha", "Bravo"]);
    });

    it("ignores matches against teams not in the table", () => {
        const rows = calculateStandings([team(1, "Alpha")], [result(1, 99, 5, 0)]);

        assert.equal(rows[0].played, 0);
    });
});

describe("getSeasonStandings", () => {
    let db;
    let nextId;

    function addMatch({ seasonId, league = "a-league", home, away, score = null, status }) {
        const id = nextId++;
        const finished = status ?? (score ? "finished" : "upcoming");
        db.prepare(
            `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id,
                                  home_score, away_score, match_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-01T18:00:00', ?)`,
        ).run(id, league, seasonId, home, away, score?.[0] ?? null, score?.[1] ?? null, finished);
        return id;
    }

    beforeEach(() => {
        nextId = 1;
        db = new Database(":memory:");
        m001.up(db);
        m003.up(db);
        db.exec(`
            INSERT INTO leagues (id, name, country) VALUES
                ('a-league', 'A League', 'HU'),
                ('b-league', 'B League', 'AT');
            INSERT INTO teams (id, name, league_id) VALUES
                (1, 'Alpha', 'a-league'),
                (2, 'Bravo', 'a-league'),
                (3, 'Charlie', 'a-league'),
                (4, 'Latecomer', 'a-league'),
                (5, 'Delta', 'b-league'),
                (6, 'Echo', 'b-league');
            INSERT INTO seasons (id, name, status) VALUES
                (1, '2026 ősz', 'active'),
                (2, '2027 tavasz', 'active');
        `);
    });

    it("counts only finished matches of the requested season", () => {
        addMatch({ seasonId: 1, home: 1, away: 2, score: [2, 0] });
        addMatch({ seasonId: 2, home: 2, away: 1, score: [5, 0] });
        // Sample data without a season must never mix into a season's table
        addMatch({ seasonId: null, home: 2, away: 1, score: [5, 0] });

        const [league] = getSeasonStandings(db, 1);

        assert.deepEqual(names(league.teams), ["Alpha", "Bravo"]);
        assert.equal(league.teams[0].points, 3);
        assert.equal(league.teams[1].played, 1);
    });

    it("lists teams whose matches are all upcoming, with zeros", () => {
        addMatch({ seasonId: 1, home: 1, away: 2, score: [1, 0] });
        addMatch({ seasonId: 1, home: 3, away: 1 });

        const [league] = getSeasonStandings(db, 1);

        const charlie = league.teams.find((row) => row.name === "Charlie");
        assert.equal(charlie.played, 0);
        assert.equal(league.teams.find((row) => row.name === "Alpha").played, 1);
    });

    it("leaves out teams of the league that have no match in the season", () => {
        addMatch({ seasonId: 1, home: 1, away: 2, score: [1, 0] });

        const [league] = getSeasonStandings(db, 1);

        assert.ok(!names(league.teams).includes("Latecomer"));
    });

    it("skips finished matches that are missing a score", () => {
        addMatch({ seasonId: 1, home: 1, away: 2, status: "finished" });

        const [league] = getSeasonStandings(db, 1);

        assert.ok(league.teams.every((row) => row.played === 0));
    });

    it("returns one table per league in the season, ordered by name", () => {
        addMatch({ seasonId: 1, league: "b-league", home: 5, away: 6, score: [0, 1] });
        addMatch({ seasonId: 1, home: 1, away: 2, score: [1, 0] });

        const leagues = getSeasonStandings(db, 1);

        assert.deepEqual(
            leagues.map((league) => [league.id, league.name, league.country]),
            [
                ["a-league", "A League", "HU"],
                ["b-league", "B League", "AT"],
            ],
        );
        assert.deepEqual(names(leagues[1].teams), ["Echo", "Delta"]);
    });

    it("returns no leagues for a season without matches", () => {
        assert.deepEqual(getSeasonStandings(db, 2), []);
    });
});
