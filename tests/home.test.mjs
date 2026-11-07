// Tests for lib/home.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import * as m005 from "../lib/migrations/005_drop_team_stat_columns.js";
import { getHomeData, toLocalDateTimeKey } from "../lib/home.js";

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 2026-11-03 12:00 local

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    m004.up(db);
    m005.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES
            ('a-league', 'A League', 'HU'),
            ('b-league', 'B League', 'HU'),
            ('empty-league', 'Empty League', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Alpha', 'a-league'),
            (2, 'Bravo', 'a-league'),
            (3, 'Charlie', 'a-league'),
            (4, 'Delta', 'a-league'),
            (5, 'Echo', 'b-league'),
            (6, 'Foxtrot', 'b-league');
        INSERT INTO seasons (id, name, status, start_date, end_date) VALUES
            (1, '2026 ősz', 'active', '2026-09-01', '2026-12-15'),
            (2, '2025 ősz', 'completed', '2025-09-01', '2025-12-15');
    `);
    return db;
}

let nextId = 1;
function addMatch(
    db,
    { home = 1, away = 2, date, status, score = [null, null], seasonId = null, league = "a-league" },
) {
    const id = nextId++;
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id, home_score, away_score, match_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, league, seasonId, home, away, score[0], score[1], date, status);
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
        const finished = (home, away, score, seasonId = 1, league = "a-league") =>
            addMatch(db, {
                home,
                away,
                score,
                seasonId,
                league,
                date: "2026-10-01T18:00:00",
                status: "finished",
            });

        it("gives the top teams of each league in the default season", () => {
            finished(1, 2, [3, 0]);
            finished(3, 4, [1, 1]);
            finished(1, 3, [2, 1]);
            finished(5, 6, [0, 2], 1, "b-league");
            // The completed season must not leak into the active one
            finished(4, 1, [9, 0], 2);

            const { standingsSeason, standings } = getHomeData(db, { now: NOW, topTeams: 3 });

            assert.equal(standingsSeason.name, "2026 ősz");
            assert.deepEqual(
                standings.map((league) => [league.id, league.teamCount]),
                [
                    ["a-league", 4],
                    ["b-league", 2],
                ],
            );
            assert.deepEqual(
                standings[0].teams.map((team) => [team.position, team.name, team.points]),
                [
                    [1, "Alpha", 6],
                    [2, "Delta", 1],
                    [3, "Charlie", 1],
                ],
            );
        });

        it("has no tables while no season has matches", () => {
            const { standingsSeason, standings } = getHomeData(db, { now: NOW });

            assert.equal(standingsSeason, null);
            assert.deepEqual(standings, []);
        });
    });
});
