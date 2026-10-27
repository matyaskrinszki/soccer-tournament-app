// Shared rules for team availability preferences.
// NOTE: app/api/teams/preferences/route.js and app/api/admin/generate-schedule/route.js
// still define their own copies of these constants. Migrating them to this file is a
// separate follow-up.

export const MIN_PREFERRED = 8;
export const MAX_UNAVAILABLE = 8;

// Weekly grid: Monday (0) .. Friday (4), hourly start times from 17:00 to 22:00
export const WEEKDAY_INDEXES = [0, 1, 2, 3, 4];
export const START_TIMES = new Set([
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
]);

export function buildRecurringKey(dayOfWeek, startTime) {
    return `${dayOfWeek}|${startTime}`;
}
