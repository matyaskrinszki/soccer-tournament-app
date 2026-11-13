// The scheduler (lib/scheduler.js) no longer computes a satisfaction %. A schedule
// run now stores how many team sides got a slot they marked preferred / unavailable,
// out of all sides (2 per match). The columns are nullable: runs generated before
// this have no counts. algorithm_score is kept (not dropped) for those old runs;
// new runs leave it NULL.
export const version = 10;
export const name = "schedule_run_preference_counts";

export function up(db) {
    db.exec(`
        ALTER TABLE schedule_runs ADD COLUMN preferred_sides INTEGER;
        ALTER TABLE schedule_runs ADD COLUMN unavailable_sides INTEGER;
        ALTER TABLE schedule_runs ADD COLUMN total_sides INTEGER;
    `);
}
