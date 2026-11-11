// A team's published matches as an iCalendar (.ics) file (RFC 5545), for importing
// into Google Calendar or any other calendar app.
//
// - one VEVENT per match of the team in published seasons; the sample season is
//   left out, its matches never took place
// - times are local Budapest time (TZID=Europe/Budapest, defined in a VTIMEZONE),
//   the same as match_date, so no time zone conversion is needed
// - the UID only depends on the match id, so importing the file again updates the
//   events instead of duplicating them
//
// Takes the database as a parameter so it can be tested on its own.

export const TIME_ZONE = "Europe/Budapest";

// Matches without a time slot (none so far) get this length
export const DEFAULT_MATCH_MINUTES = 60;

const UID_DOMAIN = "soccer-tournament-app";

// Central European Time with the EU summer time rule (last Sunday of March and
// October), which Hungary follows
const VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    `TZID:${TIME_ZONE}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
];

/**
 * The team's calendar file.
 * @param {import("better-sqlite3").Database} db
 * @param {number} teamId
 * @param {Object} [options]
 * @param {Date} [options.now] - Written into DTSTAMP
 * @returns {{ok: true, filename: string, ics: string, eventCount: number}
 *   | {ok: false, status: number, error: string}}
 */
export function buildTeamCalendar(db, teamId, { now = new Date() } = {}) {
    const team = db.prepare("SELECT id, name FROM teams WHERE id = ?").get(teamId);
    if (!team) {
        return { ok: false, status: 404, error: "A csapat nem található" };
    }

    const matches = db
        .prepare(
            `SELECT m.id,
                    m.match_date as matchDate,
                    m.status,
                    m.home_score as homeScore,
                    m.away_score as awayScore,
                    ht.name as homeName,
                    at.name as awayName,
                    l.name as leagueName,
                    s.name as seasonName,
                    p.name as pitchName,
                    p.location as pitchLocation,
                    ts.end_time as endTime
             FROM matches m
             JOIN seasons s ON s.id = m.season_id
             JOIN teams ht ON ht.id = m.home_team_id
             JOIN teams at ON at.id = m.away_team_id
             LEFT JOIN leagues l ON l.id = m.league_id
             LEFT JOIN scheduled_matches sm ON sm.id = m.scheduled_match_id
             LEFT JOIN pitches p ON p.id = sm.pitch_id
             LEFT JOIN time_slots ts ON ts.id = sm.time_slot_id
             WHERE (m.home_team_id = ? OR m.away_team_id = ?)
               AND s.is_sample = 0
               AND s.status IN ('active', 'completed')
             ORDER BY m.match_date ASC, m.id ASC`,
        )
        .all(teamId, teamId);

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${UID_DOMAIN}//Futballbajnoksag//HU`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeText(`${team.name} mérkőzései`)}`,
        `X-WR-TIMEZONE:${TIME_ZONE}`,
        ...VTIMEZONE,
        ...matches.flatMap((match) => matchEvent(match, now)),
        "END:VCALENDAR",
    ];

    return {
        ok: true,
        filename: `merkozesek-${slugify(team.name) || team.id}.ics`,
        // RFC 5545: lines end with CRLF, including the last one
        ics: lines.map(foldLine).join("\r\n") + "\r\n",
        eventCount: matches.length,
    };
}

function matchEvent(match, now) {
    const start = parseLocalDateTime(match.matchDate);
    const end = endOf(start, match.endTime);
    const finished = match.status === "finished";

    const summary = finished
        ? `${match.homeName} ${match.homeScore} - ${match.awayScore} ${match.awayName}`
        : `${match.homeName} - ${match.awayName}`;
    const description = [
        match.leagueName && `Liga: ${match.leagueName}`,
        `Szezon: ${match.seasonName}`,
        finished && `Végeredmény: ${match.homeScore} - ${match.awayScore}`,
    ]
        .filter(Boolean)
        .join("\n");
    const location = [match.pitchName, match.pitchLocation].filter(Boolean).join(", ");

    return [
        "BEGIN:VEVENT",
        `UID:match-${match.id}@${UID_DOMAIN}`,
        `DTSTAMP:${formatUtc(now)}`,
        `DTSTART;TZID=${TIME_ZONE}:${formatLocal(start)}`,
        `DTEND;TZID=${TIME_ZONE}:${formatLocal(end)}`,
        `SUMMARY:${escapeText(summary)}`,
        ...(location ? [`LOCATION:${escapeText(location)}`] : []),
        `DESCRIPTION:${escapeText(description)}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
    ];
}

// match_date is "YYYY-MM-DDTHH:MM:SS" local time without a time zone. The parts
// are kept as wall-clock time; Date.UTC is only used to do the arithmetic.
function parseLocalDateTime(value) {
    const [, y, mo, d, h, mi, s = "0"] = value.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
    );
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

// The time slot's end on the kick-off day, or the default length if there is no
// slot or the end isn't after the start
function endOf(start, endTime) {
    const match = /^(\d{2}):(\d{2})/.exec(endTime ?? "");
    if (match) {
        const end = new Date(start);
        end.setUTCHours(+match[1], +match[2], 0, 0);
        if (end > start) return end;
    }
    return new Date(start.getTime() + DEFAULT_MATCH_MINUTES * 60 * 1000);
}

const pad = (n) => String(n).padStart(2, "0");

// Wall-clock time from parseLocalDateTime: YYYYMMDDTHHMMSS
function formatLocal(date) {
    return (
        `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
        `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
    );
}

// A real moment in UTC: YYYYMMDDTHHMMSSZ
function formatUtc(date) {
    return `${formatLocal(date)}Z`;
}

/**
 * Escape a TEXT value (RFC 5545 3.3.11): backslash, semicolon, comma and newline.
 * @param {string} value
 * @returns {string}
 */
export function escapeText(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to at most 75 octets per line (RFC 5545 3.1): continuation
 * lines start with a space. Counts UTF-8 bytes and never splits a character.
 * @param {string} line
 * @returns {string}
 */
export function foldLine(line) {
    const parts = [];
    let current = "";
    let bytes = 0;
    for (const char of line) {
        const size = Buffer.byteLength(char, "utf8");
        // The leading space of a continuation line counts too
        const limit = parts.length === 0 ? 75 : 74;
        if (bytes + size > limit) {
            parts.push(current);
            current = "";
            bytes = 0;
        }
        current += char;
        bytes += size;
    }
    parts.push(current);
    return parts.join("\r\n ");
}

// ASCII file name from a team name: "Győri ETO" -> "gyori-eto"
function slugify(name) {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
