// Season statuses as the admin page shows them. The lifecycle rules themselves
// live in lib/season-status.js.

export const STATUS_LABELS = {
    setup: 'Nevezés',
    'team-preferences': 'Preferenciák',
    generated: 'Ütemezve',
    active: 'Folyamatban',
    completed: 'Lezárult',
};

// A schedule can be (re)generated in these statuses
export const GENERATABLE_STATUSES = ['team-preferences', 'generated'];

// After publishing the schedule is fixed (see lib/publish-schedule.js)
export const PUBLISHED_STATUSES = ['active', 'completed'];

/**
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
    return STATUS_LABELS[status] ?? status;
}
