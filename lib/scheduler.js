/**
 * Sophisticated Match Scheduling Algorithm
 * Implements constraint satisfaction with backtracking and preference optimization
 *
 * Algorithm Overview:
 * 1. Generate all possible match pairings (round-robin: each team plays every other exactly once)
 * 2. For each match, find all available time_slot+pitch combinations where neither team is already scheduled
 * 3. Use backtracking to assign matches to slots, scoring based on team preferences
 * 4. Soft constraints (preferences) are optimized; hard constraints (no conflicts,
 *    weekly match cap) are required
 * 5. The search stops after a fixed number of steps, so a hard input can't hang the server
 * 6. Returns a schedule with a satisfaction score (0-100%)
 */

// Upper bound on match placements tried before the search gives up
export const DEFAULT_MAX_SEARCH_STEPS = 20_000;

/**
 * Generate round-robin match pairings
 * @param {number[]} teamIds - Array of team IDs in the league
 * @returns {Array} Array of [homeTeamId, awayTeamId] pairs
 */
function generateRoundRobinPairings(teamIds) {
    const pairings = [];
    for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
            // Each pair plays once (no home/away distinction as per spec)
            pairings.push([teamIds[i], teamIds[j]]);
        }
    }
    return pairings;
}

/**
 * Calculate preference score for a team+timeSlot combination
 * @param {Object} preferences - Map of timeSlotId to preference ('preferred'|'unavailable'|'neutral')
 * @param {number} timeSlotId - The time slot being considered
 * @returns {number} Score: 100 for preferred, -50 for unavailable, 0 for neutral
 */
function calculatePreferenceScore(preferences, timeSlotId) {
    const pref = preferences.get(timeSlotId);
    if (!pref) return 0;
    if (pref === "preferred") return 100;
    if (pref === "unavailable") return -50;
    return 0;
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

/**
 * Main scheduling algorithm - constraint satisfaction with backtracking
 * @param {Object} params - Configuration object
 * @param {number[]} params.teamIds - Array of team IDs in the league
 * @param {Object[]} params.timeSlots - Array of {id, day_of_week, start_time, end_time, pitch_id}
 * @param {Map} params.teamPreferences - Map of teamId -> Map of timeSlotId -> preference
 * @param {number} [params.maxMatchesPerTeamPerWeek] - Weekly cap per team (dated slots only); no cap by default
 * @param {number} [params.maxSearchSteps] - Placements tried before giving up
 * @returns {Object} {schedule: Array<{homeTeamId, awayTeamId, timeSlotId, pitchId}>, satisfactionScore: 0-100}
 */
export function generateSchedule({
    teamIds,
    timeSlots,
    teamPreferences,
    maxMatchesPerTeamPerWeek = Infinity,
    maxSearchSteps = DEFAULT_MAX_SEARCH_STEPS,
}) {
    // Generate all match pairings
    const matches = generateRoundRobinPairings(teamIds);

    // Initialize schedule result
    const schedule = [];
    const teamScheduledTimes = new Map(); // Map<teamId, Set<timeKey>>
    const teamWeekCounts = new Map(); // Map<teamId, Map<weekKey, matchCount>>
    const pitchBookings = new Map(); // Map<pitchId, Set<timeKey>>

    teamIds.forEach((id) => teamScheduledTimes.set(id, new Set()));
    teamIds.forEach((id) => teamWeekCounts.set(id, new Map()));
    const pitchIds = [...new Set(timeSlots.map((s) => s.pitchId))];
    pitchIds.forEach((id) => pitchBookings.set(id, new Set()));

    let totalPreferenceScore = 0;
    let preferenceCount = 0;

    if (matches.length > timeSlots.length) {
        // Not enough slots to schedule all matches
        return {
            success: false,
            schedule,
            matchCount: matches.length,
            scheduledMatchCount: schedule.length,
            satisfactionScore: 0,
            reason: "not-enough-time-slots",
        };
    }

    // Each team plays every other team once. If every slot is dated, the season
    // must have enough weeks for that under the weekly cap.
    const requiredWeeks = Math.ceil(
        (teamIds.length - 1) / maxMatchesPerTeamPerWeek,
    );
    const weekKeys = new Set(timeSlots.map(getSlotWeekKey));
    if (!weekKeys.has(null) && weekKeys.size < requiredWeeks) {
        return {
            success: false,
            schedule,
            matchCount: matches.length,
            scheduledMatchCount: schedule.length,
            satisfactionScore: 0,
            reason: "not-enough-weeks",
            weekCount: weekKeys.size,
            requiredWeeks,
        };
    }

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

    /**
     * Backtracking function to assign matches to time slots
     * @param {number} matchIndex - Current match index to assign
     * @returns {boolean} True if remaining matches can be scheduled
     */
    function backtrack(matchIndex) {
        // Base case: all matches assigned
        if (matchIndex === matches.length) {
            return true;
        }

        const [homeTeamId, awayTeamId] = matches[matchIndex];
        const homeTeamTimes = teamScheduledTimes.get(homeTeamId);
        const awayTeamTimes = teamScheduledTimes.get(awayTeamId);

        // Collect available time slots for this match, sorted by preference score (descending)
        const availableSlots = [];
        for (const slot of timeSlots) {
            const timeKey = getSlotTimeKey(slot);
            // Check hard constraints: no team already scheduled at this time
            if (homeTeamTimes.has(timeKey) || awayTeamTimes.has(timeKey)) {
                continue;
            }
            // Check pitch not double-booked
            if ((pitchBookings.get(slot.pitchId) || new Set()).has(timeKey)) {
                continue;
            }
            // Check neither team has reached its weekly match cap
            const weekKey = getSlotWeekKey(slot);
            if (
                !isUnderWeeklyCap(homeTeamId, weekKey) ||
                !isUnderWeeklyCap(awayTeamId, weekKey)
            ) {
                continue;
            }

            // Calculate preference score
            const homeScore = calculatePreferenceScore(
                teamPreferences.get(homeTeamId) || new Map(),
                slot.id,
            );
            const awayScore = calculatePreferenceScore(
                teamPreferences.get(awayTeamId) || new Map(),
                slot.id,
            );
            const combinedScore = homeScore + awayScore;

            availableSlots.push({ slot, timeKey, weekKey, score: combinedScore });
        }

        // Sort by score (best first)
        availableSlots.sort((a, b) => b.score - a.score);

        // Try each available slot (greedy approach with backtracking if needed)
        for (const { slot, timeKey, weekKey, score } of availableSlots) {
            if (searchSteps >= maxSearchSteps) {
                searchAborted = true;
                return false;
            }
            searchSteps++;

            // Assign this match to this slot
            homeTeamTimes.add(timeKey);
            awayTeamTimes.add(timeKey);
            pitchBookings.get(slot.pitchId).add(timeKey);
            changeWeekCount(homeTeamId, weekKey, 1);
            changeWeekCount(awayTeamId, weekKey, 1);

            schedule.push({
                homeTeamId,
                awayTeamId,
                timeSlotId: slot.id,
                pitchId: slot.pitchId,
            });

            totalPreferenceScore += score;
            preferenceCount += 2; // Count both teams' preferences

            // Recurse
            if (backtrack(matchIndex + 1)) {
                return true;
            }

            // Backtrack
            homeTeamTimes.delete(timeKey);
            awayTeamTimes.delete(timeKey);
            pitchBookings.get(slot.pitchId).delete(timeKey);
            changeWeekCount(homeTeamId, weekKey, -1);
            changeWeekCount(awayTeamId, weekKey, -1);
            schedule.pop();
            totalPreferenceScore -= score;
            preferenceCount -= 2;

            // Step limit hit deeper down: unwind without trying more slots
            if (searchAborted) {
                return false;
            }
        }

        // No valid assignment found for this match - unable to complete schedule
        return false;
    }

    // Run the backtracking algorithm
    const success = backtrack(0);

    // Calculate satisfaction score (0-100%)
    // Perfect schedule (all preferences satisfied): 100%
    // Minimum (only unavoidable conflicts): varies based on preference distribution
    let satisfactionScore = 0;
    if (preferenceCount > 0) {
        // Score ranges from -50*count (all unavailable) to 100*count (all preferred)
        // Normalize to 0-100%
        const maxScore = 100 * preferenceCount;
        const minScore = -50 * preferenceCount;
        satisfactionScore =
            ((totalPreferenceScore - minScore) / (maxScore - minScore)) * 100;
        satisfactionScore = Math.max(0, Math.min(100, satisfactionScore)); // Clamp to 0-100
    }

    let reason = null;
    if (!success) {
        reason = searchAborted ? "search-limit-reached" : "no-valid-assignment-found";
    }

    return {
        success,
        schedule,
        matchCount: matches.length,
        scheduledMatchCount: schedule.length,
        satisfactionScore: Math.round(satisfactionScore),
        reason,
        searchSteps,
    };
}

/**
 * Validate a generated schedule for conflicts
 * @param {Object[]} schedule - Generated schedule
 * @param {Object[]} timeSlots - All time slots
 * @returns {Object} {isValid: boolean, conflicts: Array<string>}
 */
export function validateSchedule(schedule, timeSlots) {
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

    return {
        isValid: conflicts.length === 0,
        conflicts,
    };
}
