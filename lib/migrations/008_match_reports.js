// Captains of both teams report the result of a published match
// (lib/match-reports.js). One report per team and match; a captain may overwrite
// theirs until the match is finished. When both reports agree the result is
// recorded from them, otherwise the admin decides.
//
// The scorers are kept as JSON ([{playerId, goals}], the reporting team's own
// scorers only). A report is a claim, not a fact: it is only ever read whole, to
// compare it and to pass it on to recordMatchResult, which validates the players
// again. The facts stay in `goals`.
export const version = 8;
export const name = "match_reports";

export function up(db) {
    db.exec(`
        CREATE TABLE match_reports (
            match_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            home_score INTEGER NOT NULL,
            away_score INTEGER NOT NULL,
            scorers TEXT NOT NULL DEFAULT '[]',
            reported_by INTEGER NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (match_id, team_id),
            FOREIGN KEY (match_id) REFERENCES matches (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            FOREIGN KEY (reported_by) REFERENCES players (id)
        );
    `);
}
