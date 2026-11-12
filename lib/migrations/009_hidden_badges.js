// Players choose which of their earned badges (lib/badges.js) appear on their
// public profile. Badges are calculated on read; only the player's choice is
// stored. A row means "hidden", so badges are visible by default and a newly
// earned badge shows up without any setting. The badge id is the key in
// lib/badges.js, not a foreign key: badges aren't a table.
export const version = 9;
export const name = "hidden_badges";

export function up(db) {
    db.exec(`
        CREATE TABLE hidden_badges (
            player_id INTEGER NOT NULL,
            badge_id TEXT NOT NULL,
            PRIMARY KEY (player_id, badge_id),
            FOREIGN KEY (player_id) REFERENCES players (id)
        );
    `);
}
