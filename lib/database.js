import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "tournament.db");

/**
 * Get the shared better-sqlite3 connection, opening it on first use.
 * The connection is cached on globalThis so dev hot reloads reuse it
 * instead of opening a new one per module instance.
 * @returns {import("better-sqlite3").Database}
 */
export function getDatabase() {
    if (!globalThis.__database) {
        mkdirSync(dataDir, { recursive: true });
        // Wait up to 5s for locks held by other connections (e.g. another process).
        globalThis.__database = new Database(dbPath, { timeout: 5000 });
    }
    return globalThis.__database;
}
