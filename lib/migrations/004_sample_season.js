// Standings are calculated per season, so every match needs a season. The sample
// matches inserted by the seed had none, and would otherwise be counted together
// with real results. This moves them into a completed "sample" season of their own,
// which the pages can show while no real season has been played.
//
// - `seasons.is_sample` marks that season, so it can be labelled or removed later.
// - Sample "upcoming" matches are deleted: a completed season has no fixtures left,
//   and their dates are in the past, so they only showed up as missing results.
// - Sample match dates are rewritten from UTC ISO ("...T00:00:00.000Z") to the local
//   "YYYY-MM-DDTHH:MM:SS" format that published matches use.
//
// A fresh database has no matches yet, so only the column is added; the seed then
// creates the sample season itself.
export const version = 4;
export const name = "sample_season";

export const SAMPLE_SEASON_NAME = "Bemutató szezon";

export function up(db) {
    db.exec(
        "ALTER TABLE seasons ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0 CHECK(is_sample IN (0, 1))",
    );

    db.exec(`
        DELETE FROM goals
        WHERE match_id IN (
            SELECT id FROM matches WHERE season_id IS NULL AND status = 'upcoming'
        );
        DELETE FROM matches WHERE season_id IS NULL AND status = 'upcoming';
    `);

    const range = db
        .prepare(
            `SELECT COUNT(*) as count,
                    MIN(substr(match_date, 1, 10)) as startDate,
                    MAX(substr(match_date, 1, 10)) as endDate
             FROM matches
             WHERE season_id IS NULL`,
        )
        .get();
    if (range.count === 0) {
        return;
    }

    const seasonId = Number(
        db
            .prepare(
                `INSERT INTO seasons (league_id, name, status, start_date, end_date, is_sample)
                 VALUES (NULL, ?, 'completed', ?, ?, 1)`,
            )
            .run(SAMPLE_SEASON_NAME, range.startDate, range.endDate).lastInsertRowid,
    );

    db.prepare(
        `UPDATE matches
         SET season_id = ?, match_date = substr(match_date, 1, 19)
         WHERE season_id IS NULL`,
    ).run(seasonId);
}
