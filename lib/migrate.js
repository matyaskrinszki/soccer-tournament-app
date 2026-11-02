import { migrations } from "./migrations";

/**
 * Bring the database schema up to date.
 *
 * The applied schema version is stored in SQLite's built-in `PRAGMA user_version`
 * (an integer in the database file header, 0 for a new database). Each pending
 * migration runs in its own transaction together with the version bump, so a
 * migration is either fully applied or not at all.
 *
 * Foreign key enforcement is switched off while migrations run, because rebuilding a
 * table (create new -> copy -> drop old -> rename) would otherwise trip it halfway
 * through. It can't be changed inside a transaction, so it's done around them, and a
 * migration that adds foreign key violations is rolled back.
 *
 * @param {import("better-sqlite3").Database} db
 * @returns {{from: number, to: number}} Schema version before and after
 */
export function runMigrations(db) {
    assertOrdered(migrations);

    const from = getUserVersion(db);
    const latest = migrations[migrations.length - 1]?.version ?? 0;
    if (from > latest) {
        throw new Error(
            `Database schema version ${from} is newer than the latest known migration (${latest})`,
        );
    }

    const foreignKeysWereOn = db.pragma("foreign_keys", { simple: true }) === 1;
    db.pragma("foreign_keys = OFF");
    try {
        for (const migration of migrations) {
            const apply = db.transaction(() => {
                if (getUserVersion(db) >= migration.version) {
                    return false;
                }

                // Databases written by the old sqlite3 driver (which never enforced
                // foreign keys) may already contain orphan rows; only fail if the
                // migration itself adds violations.
                const violationsBefore = db.pragma("foreign_key_check").length;
                migration.up(db);
                const violationsAfter = db.pragma("foreign_key_check").length;
                if (violationsAfter > violationsBefore) {
                    throw new Error(
                        `adds ${violationsAfter - violationsBefore} foreign key violation(s)`,
                    );
                }

                // PRAGMA does not accept bound parameters; version is a validated integer.
                db.pragma(`user_version = ${migration.version}`);
                return true;
            });

            let applied;
            try {
                // IMMEDIATE takes the write lock up front, so if two processes start at
                // once, the second waits and then sees the version the first one wrote.
                applied = apply.immediate();
            } catch (err) {
                throw new Error(
                    `Migration ${migration.version}_${migration.name} failed: ${err.message}`,
                    { cause: err },
                );
            }

            if (applied) {
                console.log(
                    `[migrate] applied ${migration.version}_${migration.name}`,
                );
            }
        }
    } finally {
        if (foreignKeysWereOn) {
            db.pragma("foreign_keys = ON");
        }
    }

    return { from, to: getUserVersion(db) };
}

function getUserVersion(db) {
    return db.pragma("user_version", { simple: true });
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
