// Tests for lib/calendar.js on an in-memory database with the real schema.
// Run: npm test

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import * as m001 from "../lib/migrations/001_initial_schema.js";
import * as m003 from "../lib/migrations/003_link_matches_to_schedule.js";
import * as m004 from "../lib/migrations/004_sample_season.js";
import { buildTeamCalendar, escapeText, foldLine } from "../lib/calendar.js";

const NOW = new Date(Date.UTC(2026, 10, 11, 9, 30, 0)); // 2026-11-11 09:30 UTC

function createDatabase() {
    const db = new Database(":memory:");
    m001.up(db);
    m003.up(db);
    m004.up(db);
    db.exec(`
        INSERT INTO leagues (id, name, country) VALUES ('egyetemi', 'Egyetemi Liga', 'HU');
        INSERT INTO teams (id, name, league_id) VALUES
            (1, 'Győri Ősök', 'egyetemi'),
            (2, 'Bravo, FC', 'egyetemi'),
            (3, 'Charlie', 'egyetemi');
        INSERT INTO seasons (id, name, status, is_sample) VALUES
            (1, '2026 ősz', 'active', 0),
            (2, 'Bemutató szezon', 'completed', 1),
            (3, '2027 tavasz', 'setup', 0);
        INSERT INTO pitches (id, season_id, name, location) VALUES
            (1, 1, 'Lágymányos 1', 'Budapest, Pázmány P. stny. 1/A');
        INSERT INTO time_slots (id, season_id, pitch_id, slot_date, day_of_week, start_time, end_time)
            VALUES (1, 1, 1, '2026-11-12', 3, '18:00', '19:30');
        INSERT INTO schedule_runs (id, season_id, league_id) VALUES (1, 1, 'egyetemi');
        INSERT INTO scheduled_matches (id, schedule_run_id, home_team_id, away_team_id, time_slot_id, pitch_id)
            VALUES (1, 1, 1, 2, 1, 1);
    `);
    return db;
}

function addMatch(db, { id, seasonId = 1, home = 1, away = 2, date, status = "upcoming", score = [null, null], scheduledMatchId = null }) {
    db.prepare(
        `INSERT INTO matches (id, league_id, season_id, scheduled_match_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, 'egyetemi', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, seasonId, scheduledMatchId, home, away, score[0], score[1], date, status);
}

// Unfolded lines of the file, and the events as {property: value} maps
function parse(ics) {
    const lines = ics.replace(/\r\n /g, "").split("\r\n");
    const events = [];
    let current = null;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") current = {};
        else if (line === "END:VEVENT") {
            events.push(current);
            current = null;
        } else if (current) {
            const colon = line.indexOf(":");
            current[line.slice(0, colon)] = line.slice(colon + 1);
        }
    }
    return { lines, events };
}

describe("buildTeamCalendar", () => {
    let db;
    beforeEach(() => {
        db = createDatabase();
    });

    it("returns one event per published match of the team, with Budapest times", () => {
        addMatch(db, { id: 10, date: "2026-11-12T18:00:00", scheduledMatchId: 1 });
        addMatch(db, { id: 11, home: 3, away: 1, date: "2026-11-19T20:00:00" });
        addMatch(db, { id: 12, home: 2, away: 3, date: "2026-11-19T21:00:00" }); // not team 1

        const result = buildTeamCalendar(db, 1, { now: NOW });

        assert.equal(result.ok, true);
        assert.equal(result.eventCount, 2);
        const { lines, events } = parse(result.ics);
        assert.equal(lines[0], "BEGIN:VCALENDAR");
        assert.ok(lines.includes("TZID:Europe/Budapest"));
        assert.deepEqual(events.map((e) => e.UID), [
            "match-10@soccer-tournament-app",
            "match-11@soccer-tournament-app",
        ]);

        const [first, second] = events;
        assert.equal(first["DTSTART;TZID=Europe/Budapest"], "20261112T180000");
        // Ends when the time slot ends
        assert.equal(first["DTEND;TZID=Europe/Budapest"], "20261112T193000");
        assert.equal(first.DTSTAMP, "20261111T093000Z");
        assert.equal(first.SUMMARY, "Győri Ősök - Bravo\\, FC");
        assert.equal(first.LOCATION, "Lágymányos 1\\, Budapest\\, Pázmány P. stny. 1/A");
        assert.equal(first.DESCRIPTION, "Liga: Egyetemi Liga\\nSzezon: 2026 ősz");

        // No time slot or pitch: default length, no location
        assert.equal(second.SUMMARY, "Charlie - Győri Ősök");
        assert.equal(second["DTEND;TZID=Europe/Budapest"], "20261119T210000");
        assert.equal(second.LOCATION, undefined);
    });

    it("puts the result of finished matches in the summary", () => {
        addMatch(db, { id: 10, date: "2026-11-05T18:00:00", status: "finished", score: [3, 1] });

        const [event] = parse(buildTeamCalendar(db, 1, { now: NOW }).ics).events;

        assert.equal(event.SUMMARY, "Győri Ősök 3 - 1 Bravo\\, FC");
        assert.match(event.DESCRIPTION, /Végeredmény: 3 - 1/);
    });

    it("leaves out the sample season and unpublished seasons", () => {
        addMatch(db, { id: 10, seasonId: 2, date: "2025-03-01T18:00:00", status: "finished", score: [1, 0] });
        addMatch(db, { id: 11, seasonId: 3, date: "2027-03-01T18:00:00" });

        const result = buildTeamCalendar(db, 1, { now: NOW });

        assert.equal(result.eventCount, 0);
        assert.deepEqual(parse(result.ics).events, []);
        assert.ok(result.ics.endsWith("END:VCALENDAR\r\n"));
    });

    it("keeps the UID of a match when its time changes", () => {
        addMatch(db, { id: 10, date: "2026-11-12T18:00:00" });
        const before = parse(buildTeamCalendar(db, 1, { now: NOW }).ics).events[0];
        db.exec("UPDATE matches SET match_date = '2026-11-13T19:00:00' WHERE id = 10");

        const after = parse(buildTeamCalendar(db, 1, { now: NOW }).ics).events[0];

        assert.equal(after.UID, before.UID);
        assert.equal(after["DTSTART;TZID=Europe/Budapest"], "20261113T190000");
    });

    it("names the file after the team in ASCII", () => {
        assert.equal(buildTeamCalendar(db, 1, { now: NOW }).filename, "merkozesek-gyori-osok.ics");
    });

    it("returns 404 for an unknown team", () => {
        const result = buildTeamCalendar(db, 999, { now: NOW });
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
    });

    it("keeps every line within 75 bytes", () => {
        db.exec(`UPDATE teams SET name = '${"Árvíztűrő tükörfúrógép ".repeat(5)}' WHERE id = 2`);
        addMatch(db, { id: 10, date: "2026-11-12T18:00:00" });

        const { ics } = buildTeamCalendar(db, 1, { now: NOW });

        for (const line of ics.split("\r\n")) {
            assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
        }
    });
});

describe("escapeText and foldLine", () => {
    it("escapes backslashes, semicolons, commas and newlines", () => {
        assert.equal(escapeText("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
    });

    it("folds long lines without splitting multi-byte characters", () => {
        const line = `SUMMARY:${"ő".repeat(60)}`;
        const folded = foldLine(line);
        const parts = folded.split("\r\n");

        assert.ok(parts.length > 1);
        assert.ok(parts.slice(1).every((part) => part.startsWith(" ")));
        assert.ok(parts.every((part) => Buffer.byteLength(part, "utf8") <= 75));
        assert.equal(folded.replace(/\r\n /g, ""), line);
        assert.equal(foldLine("SHORT:line"), "SHORT:line");
    });
});
