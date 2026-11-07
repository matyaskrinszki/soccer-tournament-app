// Teams register for a season while it is in "setup" (lib/season-registration.js),
// and only registered teams get scheduled. Before this, a season implicitly took
// every team of every league at generation time.
//
// Backfill for seasons that already went past setup: teams that have a match in
// the season, or saved preferences for it, count as registered.
//
// Also: at most one season can be active at a time. The partial unique index makes
// the database itself refuse a second one.
export const version = 6;
export const name = "season_teams";

export function up(db) {
    db.exec(`
        CREATE TABLE season_teams (
            season_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (season_id, team_id),
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (team_id) REFERENCES teams (id)
        );
        CREATE INDEX idx_season_teams_team_id ON season_teams (team_id);

        INSERT OR IGNORE INTO season_teams (season_id, team_id)
            SELECT season_id, home_team_id FROM matches WHERE season_id IS NOT NULL
            UNION
            SELECT season_id, away_team_id FROM matches WHERE season_id IS NOT NULL
            UNION
            SELECT season_id, team_id FROM team_availability_preferences;
    `);

    const active = db
        .prepare("SELECT name FROM seasons WHERE status = 'active' ORDER BY id")
        .pluck()
        .all();
    if (active.length > 1) {
        throw new Error(
            `only one season may be active, but these are: ${active.join(", ")}. ` +
                "Set all but one to another status, then restart.",
        );
    }
    db.exec(
        "CREATE UNIQUE INDEX idx_seasons_one_active ON seasons (status) WHERE status = 'active'",
    );
}
