import { getDatabase } from "./database";
import { runMigrations } from "./migrate";
import { insertSampleData } from "./sample-data";

/**
 * Run pending schema migrations, then insert sample data into an empty database.
 * Called once at server startup from instrumentation.js. Completion is recorded on
 * globalThis so repeated calls (e.g. dev hot reloads) don't run it again; a failed
 * attempt is not recorded, so a later call retries.
 */
export function initializeDb() {
    if (globalThis.__dbInitialized) {
        return;
    }

    const db = getDatabase();
    const { from, to } = runMigrations(db);
    if (from !== to) {
        console.log(`[db] schema migrated from version ${from} to ${to}`);
    }

    const row = db.prepare("SELECT COUNT(*) as count FROM leagues").get();
    if (row.count === 0) {
        // All-or-nothing, so a failed seed doesn't leave a half-filled database
        db.transaction(() => insertSampleData(db))();
    }

    globalThis.__dbInitialized = true;
}
