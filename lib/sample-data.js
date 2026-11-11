// Sample data for an empty database (called from lib/db.js): four university
// leagues, Liga I (top tier) to Liga IV, with six invented teams each, seven
// players per team, teamless players, an admin, and a completed sample season with
// results and scorers.
//
// Every seeded player can log in with SAMPLE_PLAYER_PASSWORD (emails
// player1@example.com ... and teamless1@example.com ...); the first player of each
// team is its captain. Names come from a seeded faker, so every reseed gives the
// same names and results.
//
// Takes the database as a parameter so it can be tested on its own.
import { fakerHU as faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { SAMPLE_SEASON_NAME } from "./migrations/004_sample_season.js";

export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_PASSWORD = "Admin1Password";

// Shared by all seeded players, for testing. Meets the signup password rules.
export const SAMPLE_PLAYER_PASSWORD = "Player1Password";

export const PLAYERS_PER_TEAM = 7;
export const TEAMLESS_PLAYERS = 20;

const FAKER_SEED = 2026;

// League names sort alphabetically in tier order up to Liga VIII, which the pages
// rely on (ORDER BY name)
export const SAMPLE_LEAGUES = [
    {
        id: "liga-1",
        name: "Liga I",
        teams: [
            "Lágymányosi Informatikusok",
            "Műegyetemi Mérnökök",
            "Közgáz Bikák",
            "Orvoskari Szikék",
            "Jogász Paragrafusok",
            "Bölcsész Vándorok",
        ],
    },
    {
        id: "liga-2",
        name: "Liga II",
        teams: [
            "Kollégium FC",
            "Matekos Deriváltak",
            "Fizikus Kvarkok",
            "Vegyész Katalizátorok",
            "Biológus Sejtek",
            "Tanárképzős Krétások",
        ],
    },
    {
        id: "liga-3",
        name: "Liga III",
        teams: [
            "Gólyatábor SE",
            "Doktoranduszok",
            "Építész Tervezők",
            "Gépész Csavarok",
            "Agrár Traktorok",
            "Zenész Hangjegyek",
        ],
    },
    {
        id: "liga-4",
        name: "Liga IV",
        teams: [
            "Menza United",
            "Könyvtári Csendesek",
            "Szakdolgozók FC",
            "Vizsgaidőszak SE",
            "Kampuszi Futók",
            "Erasmus Cserediákok",
        ],
    },
];

const COUNTRY = "Magyarország";

// Results of the sample season, used in turn
const SCORE_PATTERN = [
    [2, 1],
    [1, 1],
    [3, 0],
    [2, 2],
    [1, 0],
    [0, 1],
    [4, 2],
    [3, 2],
    [2, 3],
    [1, 2],
    [0, 0],
    [2, 4],
];

// Hungarian order (family name first), without the "Dr." / "Prof." titles that
// faker's fullName adds now and then
function studentName() {
    return `${faker.person.lastName()} ${faker.person.firstName()}`;
}

/**
 * Fill an empty database. Run it in a transaction (lib/db.js does).
 * @param {import("better-sqlite3").Database} db - Fully migrated, with no data
 */
export function insertSampleData(db) {
    faker.seed(FAKER_SEED);
    // One hash for everyone: hashing ~190 passwords one by one would slow down the
    // first start by several seconds
    const playerPasswordHash = bcrypt.hashSync(SAMPLE_PLAYER_PASSWORD, 10);

    const insertLeague = db.prepare("INSERT INTO leagues (id, name, country) VALUES (?, ?, ?)");
    // Tables are calculated from the matches (lib/standings.js)
    const insertTeam = db.prepare(
        "INSERT INTO teams (id, name, league_id, captain_player_id) VALUES (?, ?, ?, NULL)",
    );
    const insertPlayer = db.prepare(
        "INSERT INTO players (id, email, password, name, team_id, role) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const setCaptain = db.prepare("UPDATE teams SET captain_player_id = ? WHERE id = ?");

    // Team ids follow the league order: Liga I has 1-6, Liga II 7-12, ...
    const leagues = [];
    const rosters = new Map(); // team id -> player ids, captain first
    let teamId = 1;
    let playerId = 1;
    for (const league of SAMPLE_LEAGUES) {
        insertLeague.run(league.id, league.name, COUNTRY);
        const teamIds = [];
        for (const teamName of league.teams) {
            insertTeam.run(teamId, teamName, league.id);
            teamIds.push(teamId);

            const roster = [];
            for (let i = 0; i < PLAYERS_PER_TEAM; i++) {
                const role = i === 0 ? "Captain" : "Player";
                insertPlayer.run(
                    playerId,
                    `player${playerId}@example.com`,
                    playerPasswordHash,
                    studentName(),
                    teamId,
                    role,
                );
                roster.push(playerId);
                playerId++;
            }
            setCaptain.run(roster[0], teamId);
            rosters.set(teamId, roster);
            teamId++;
        }
        leagues.push({ id: league.id, teamIds });
    }

    for (let i = 1; i <= TEAMLESS_PLAYERS; i++) {
        insertPlayer.run(
            playerId++,
            `teamless${i}@example.com`,
            playerPasswordHash,
            studentName(),
            null,
            "Player",
        );
    }

    insertPlayer.run(
        playerId++,
        ADMIN_EMAIL,
        bcrypt.hashSync(ADMIN_PASSWORD, 10),
        "Admin",
        null,
        "Admin",
    );

    insertSampleSeason(db, leagues, rosters);
}

// A completed double round-robin per league, with scorers. The matches form a
// season of their own, so they never mix with real results (see migration 004).
function insertSampleSeason(db, leagues, rosters) {
    const matches = [];
    const firstDay = Date.UTC(2025, 9, 1); // 2025-10-01
    // Local "YYYY-MM-DDT18:00:00", the format published matches use
    const kickOff = (dayOffset) =>
        `${new Date(firstDay + dayOffset * 86400000).toISOString().slice(0, 10)}T18:00:00`;

    leagues.forEach(({ id: leagueId, teamIds }, leagueIndex) => {
        let pairIndex = 0;
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const first = SCORE_PATTERN[pairIndex % SCORE_PATTERN.length];
                const second = SCORE_PATTERN[(pairIndex + 7) % SCORE_PATTERN.length];
                matches.push({
                    leagueId,
                    home: teamIds[i],
                    away: teamIds[j],
                    score: first,
                    date: kickOff(pairIndex + leagueIndex * 40),
                });
                matches.push({
                    leagueId,
                    home: teamIds[j],
                    away: teamIds[i],
                    score: second,
                    date: kickOff(pairIndex + 20 + leagueIndex * 40),
                });
                pairIndex++;
            }
        }
    });

    const dates = matches.map((match) => match.date).sort();
    const seasonId = Number(
        db
            .prepare(
                `INSERT INTO seasons (league_id, name, status, start_date, end_date, is_sample)
                 VALUES (NULL, ?, 'completed', ?, ?, 1)`,
            )
            .run(SAMPLE_SEASON_NAME, dates[0].slice(0, 10), dates.at(-1).slice(0, 10))
            .lastInsertRowid,
    );

    const insertMatch = db.prepare(
        `INSERT INTO matches (league_id, season_id, home_team_id, away_team_id,
                              home_score, away_score, match_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'finished')`,
    );
    const insertGoal = db.prepare(
        "INSERT INTO goals (match_id, team_id, player_id) VALUES (?, ?, ?)",
    );
    for (const match of matches) {
        const matchId = Number(
            insertMatch.run(
                match.leagueId,
                seasonId,
                match.home,
                match.away,
                match.score[0],
                match.score[1],
                match.date,
            ).lastInsertRowid,
        );
        // Every goal gets a random scorer from the team
        [
            [match.home, match.score[0]],
            [match.away, match.score[1]],
        ].forEach(([team, goals]) => {
            for (let g = 0; g < goals; g++) {
                insertGoal.run(matchId, team, faker.helpers.arrayElement(rosters.get(team)));
            }
        });
    }

    // Every team that plays in the sample season is registered for it
    const registerTeam = db.prepare(
        "INSERT INTO season_teams (season_id, team_id) VALUES (?, ?)",
    );
    for (const { teamIds } of leagues) {
        for (const id of teamIds) registerTeam.run(seasonId, id);
    }
}
