// Goal scorers are recorded together with the result (lib/match-results.js), as a
// goal count per player, so goals have no minute any more. Only the sample data
// ever had one.
//
// Indexes for the per-match lookups when recording and showing a result, and the
// per-player counts on the statistics and player pages.
export const version = 7;
export const name = "goal_scorers";

export function up(db) {
    db.exec(`
        ALTER TABLE goals DROP COLUMN minute;
        CREATE INDEX idx_goals_match_id ON goals (match_id);
        CREATE INDEX idx_goals_player_id ON goals (player_id);
    `);
}
