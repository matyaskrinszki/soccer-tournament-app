// League tables are calculated from finished matches per season (lib/standings.js),
// so the stored counters on `teams` are no longer read or kept up to date.
// Dropping them avoids anything reading stale numbers by mistake.
export const version = 5;
export const name = "drop_team_stat_columns";

const COLUMNS = ["matches", "wins", "draws", "losses", "points"];

export function up(db) {
    for (const column of COLUMNS) {
        db.exec(`ALTER TABLE teams DROP COLUMN ${column}`);
    }
}
