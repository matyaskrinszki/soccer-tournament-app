import sqlite3 from 'sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { faker } from '@faker-js/faker';

const dbPath = path.join(process.cwd(), 'data', 'tournament.db');

// Ensure data directory exists
try {
    mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
} catch (err) {
    // Directory already exists
}

export function getDb() {
    return new sqlite3.Database(dbPath);
}

export function initializeDb() {
    const db = getDb();

    db.serialize(() => {
        // Leagues table
        db.run(
            `CREATE TABLE IF NOT EXISTS leagues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT,
        season TEXT DEFAULT '2024-25'
      )`
        );

                // Teams table
                db.run(
                        `CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                league_id TEXT NOT NULL,
                captain_player_id INTEGER,
                matches INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                draws INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                points INTEGER DEFAULT 0,
                FOREIGN KEY (league_id) REFERENCES leagues (id),
                FOREIGN KEY (captain_player_id) REFERENCES players (id)
            )`
                );

                                // Matches table
                                db.run(
                                                `CREATE TABLE IF NOT EXISTS matches (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                league_id TEXT NOT NULL,
                                home_team_id INTEGER NOT NULL,
                                away_team_id INTEGER NOT NULL,
                                home_score INTEGER,
                                away_score INTEGER,
                                match_date TEXT NOT NULL,
                                status TEXT NOT NULL CHECK(status IN ('finished','upcoming')),
                                FOREIGN KEY (league_id) REFERENCES leagues (id),
                                FOREIGN KEY (home_team_id) REFERENCES teams (id),
                                FOREIGN KEY (away_team_id) REFERENCES teams (id)
                        )`
                                );

                // Players table (merged with users)
                db.run(
                        `CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT,
                team_id INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams (id)
            )`
                );

                // Goals table
                db.run(
                        `CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                team_id INTEGER NOT NULL,
                player_id INTEGER NOT NULL,
                minute INTEGER,
                FOREIGN KEY (match_id) REFERENCES matches (id),
                FOREIGN KEY (team_id) REFERENCES teams (id),
                FOREIGN KEY (player_id) REFERENCES players (id)
            )`
                );

        // Insert sample data if leagues table is empty
        db.get("SELECT COUNT(*) as count FROM leagues", (err, row) => {
            if (!err && row.count === 0) {
                insertSampleData(db);
            }
        });
    });

    return db;
}

function insertSampleData(db) {
    const leagues = [
        { id: 'premier-league', name: 'Premier League', country: 'England' },
        { id: 'la-liga', name: 'La Liga', country: 'Spain' },
        { id: 'serie-a', name: 'Serie A', country: 'Italy' },
        { id: 'bundesliga', name: 'Bundesliga', country: 'Germany' }
    ];

    leagues.forEach(league => {
        db.run("INSERT INTO leagues (id, name, country) VALUES (?, ?, ?)", [league.id, league.name, league.country]);
    });

    // Teams by league with fixed ids
    const teamsByLeague = {
        'premier-league': [
            { id: 1, name: 'Manchester City' },
            { id: 2, name: 'Arsenal' },
            { id: 3, name: 'Liverpool' },
            { id: 4, name: 'Chelsea' },
            { id: 5, name: 'Manchester United' },
            { id: 6, name: 'Tottenham' },
        ],
        'la-liga': [
            { id: 7, name: 'Real Madrid' },
            { id: 8, name: 'Barcelona' },
            { id: 9, name: 'Atletico Madrid' },
            { id: 10, name: 'Real Sociedad' },
            { id: 11, name: 'Valencia' },
            { id: 12, name: 'Sevilla' },
        ],
        'bundesliga': [
            { id: 19, name: 'Bayern Munich' },
            { id: 20, name: 'Borussia Dortmund' },
            { id: 21, name: 'RB Leipzig' },
            { id: 22, name: 'Bayer Leverkusen' },
            { id: 23, name: 'Eintracht Frankfurt' },
            { id: 24, name: 'Borussia Monchengladbach' },
        ],
    };

    // Insert teams with zeroed stats; will be recalculated from matches
    Object.entries(teamsByLeague).forEach(([leagueId, teams]) => {
        teams.forEach(team => {
            db.run(
                "INSERT INTO teams (id, name, league_id, captain_player_id, matches, wins, draws, losses, points) VALUES (?, ?, ?, NULL, 0, 0, 0, 0, 0)",
                [team.id, team.name, leagueId]
            );
        });
    });

    // Players: 7 per team using faker for names
    const players = [];
    const playersByTeam = new Map();
    let playerId = 1;
    Object.values(teamsByLeague).forEach((teams) => {
        teams.forEach(team => {
            const rosterIds = [];
            for (let i = 0; i < 7; i++) {
                const p = {
                    id: playerId++,
                    name: faker.person.fullName(),
                    email: `player${playerId - 1}@example.com`,
                    password: 'sample-password-hash',
                    team_id: team.id
                };
                players.push(p);
                rosterIds.push(p.id);
            }
            playersByTeam.set(team.id, rosterIds);
        });
    });

    // Add 20 teamless players using faker
    for (let i = 0; i < 20; i++) {
        const p = {
            id: playerId++,
            name: faker.person.fullName(),
            email: `teamless${i + 1}@example.com`,
            password: 'sample-password-hash',
            team_id: null
        };
        players.push(p);
    }

    // Insert all players (including teamless ones) in serialized manner
    db.serialize(() => {
        players.forEach(p => {
            db.run(
                "INSERT INTO players (id, email, password, name, team_id) VALUES (?, ?, ?, ?, ?)",
                [p.id, p.email, p.password, p.name, p.team_id]
            );
        });
    });

    // Assign a captain for each team (first player in roster)
    playersByTeam.forEach((rosterIds, teamId) => {
        const captainId = rosterIds[0];
        if (captainId) {
            db.run(
                "UPDATE teams SET captain_player_id = ? WHERE id = ?",
                [captainId, teamId]
            );
        }
    });

    const scorePattern = [
        [2, 1], [1, 1], [3, 0], [2, 2], [1, 0], [0, 1], [4, 2], [3, 2], [2, 3], [1, 2], [0, 0], [2, 4]
    ];

    const finishedMatches = [];
    const upcomingMatches = [];
    let matchIdCounter = 1;

    Object.entries(teamsByLeague).forEach(([leagueId, teams], leagueIdx) => {
        const teamIds = teams.map(t => t.id);

        // Double round-robin finished matches (each pair twice => 10 played per team)
        const finishedBase = new Date(Date.UTC(2025, 9, 1)); // 2025-10-01
        let fIndex = 0;
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const home = teamIds[i];
                const away = teamIds[j];
                const score = scorePattern[fIndex % scorePattern.length];
                const score2 = scorePattern[(fIndex + 7) % scorePattern.length];

                finishedMatches.push({
                    id: matchIdCounter++,
                    league_id: leagueId,
                    home_team_id: home,
                    away_team_id: away,
                    home_score: score[0],
                    away_score: score[1],
                    match_date: new Date(finishedBase.getTime() + (fIndex + leagueIdx * 40) * 86400000).toISOString(),
                    status: 'finished'
                });

                finishedMatches.push({
                    id: matchIdCounter++,
                    league_id: leagueId,
                    home_team_id: away,
                    away_team_id: home,
                    home_score: score2[0],
                    away_score: score2[1],
                    match_date: new Date(finishedBase.getTime() + (fIndex + 20 + leagueIdx * 40) * 86400000).toISOString(),
                    status: 'finished'
                });

                fIndex++;
            }
        }

        // Single round of upcoming matches (5 per team)
        const upcomingBase = new Date(Date.UTC(2026, 1, 1)); // 2026-02-01
        let uIndex = 0;
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const even = (uIndex % 2) === 0;
                const home = even ? teamIds[i] : teamIds[j];
                const away = even ? teamIds[j] : teamIds[i];
                upcomingMatches.push({
                    id: matchIdCounter++,
                    league_id: leagueId,
                    home_team_id: home,
                    away_team_id: away,
                    home_score: null,
                    away_score: null,
                    match_date: new Date(upcomingBase.getTime() + (uIndex + leagueIdx * 20) * 86400000).toISOString(),
                    status: 'upcoming'
                });
                uIndex++;
            }
        }
    });

    // Generate goals for finished matches
    const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const goals = [];
    finishedMatches.forEach(m => {
        const homePlayers = playersByTeam.get(m.home_team_id) || [];
        const awayPlayers = playersByTeam.get(m.away_team_id) || [];

        for (let i = 0; i < m.home_score; i++) {
            const pid = homePlayers[randBetween(0, homePlayers.length - 1)];
            goals.push({
                match_id: m.id,
                team_id: m.home_team_id,
                player_id: pid,
                minute: randBetween(5, 90)
            });
        }
        for (let i = 0; i < m.away_score; i++) {
            const pid = awayPlayers[randBetween(0, awayPlayers.length - 1)];
            goals.push({
                match_id: m.id,
                team_id: m.away_team_id,
                player_id: pid,
                minute: randBetween(5, 90)
            });
        }
    });

    // Insert matches with explicit ids
    [...finishedMatches, ...upcomingMatches].forEach(match => {
        db.run(
            "INSERT INTO matches (id, league_id, home_team_id, away_team_id, home_score, away_score, match_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                match.id,
                match.league_id,
                match.home_team_id,
                match.away_team_id,
                match.home_score,
                match.away_score,
                match.match_date,
                match.status
            ]
        );
    });

    // Insert goals
    goals.forEach(g => {
        db.run(
            "INSERT INTO goals (match_id, team_id, player_id, minute) VALUES (?, ?, ?, ?)",
            [g.match_id, g.team_id, g.player_id, g.minute]
        );
    });

    // Recalculate team stats from finished matches
    const stats = new Map();
    finishedMatches.forEach(m => {
        const home = m.home_team_id;
        const away = m.away_team_id;
        const hs = m.home_score;
        const as = m.away_score;

        if (!stats.has(home)) stats.set(home, { matches: 0, wins: 0, draws: 0, losses: 0, points: 0 });
        if (!stats.has(away)) stats.set(away, { matches: 0, wins: 0, draws: 0, losses: 0, points: 0 });

        const homeStat = stats.get(home);
        const awayStat = stats.get(away);

        homeStat.matches += 1;
        awayStat.matches += 1;

        if (hs > as) {
            homeStat.wins += 1;
            awayStat.losses += 1;
            homeStat.points += 3;
        } else if (hs < as) {
            awayStat.wins += 1;
            homeStat.losses += 1;
            awayStat.points += 3;
        } else {
            homeStat.draws += 1;
            awayStat.draws += 1;
            homeStat.points += 1;
            awayStat.points += 1;
        }
    });

    stats.forEach((stat, teamId) => {
        db.run(
            "UPDATE teams SET matches = ?, wins = ?, draws = ?, losses = ?, points = ? WHERE id = ?",
            [stat.matches, stat.wins, stat.draws, stat.losses, stat.points, teamId]
        );
    });
}
