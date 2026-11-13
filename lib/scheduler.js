/**
 * Sophisticated Match Scheduling Algorithm
 * Implements constraint satisfaction with backtracking and preference optimization
 *
 * Algorithm Overview:
 * 1. Split the round robin (each team plays every other exactly once) into rounds
 *    with the circle method; each team plays at most once per round
 * 2. Outer search: put the rounds into weeks, in order. A week holds up to
 *    maxMatchesPerTeamPerWeek rounds; a round never goes into an earlier week than
 *    the round before it
 * 3. Inner search: put the matches of a round onto the free slots of its week,
 *    with backtracking. Hard constraints: no team and no pitch twice at the same time
 * 4. Preferences are soft: slots are tried with the fewest "unavailable" teams
 *    first, then the most "preferred" teams, so an unavailable slot is a last resort
 * 5. The search stops after a fixed number of steps, so a hard input can't hang the server
 * 6. Returns the schedule with how many team sides got a preferred / unavailable slot
 */

// Upper bound on slots tried (outer and inner search together) before the search gives up
export const DEFAULT_MAX_SEARCH_STEPS = 20_000;

/**
 * Split the round robin into rounds with the circle method (Berger tables).
 * Teams are ordered by id; an odd count gets a bye (null). The first team stays
 * in place, the others rotate one place per round, and in every round position i
 * plays position m-1-i. A pairing with the bye is left out: that team sits out.
 * @param {number[]} teamIds - Array of team IDs in the league
 * @returns {Array<Array<[number, number]>>} n-1 rounds (even n) or n rounds (odd n)
 *   of [homeTeamId, awayTeamId] pairs; every pair appears exactly once and every
 *   team at most once per round
 */
export function buildRounds(teamIds) {
    if (teamIds.length < 2) return [];

    const order = [...teamIds].sort((a, b) => a - b);
    if (order.length % 2 === 1) order.push(null);
    const positions = order.length;

    const rounds = [];
    for (let round = 0; round < positions - 1; round++) {
        const matches = [];
        for (let i = 0; i < positions / 2; i++) {
            const home = order[i];
            const away = order[positions - 1 - i];
            if (home !== null && away !== null) {
                matches.push([home, away]);
            }
        }
        rounds.push(matches);

        // Rotate every team but the first one place: the last moves to position 1
        order.splice(1, 0, order.pop());
    }
    return rounds;
}

/**
 * How many of the match's two teams gave this slot the given preference
 * @param {Map} teamPreferences - Map of teamId -> Map of timeSlotId -> preference
 * @param {Object} match - {homeTeamId, awayTeamId}
 * @param {number} timeSlotId - The time slot being considered
 * @param {string} preference - 'preferred' or 'unavailable'
 * @returns {number} 0, 1 or 2
 */
function countSides(teamPreferences, match, timeSlotId, preference) {
    let count = 0;
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
        if (teamPreferences.get(teamId)?.get(timeSlotId) === preference) count++;
    }
    return count;
}

function getSlotTimeKey(slot) {
    const datePart = slot.slotDate || `dow-${slot.dayOfWeek}`;
    return `${datePart}|${slot.startTime}|${slot.endTime}`;
}

/**
 * Week of a slot, as the date of that week's Monday ("YYYY-MM-DD").
 * Slots without a date belong to no week, so the weekly cap ignores them.
 * @param {Object} slot - Time slot with slotDate
 * @returns {string|null}
 */
function getSlotWeekKey(slot) {
    if (!slot.slotDate) return null;
    const date = new Date(`${slot.slotDate}T00:00:00Z`);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return date.toISOString().slice(0, 10);
}

// Same key for a pair regardless of home/away order
function pairKey(teamA, teamB) {
    return teamA < teamB ? `${teamA}-${teamB}` : `${teamB}-${teamA}`;
}

/**
 * Main scheduling algorithm: circle-method rounds, then a two-level backtracking search
 *
 * Weekly mode (every slot has a date and there is a weekly cap): the rounds are
 * put into weeks in date order, at most maxMatchesPerTeamPerWeek rounds per week.
 * Otherwise (a slot without a date, or no cap) there are no weeks: all matches are
 * placed together onto all slots, and the cap still applies to the dated slots.
 *
 * @param {Object} params - Configuration object
 * @param {number[]} params.teamIds - Array of team IDs in the league
 * @param {Object[]} params.timeSlots - Array of {id, pitchId, slotDate, dayOfWeek, startTime, endTime}
 * @param {Map} params.teamPreferences - Map of teamId -> Map of timeSlotId -> preference
 * @param {number} [params.maxMatchesPerTeamPerWeek] - Weekly cap per team (dated slots only); no cap by default
 * @param {number} [params.maxSearchSteps] - Slots tried before giving up
 * @returns {Object} {success, schedule: Array<{homeTeamId, awayTeamId, timeSlotId, pitchId, roundNumber}>,
 *   preferredSides, unavailableSides, totalSides, reason, ...}
 */
export function generateSchedule({
    teamIds,
    timeSlots,
    teamPreferences,
    maxMatchesPerTeamPerWeek = Infinity,
    maxSearchSteps = DEFAULT_MAX_SEARCH_STEPS,
}) {
    // Matches of each round, with the round's number (1-based)
    const rounds = buildRounds(teamIds).map((pairs, index) =>
        pairs.map(([homeTeamId, awayTeamId]) => ({
            homeTeamId,
            awayTeamId,
            roundNumber: index + 1,
        })),
    );
    const matchCount = rounds.reduce((sum, round) => sum + round.length, 0);

    function failure(reason, details = {}) {
        return {
            success: false,
            schedule: [],
            matchCount,
            scheduledMatchCount: 0,
            preferredSides: 0,
            unavailableSides: 0,
            totalSides: 0,
            reason,
            ...details,
        };
    }

    if (matchCount > timeSlots.length) {
        // Not enough slots to schedule all matches
        return failure("not-enough-time-slots");
    }

    // The search puts "blocks" of matches into "buckets" of slots, in order.
    // Weekly mode: a block is a round, a bucket is a week (up to cap rounds each).
    // Otherwise: one block with every match, one bucket with every slot.
    let blocks;
    let buckets;
    let blocksPerBucket;
    const weekly =
        Number.isFinite(maxMatchesPerTeamPerWeek) &&
        timeSlots.every((slot) => getSlotWeekKey(slot) !== null);

    if (weekly) {
        const slotsByWeek = new Map(); // Map<weekKey, slots in the given order>
        for (const slot of timeSlots) {
            const weekKey = getSlotWeekKey(slot);
            if (!slotsByWeek.has(weekKey)) slotsByWeek.set(weekKey, []);
            slotsByWeek.get(weekKey).push(slot);
        }
        // Week keys are "YYYY-MM-DD" Mondays, so string order is date order
        buckets = [...slotsByWeek.keys()].sort().map((key) => slotsByWeek.get(key));

        const requiredWeeks = Math.ceil(rounds.length / maxMatchesPerTeamPerWeek);
        if (buckets.length < requiredWeeks) {
            return failure("not-enough-weeks", {
                weekCount: buckets.length,
                requiredWeeks,
            });
        }
        blocks = rounds;
        blocksPerBucket = maxMatchesPerTeamPerWeek;
    } else {
        blocks = [rounds.flat()];
        buckets = [timeSlots];
        blocksPerBucket = 1;
    }

    const teamScheduledTimes = new Map(); // Map<teamId, Set<timeKey>>
    const teamWeekCounts = new Map(); // Map<teamId, Map<weekKey, matchCount>>
    const pitchBookings = new Map(); // Map<pitchId, Set<timeKey>>
    teamIds.forEach((id) => teamScheduledTimes.set(id, new Set()));
    teamIds.forEach((id) => teamWeekCounts.set(id, new Map()));
    const pitchIds = [...new Set(timeSlots.map((s) => s.pitchId))];
    pitchIds.forEach((id) => pitchBookings.set(id, new Set()));

    const placements = []; // Stack of {match, slot, timeKey, weekKey}
    const blocksInBucket = buckets.map(() => 0);
    let searchSteps = 0;
    let searchAborted = false;

    function isUnderWeeklyCap(teamId, weekKey) {
        if (weekKey === null) return true;
        const count = teamWeekCounts.get(teamId).get(weekKey) || 0;
        return count < maxMatchesPerTeamPerWeek;
    }

    function changeWeekCount(teamId, weekKey, delta) {
        if (weekKey === null) return;
        const counts = teamWeekCounts.get(teamId);
        counts.set(weekKey, (counts.get(weekKey) || 0) + delta);
    }

    function place(match, slot, timeKey, weekKey) {
        for (const teamId of [match.homeTeamId, match.awayTeamId]) {
            teamScheduledTimes.get(teamId).add(timeKey);
            changeWeekCount(teamId, weekKey, 1);
        }
        pitchBookings.get(slot.pitchId).add(timeKey);
        placements.push({ match, slot, timeKey, weekKey });
    }

    // Takes back placements until only `count` are left
    function unplaceDownTo(count) {
        while (placements.length > count) {
            const { match, slot, timeKey, weekKey } = placements.pop();
            for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                teamScheduledTimes.get(teamId).delete(timeKey);
                changeWeekCount(teamId, weekKey, -1);
            }
            pitchBookings.get(slot.pitchId).delete(timeKey);
        }
    }

    /**
     * Inner search: place matches[matchIndex..] onto the given slots, with backtracking
     * @returns {boolean} True if every remaining match got a slot
     */
    function placeMatches(matches, slots, matchIndex) {
        if (matchIndex === matches.length) {
            return true;
        }

        const match = matches[matchIndex];
        const homeTeamTimes = teamScheduledTimes.get(match.homeTeamId);
        const awayTeamTimes = teamScheduledTimes.get(match.awayTeamId);

        const availableSlots = [];
        for (const slot of slots) {
            const timeKey = getSlotTimeKey(slot);
            // Check hard constraints: no team already scheduled at this time
            if (homeTeamTimes.has(timeKey) || awayTeamTimes.has(timeKey)) {
                continue;
            }
            // Check pitch not double-booked
            if (pitchBookings.get(slot.pitchId).has(timeKey)) {
                continue;
            }
            // Check neither team has reached its weekly match cap (only matters
            // without week buckets: in weekly mode a week holds at most cap rounds)
            const weekKey = getSlotWeekKey(slot);
            if (
                !isUnderWeeklyCap(match.homeTeamId, weekKey) ||
                !isUnderWeeklyCap(match.awayTeamId, weekKey)
            ) {
                continue;
            }

            availableSlots.push({
                slot,
                timeKey,
                weekKey,
                unavailable: countSides(teamPreferences, match, slot.id, "unavailable"),
                preferred: countSides(teamPreferences, match, slot.id, "preferred"),
            });
        }

        // Fewest "unavailable" teams first, then most "preferred" teams; ties keep slot order
        availableSlots.sort(
            (a, b) => a.unavailable - b.unavailable || b.preferred - a.preferred,
        );

        const placedBefore = placements.length;
        for (const { slot, timeKey, weekKey } of availableSlots) {
            if (searchSteps >= maxSearchSteps) {
                searchAborted = true;
                return false;
            }
            searchSteps++;

            place(match, slot, timeKey, weekKey);
            if (placeMatches(matches, slots, matchIndex + 1)) {
                return true;
            }
            unplaceDownTo(placedBefore);

            // Step limit hit deeper down: unwind without trying more slots
            if (searchAborted) {
                return false;
            }
        }

        // No valid slot for this match
        return false;
    }

    /**
     * Outer search: put blocks[blockIndex..] into buckets, starting at firstBucket
     * (the bucket of the previous block, so a block never goes into an earlier one)
     * @returns {boolean} True if every remaining block got a bucket
     */
    function placeBlocks(blockIndex, firstBucket) {
        if (blockIndex === blocks.length) {
            return true;
        }

        const blocksLeftAfter = blocks.length - blockIndex - 1;
        for (let bucket = firstBucket; bucket < buckets.length; bucket++) {
            if (blocksInBucket[bucket] >= blocksPerBucket) {
                continue;
            }
            // The blocks after this one must fit into the room left in this bucket and
            // the later ones; if not, later buckets have even less room
            const roomAfter =
                blocksPerBucket - blocksInBucket[bucket] - 1 +
                blocksPerBucket * (buckets.length - 1 - bucket);
            if (roomAfter < blocksLeftAfter) {
                break;
            }

            const placedBefore = placements.length;
            if (placeMatches(blocks[blockIndex], buckets[bucket], 0)) {
                blocksInBucket[bucket]++;
                if (placeBlocks(blockIndex + 1, bucket)) {
                    return true;
                }
                blocksInBucket[bucket]--;
                unplaceDownTo(placedBefore);
            }

            if (searchAborted) {
                return false;
            }
        }

        // No bucket fits this block: the previous block moves on to its next bucket
        return false;
    }

    if (!placeBlocks(0, 0)) {
        return failure(
            searchAborted ? "search-limit-reached" : "no-valid-assignment-found",
            { searchSteps },
        );
    }

    const schedule = [];
    let preferredSides = 0;
    let unavailableSides = 0;
    for (const { match, slot } of placements) {
        schedule.push({
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            timeSlotId: slot.id,
            pitchId: slot.pitchId,
            roundNumber: match.roundNumber,
        });
        preferredSides += countSides(teamPreferences, match, slot.id, "preferred");
        unavailableSides += countSides(teamPreferences, match, slot.id, "unavailable");
    }

    return {
        success: true,
        schedule,
        matchCount,
        scheduledMatchCount: schedule.length,
        preferredSides,
        unavailableSides,
        totalSides: 2 * schedule.length,
        reason: null,
        searchSteps,
    };
}

/**
 * Validate a generated schedule for conflicts
 * @param {Object[]} schedule - Generated schedule
 * @param {Object[]} timeSlots - All time slots
 * @param {Object} [options]
 * @param {number[]} [options.teamIds] - The league's teams; if given, every pair must play exactly once
 * @param {number} [options.maxMatchesPerTeamPerWeek] - Weekly cap per team (dated slots only); no cap by default
 * @returns {Object} {isValid: boolean, conflicts: Array<string>}
 */
export function validateSchedule(
    schedule,
    timeSlots,
    { teamIds, maxMatchesPerTeamPerWeek = Infinity } = {},
) {
    const conflicts = [];
    const slotById = new Map((timeSlots || []).map((slot) => [slot.id, slot]));

    // Check for team double-bookings
    const teamTimeBookings = new Map();
    for (const match of schedule) {
        const slot = slotById.get(match.timeSlotId);
        const timeKey = slot
            ? getSlotTimeKey(slot)
            : `slot-${match.timeSlotId}`;

        const key = `${match.homeTeamId}:${timeKey}`;
        if (teamTimeBookings.has(key)) {
            conflicts.push(
                `Team ${match.homeTeamId} has multiple matches at ${timeKey}`,
            );
        }
        teamTimeBookings.set(key, true);

        const key2 = `${match.awayTeamId}:${timeKey}`;
        if (teamTimeBookings.has(key2)) {
            conflicts.push(
                `Team ${match.awayTeamId} has multiple matches at ${timeKey}`,
            );
        }
        teamTimeBookings.set(key2, true);
    }

    // Check for pitch double-bookings
    const pitchBookings = new Map();
    for (const match of schedule) {
        const slot = slotById.get(match.timeSlotId);
        const timeKey = slot
            ? getSlotTimeKey(slot)
            : `slot-${match.timeSlotId}`;
        const key = `${match.pitchId}:${timeKey}`;
        if (pitchBookings.has(key)) {
            conflicts.push(
                `Pitch ${match.pitchId} double-booked at ${timeKey}`,
            );
        }
        pitchBookings.set(key, true);
    }

    // Check the weekly cap (same week key as generateSchedule; undated slots have none)
    const teamWeekCounts = new Map(); // Map<"teamId|weekKey", matchCount>
    for (const match of schedule) {
        const slot = slotById.get(match.timeSlotId);
        const weekKey = slot ? getSlotWeekKey(slot) : null;
        if (weekKey === null) continue;
        for (const teamId of [match.homeTeamId, match.awayTeamId]) {
            const key = `${teamId}|${weekKey}`;
            teamWeekCounts.set(key, (teamWeekCounts.get(key) || 0) + 1);
        }
    }
    for (const [key, count] of teamWeekCounts) {
        if (count > maxMatchesPerTeamPerWeek) {
            const [teamId, weekKey] = key.split("|");
            conflicts.push(
                `Team ${teamId} has ${count} matches in the week of ${weekKey} (max ${maxMatchesPerTeamPerWeek})`,
            );
        }
    }

    // Check the round robin: every pair of the league's teams plays exactly once
    if (teamIds) {
        const expectedCount = (teamIds.length * (teamIds.length - 1)) / 2;
        if (schedule.length !== expectedCount) {
            conflicts.push(
                `Expected ${expectedCount} matches, found ${schedule.length}`,
            );
        }

        const pairCounts = new Map(); // Map<"smallerId-largerId", matchCount>
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                pairCounts.set(pairKey(teamIds[i], teamIds[j]), 0);
            }
        }
        for (const match of schedule) {
            const key = pairKey(match.homeTeamId, match.awayTeamId);
            if (!pairCounts.has(key)) {
                conflicts.push(
                    `Match ${match.homeTeamId}-${match.awayTeamId} is not a pair of the league's teams`,
                );
                continue;
            }
            pairCounts.set(key, pairCounts.get(key) + 1);
        }
        for (const [key, count] of pairCounts) {
            if (count === 0) {
                conflicts.push(`Pair ${key} is not scheduled`);
            } else if (count > 1) {
                conflicts.push(`Pair ${key} is scheduled ${count} times`);
            }
        }
    }

    return {
        isValid: conflicts.length === 0,
        conflicts,
    };
}
