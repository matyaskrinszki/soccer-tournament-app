// Publishing a season copies its generated schedule into `matches`. These columns record
// where a match came from: the season it belongs to (needed for per-season standings)
// and the scheduled match it was published from. Both stay NULL for the sample matches
// that were inserted directly.
//
// The unique index stops the same scheduled match from being published twice.
export const version = 3;
export const name = "link_matches_to_schedule";

export function up(db) {
    db.exec(`
        ALTER TABLE matches ADD COLUMN season_id INTEGER REFERENCES seasons (id);
        ALTER TABLE matches ADD COLUMN scheduled_match_id INTEGER REFERENCES scheduled_matches (id);

        CREATE INDEX IF NOT EXISTS idx_matches_season_id ON matches (season_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_scheduled_match_id
            ON matches (scheduled_match_id);
    `);
}
