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
        db.run(
            `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
        );
    });

    return db;
}
