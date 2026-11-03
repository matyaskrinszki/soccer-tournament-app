/**
 * Move a teamless player into a team and close every pending join request and
 * recruitment invitation of that player, in both directions. Entries for the
 * joined team become "accepted", all others "rejected".
 * Call inside a transaction, after checking that the player has no team.
 * @param {import("better-sqlite3").Database} db
 * @param {number} playerId - The player joining
 * @param {number} teamId - The team being joined
 */
export function addPlayerToTeam(db, playerId, teamId) {
    db.prepare("UPDATE players SET team_id = ? WHERE id = ?").run(
        teamId,
        playerId,
    );

    for (const table of ["join_requests", "recruitment_invitations"]) {
        db.prepare(
            `UPDATE ${table}
             SET status = CASE WHEN team_id = ? THEN 'accepted' ELSE 'rejected' END
             WHERE player_id = ? AND status = 'pending'`,
        ).run(teamId, playerId);
    }
}
