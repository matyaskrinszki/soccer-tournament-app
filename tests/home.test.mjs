// Tests for lib/home.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import { getHomeData, toLocalDateTimeKey } from "../lib/home.js";

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 2026-11-03 12:00 local

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES
            ('a-league', 'A League', 'HU'),
            ('b-league', 'B League', 'HU'),
            ('empty-league', 'Empty League', 'HU');
        INSERT INTO teams (id, name, league_id, matches, wins, draws, losses, points) VALUES
            (1, 'Alpha', 'a-league', 3, 3, 0, 0, 9),
            (2, 'Bravo', 'a-league', 3, 1, 1, 1, 4),
            (3, 'Charlie', 'a-league', 3, 1, 1, 1, 4),
            (4, 'Delta', 'a-league', 3, 0, 0, 3, 0),
            (5, 'Echo', 'b-league', 0, 0, 0, 0, 0);
    `);
    return db;
}

let nextId = 1;
function addMatch(db, { home = 1, away = 2, date, status, score = [null, null] }) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, home_team_id, away_team_id, home_score, away_score, match_date, status)
         VALUES (?, 'a-league', ?, ?, ?, ?, ?, ?)`,
    ).run(id, home, away, score[0], score[1], date, status);
    return id;
}

describe("toLocalDateTimeKey", () => {
    it("formats local time without a time zone, zero-padded", () => {
        assert.equal(
            toLocalDateTimeKey(new Date(2026, 0, 5, 7, 3, 9)),
            "2026-01-05T07:03:09",
        );
    });
});

describe("getHomeData", () => {
    let db;

    beforeEach(() => {
        nextId = 1;
        db = createDatabase();
    });

    it("returns empty lists when there are no matches", () => {
        const data = getHomeData(db, { now: NOW });
        assert.deepEqual(data.latestResults, []);
        assert.deepEqual(data.nextFixtures, []);
    });

    describe("latest results", () => {
        it("lists finished matches newest first, with names and scores", () => {
            addMatch(db, { date: "2026-10-01T00:00:00.000Z", status: "finished", score: [1, 0] });
            const newest = addMatch(db, {
                home: 3,
                away: 4,
                date: "2026-10-20T18:00:00",
                status: "finished",
                score: [2, 2],
            });

            const { latestResults } = getHomeData(db, { now: NOW });

            assert.equal(latestResults.length, 2);
            assert.deepEqual(latestResults[0], {
                id: newest,
                leagueId: "a-league",
                leagueName: "A League",
                homeTeamId: 3,
                homeTeamName: "Charlie",
                awayTeamId: 4,
                awayTeamName: "Delta",
                homeScore: 2,
                awayScore: 2,
                matchDate: "2026-10-20T18:00:00",
            });
        });

        it("ignores upcoming matches and respects the limit", () => {
            for (let day = 1; day <= 7; day++) {
                addMatch(db, { date: `2026-10-0${day}T18:00:00`, status: "finished", score: [0, 0] });
            }
            addMatch(db, { date: "2026-10-30T18:00:00", status: "upcoming" });

            const { latestResults } = getHomeData(db, { now: NOW, matchLimit: 3 });

            assert.deepEqual(
                latestResults.map((m) => m.matchDate),
                ["2026-10-07T18:00:00", "2026-10-06T18:00:00", "2026-10-05T18:00:00"],
            );
        });
    });

    describe("next fixtures", () => {
        it("lists upcoming matches from now on, soonest first", () => {
            addMatch(db, { date: "2026-11-10T18:00:00", status: "upcoming" });
            addMatch(db, { date: "2026-11-03T17:00:00", status: "upcoming" });
            addMatch(db, { date: "2026-11-05T19:00:00", status: "upcoming" });

            const { nextFixtures } = getHomeData(db, { now: NOW });

            assert.deepEqual(
                nextFixtures.map((m) => m.matchDate),
                ["2026-11-03T17:00:00", "2026-11-05T19:00:00", "2026-11-10T18:00:00"],
            );
        });

        it("leaves out upcoming matches already in the past", () => {
            addMatch(db, { date: "2026-11-03T11:00:00", status: "upcoming" }); // earlier today
            addMatch(db, { date: "2026-02-01T00:00:00.000Z", status: "upcoming" }); // sample data
            addMatch(db, { date: "2026-11-04T17:00:00", status: "upcoming" });

            const { nextFixtures } = getHomeData(db, { now: NOW });

            assert.deepEqual(nextFixtures.map((m) => m.matchDate), ["2026-11-04T17:00:00"]);
        });

        it("respects the limit", () => {
            for (let day = 4; day <= 9; day++) {
                addMatch(db, { date: `2026-11-0${day}T18:00:00`, status: "upcoming" });
            }
            const { nextFixtures } = getHomeData(db, { now: NOW, matchLimit: 2 });
            assert.equal(nextFixtures.length, 2);
        });
    });

    describe("standings summary", () => {
        it("gives the top teams of each league with teams, by points then name", () => {
            const { standings } = getHomeData(db, { now: NOW, topTeams: 3 });

            assert.deepEqual(
                standings.map((league) => [league.id, league.teamCount]),
                [
                    ["a-league", 4],
                    ["b-league", 1],
                ],
            );
            assert.deepEqual(
                standings[0].teams.map((team) => [team.name, team.points]),
                [
                    ["Alpha", 9],
                    ["Bravo", 4],
                    ["Charlie", 4],
                ],
            );
        });
    });
});
