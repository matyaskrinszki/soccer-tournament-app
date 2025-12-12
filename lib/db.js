import sqlite3 from 'sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';

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
        // Users table
        db.run(
            `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
        );

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
        matches INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        points INTEGER DEFAULT 0,
        FOREIGN KEY (league_id) REFERENCES leagues (id)
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
    // Insert leagues
    const leagues = [
        { id: 'premier-league', name: 'Premier League', country: 'England' },
        { id: 'la-liga', name: 'La Liga', country: 'Spain' },
        { id: 'serie-a', name: 'Serie A', country: 'Italy' },
        { id: 'bundesliga', name: 'Bundesliga', country: 'Germany' },
        { id: 'ligue-1', name: 'Ligue 1', country: 'France' }
    ];

    leagues.forEach(league => {
        db.run("INSERT INTO leagues (id, name, country) VALUES (?, ?, ?)", 
               [league.id, league.name, league.country]);
    });

    // Insert teams
    const teams = [
        // Premier League
        { name: 'Manchester City', league_id: 'premier-league', matches: 15, wins: 12, draws: 2, losses: 1, points: 38 },
        { name: 'Arsenal', league_id: 'premier-league', matches: 15, wins: 10, draws: 3, losses: 2, points: 33 },
        { name: 'Liverpool', league_id: 'premier-league', matches: 15, wins: 9, draws: 4, losses: 2, points: 31 },
        { name: 'Chelsea', league_id: 'premier-league', matches: 15, wins: 8, draws: 3, losses: 4, points: 27 },
        { name: 'Manchester United', league_id: 'premier-league', matches: 15, wins: 7, draws: 4, losses: 4, points: 25 },
        { name: 'Tottenham', league_id: 'premier-league', matches: 15, wins: 6, draws: 5, losses: 4, points: 23 },

        // La Liga
        { name: 'Real Madrid', league_id: 'la-liga', matches: 15, wins: 11, draws: 3, losses: 1, points: 36 },
        { name: 'Barcelona', league_id: 'la-liga', matches: 15, wins: 10, draws: 2, losses: 3, points: 32 },
        { name: 'Atletico Madrid', league_id: 'la-liga', matches: 15, wins: 9, draws: 4, losses: 2, points: 31 },
        { name: 'Real Sociedad', league_id: 'la-liga', matches: 15, wins: 8, draws: 2, losses: 5, points: 26 },
        { name: 'Valencia', league_id: 'la-liga', matches: 15, wins: 6, draws: 6, losses: 3, points: 24 },
        { name: 'Sevilla', league_id: 'la-liga', matches: 15, wins: 7, draws: 3, losses: 5, points: 24 },

        // Serie A
        { name: 'Inter Milan', league_id: 'serie-a', matches: 15, wins: 12, draws: 1, losses: 2, points: 37 },
        { name: 'Juventus', league_id: 'serie-a', matches: 15, wins: 10, draws: 3, losses: 2, points: 33 },
        { name: 'AC Milan', league_id: 'serie-a', matches: 15, wins: 9, draws: 3, losses: 3, points: 30 },
        { name: 'Napoli', league_id: 'serie-a', matches: 15, wins: 8, draws: 4, losses: 3, points: 28 },
        { name: 'Roma', league_id: 'serie-a', matches: 15, wins: 7, draws: 5, losses: 3, points: 26 },
        { name: 'Lazio', league_id: 'serie-a', matches: 15, wins: 6, draws: 4, losses: 5, points: 22 },

        // Bundesliga
        { name: 'Bayern Munich', league_id: 'bundesliga', matches: 15, wins: 13, draws: 1, losses: 1, points: 40 },
        { name: 'Borussia Dortmund', league_id: 'bundesliga', matches: 15, wins: 10, draws: 2, losses: 3, points: 32 },
        { name: 'RB Leipzig', league_id: 'bundesliga', matches: 15, wins: 8, draws: 4, losses: 3, points: 28 },
        { name: 'Bayer Leverkusen', league_id: 'bundesliga', matches: 15, wins: 7, draws: 4, losses: 4, points: 25 },
        { name: 'Eintracht Frankfurt', league_id: 'bundesliga', matches: 15, wins: 6, draws: 5, losses: 4, points: 23 },
        { name: 'Borussia Monchengladbach', league_id: 'bundesliga', matches: 15, wins: 5, draws: 6, losses: 4, points: 21 },

        // Ligue 1
        { name: 'Paris Saint-Germain', league_id: 'ligue-1', matches: 15, wins: 12, draws: 2, losses: 1, points: 38 },
        { name: 'Marseille', league_id: 'ligue-1', matches: 15, wins: 9, draws: 4, losses: 2, points: 31 },
        { name: 'Lyon', league_id: 'ligue-1', matches: 15, wins: 8, draws: 3, losses: 4, points: 27 },
        { name: 'Nice', league_id: 'ligue-1', matches: 15, wins: 7, draws: 5, losses: 3, points: 26 },
        { name: 'Monaco', league_id: 'ligue-1', matches: 15, wins: 6, draws: 6, losses: 3, points: 24 },
        { name: 'Lille', league_id: 'ligue-1', matches: 15, wins: 6, draws: 4, losses: 5, points: 22 }
    ];

    teams.forEach(team => {
        db.run("INSERT INTO teams (name, league_id, matches, wins, draws, losses, points) VALUES (?, ?, ?, ?, ?, ?, ?)", 
               [team.name, team.league_id, team.matches, team.wins, team.draws, team.losses, team.points]);
    });
}
