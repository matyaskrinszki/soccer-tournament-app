// The pre-migration-system code rebuilt `seasons` by first renaming it to
// `seasons_legacy_global_migration`. Since SQLite 3.26, renaming a table also rewrites
// foreign keys in other tables that point at it, so these tables ended up referencing
// the legacy table, which was then dropped. The old sqlite3 driver never enforced foreign
// keys, so nothing failed, but with enforcement on (better-sqlite3's default) every insert
// into them would break.
//
// Fix: rebuild each affected table with the correct definition. The order used here
// (create new -> copy -> drop old -> rename new) is the one SQLite recommends, because
// renaming the *new* table never rewrites references held by other tables.
// Databases created fresh by migration 001 are not affected, so this is a no-op for them.
export const version = 2;
export const name = "fix_seasons_foreign_keys";

const LEGACY_TABLE = "seasons_legacy_global_migration";

const TABLE_DEFINITIONS = {
    pitches: (tableName) => `
        CREATE TABLE ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            location TEXT,
            created_by_admin INTEGER,
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (created_by_admin) REFERENCES players (id)
        )`,
    time_slots: (tableName) => `
        CREATE TABLE ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            pitch_id INTEGER NOT NULL,
            slot_date TEXT,
            day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (pitch_id) REFERENCES pitches (id)
        )`,
    team_availability_preferences: (tableName) => `
        CREATE TABLE ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            time_slot_id INTEGER NOT NULL,
            preference TEXT NOT NULL CHECK(preference IN ('preferred', 'unavailable', 'neutral')),
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            FOREIGN KEY (time_slot_id) REFERENCES time_slots (id),
            UNIQUE(season_id, team_id, time_slot_id)
        )`,
    schedule_runs: (tableName) => `
        CREATE TABLE ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            league_id TEXT NOT NULL,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            algorithm_score REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'current' CHECK(status IN ('current', 'archived')),
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (league_id) REFERENCES leagues (id)
        )`,
};

function rebuildTable(db, tableName, createSql) {
    const tempName = `${tableName}_new`;
    db.exec(createSql(tempName));

    // Copy by column name, since column order can differ (e.g. time_slots.slot_date
    // was appended by ALTER TABLE on older databases).
    const columns = db
        .pragma(`table_info(${tempName})`)
        .map((col) => col.name)
        .join(", ");
    db.exec(
        `INSERT INTO ${tempName} (${columns}) SELECT ${columns} FROM ${tableName}`,
    );

    // Keep the AUTOINCREMENT counter: it can be higher than MAX(id) if rows were
    // deleted, and the new table would otherwise reuse those ids.
    const sequence = db
        .prepare("SELECT seq FROM sqlite_sequence WHERE name = ?")
        .get(tableName);

    db.exec(`DROP TABLE ${tableName}`);
    db.exec(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);

    if (sequence) {
        db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(tableName);
        db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)").run(
            tableName,
            sequence.seq,
        );
    }
}

export function up(db) {
    const affected = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE ?",
        )
        .all(`%${LEGACY_TABLE}%`);

    for (const { name: tableName } of affected) {
        const createSql = TABLE_DEFINITIONS[tableName];
        if (!createSql) {
            throw new Error(
                `Table "${tableName}" references ${LEGACY_TABLE} but has no repair definition`,
            );
        }
        rebuildTable(db, tableName, createSql);
    }
}
