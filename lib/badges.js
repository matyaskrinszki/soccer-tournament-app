// Badges (kitűzők) a player earns, calculated on read from recorded data. Only the
// player's choice to hide a badge on their public profile is stored (migration
// 009). Every badge must be derivable correctly from what the database records;
// see ISSUES.md for the ones left out. Takes the database as a parameter so it can
// be tested on its own.

/**
 * Badge definitions, in display order. `earned` gets the facts collected by
 * getPlayerFacts.
 * @type {{id: string, name: string, description: string, earned: (facts: Object) => boolean}[]}
 */
export const BADGES = [
    {
        id: "first-goal",
        name: "Első gól",
        description: "Legalább egy rögzített gólt szerzett.",
        earned: (facts) => facts.totalGoals >= 1,
    },
    {
        id: "hat-trick",
        name: "Mesterhármas",
        description: "Egy mérkőzésen legalább három gólt szerzett.",
        earned: (facts) => facts.mostGoalsInMatch >= 3,
    },
    {
        id: "captain",
        name: "Csapatkapitány",
        description: "Jelenleg egy csapat kapitánya.",
        earned: (facts) => facts.isCaptain,
    },
];

function getPlayerFacts(db, playerId) {
    const goals = db
        .prepare(
            `SELECT COALESCE(SUM(perMatch), 0) as totalGoals,
                    COALESCE(MAX(perMatch), 0) as mostGoalsInMatch
             FROM (SELECT COUNT(*) as perMatch FROM goals WHERE player_id = ? GROUP BY match_id)`,
        )
        .get(playerId);
    const captain = db
        .prepare("SELECT 1 FROM teams WHERE captain_player_id = ? LIMIT 1")
        .get(playerId);

    return {
        totalGoals: goals.totalGoals,
        mostGoalsInMatch: goals.mostGoalsInMatch,
        isCaptain: Boolean(captain),
    };
}

/**
 * The badges the player has earned, each with whether it is shown on the public
 * profile.
 * @param {import("better-sqlite3").Database} db
 * @param {number} playerId
 * @returns {{ok: true, badges: {id: string, name: string, description: string, visible: boolean}[]}
 *         | {ok: false, status: number, error: string}}
 */
export function getPlayerBadges(db, playerId) {
    const player = db.prepare("SELECT id FROM players WHERE id = ?").get(playerId);
    if (!player) {
        return { ok: false, status: 404, error: "A játékos nem található" };
    }

    const facts = getPlayerFacts(db, player.id);
    const hidden = new Set(
        db
            .prepare("SELECT badge_id as badgeId FROM hidden_badges WHERE player_id = ?")
            .all(player.id)
            .map((row) => row.badgeId),
    );

    const badges = BADGES.filter((badge) => badge.earned(facts)).map((badge) => ({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        visible: !hidden.has(badge.id),
    }));
    return { ok: true, badges };
}

/**
 * Show or hide one of the player's earned badges on their public profile.
 * @param {import("better-sqlite3").Database} db
 * @param {number} playerId
 * @param {*} badgeId - Raw value from the request
 * @param {*} visible - Raw value from the request; must be a boolean
 * @returns {{ok: true, badges: Object[]} | {ok: false, status: number, error: string}}
 *   The player's badges after the change
 */
export function setBadgeVisibility(db, playerId, badgeId, visible) {
    if (typeof visible !== "boolean") {
        return { ok: false, status: 400, error: "Érvénytelen láthatósági beállítás" };
    }

    const current = getPlayerBadges(db, playerId);
    if (!current.ok) {
        return current;
    }
    if (!BADGES.some((badge) => badge.id === badgeId)) {
        return { ok: false, status: 400, error: "Ismeretlen kitűző" };
    }
    if (!current.badges.some((badge) => badge.id === badgeId)) {
        return { ok: false, status: 400, error: "Ezt a kitűzőt még nem szerezted meg" };
    }

    if (visible) {
        db.prepare("DELETE FROM hidden_badges WHERE player_id = ? AND badge_id = ?").run(playerId, badgeId);
    } else {
        db.prepare("INSERT OR IGNORE INTO hidden_badges (player_id, badge_id) VALUES (?, ?)").run(
            playerId,
            badgeId,
        );
    }
    return getPlayerBadges(db, playerId);
}
