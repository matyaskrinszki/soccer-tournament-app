import { dbGet, dbExec } from "./db-async";
import { migrations } from "./migrations";

/**
 * Bring the database schema up to date.
 *
 * The applied schema version is stored in SQLite's built-in `PRAGMA user_version`
 * (an integer in the database file header, 0 for a new database). Each pending
 * migration runs in its own transaction together with the version bump, so a
 * migration is either fully applied or not at all.
 *
 * @param {import("sqlite3").Database} db
 * @returns {Promise<{from: number, to: number}>} Schema version before and after
 */
export async function runMigrations(db) {
    assertOrdered(migrations);

    // Wait instead of failing immediately if another connection holds the write lock.
    db.configure("busyTimeout", 5000);

    const from = await getUserVersion(db);
    const latest = migrations[migrations.length - 1]?.version ?? 0;
    if (from > latest) {
        throw new Error(
            `Database schema version ${from} is newer than the latest known migration (${latest})`,
        );
    }

    for (const migration of migrations) {
        // BEGIN IMMEDIATE takes the write lock up front, so if two processes start at
        // once, the second waits and then sees the version the first one wrote.
        await dbExec(db, "BEGIN IMMEDIATE");
        try {
            if ((await getUserVersion(db)) >= migration.version) {
                await dbExec(db, "COMMIT");
                continue;
            }

            await migration.up(db);
            // PRAGMA does not accept bound parameters; version is a validated integer.
            await dbExec(db, `PRAGMA user_version = ${migration.version}`);
            await dbExec(db, "COMMIT");
            console.log(
                `[migrate] applied ${migration.version}_${migration.name}`,
            );
        } catch (err) {
            await dbExec(db, "ROLLBACK").catch(() => {});
            throw new Error(
                `Migration ${migration.version}_${migration.name} failed: ${err.message}`,
                { cause: err },
            );
        }
    }

    return { from, to: await getUserVersion(db) };
}

async function getUserVersion(db) {
    const row = await dbGet(db, "PRAGMA user_version");
    return row.user_version;
}

function assertOrdered(list) {
    list.forEach((migration, index) => {
        if (migration.version !== index + 1) {
            throw new Error(
                `Migration "${migration.name}" has version ${migration.version}, expected ${index + 1}`,
            );
        }
    });
}
