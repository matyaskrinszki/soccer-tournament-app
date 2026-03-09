/**
 * Sophisticated Match Scheduling Algorithm
 * Implements constraint satisfaction with backtracking and preference optimization
 *
 * Algorithm Overview:
 * 1. Generate all possible match pairings (round-robin: each team plays every other exactly once)
 * 2. For each match, find all available time_slot+pitch combinations where neither team is already scheduled
 * 3. Use backtracking to assign matches to slots, scoring based on team preferences
 * 4. Soft constraints (preferences) are optimized; hard constraints (no conflicts) are required
 * 5. Returns a schedule with a satisfaction score (0-100%)
 */

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
 * Main scheduling algorithm - constraint satisfaction with backtracking
 * @param {Object} params - Configuration object
 * @param {number[]} params.teamIds - Array of team IDs in the league
 * @param {Object[]} params.timeSlots - Array of {id, day_of_week, start_time, end_time, pitch_id}
 * @param {Map} params.teamPreferences - Map of teamId -> Map of timeSlotId -> preference
 * @returns {Object} {schedule: Array<{homeTeamId, awayTeamId, timeSlotId, pitchId}>, satisfactionScore: 0-100}
 */
export function generateSchedule({ teamIds, timeSlots, teamPreferences }) {
    // Generate all match pairings
    const matches = generateRoundRobinPairings(teamIds);

    // Initialize schedule result
    const schedule = [];
    const teamScheduledTimes = new Map(); // Map<teamId, Set<timeKey>>
    const pitchBookings = new Map(); // Map<pitchId, Set<timeKey>>

    teamIds.forEach((id) => teamScheduledTimes.set(id, new Set()));
    const pitchIds = [...new Set(timeSlots.map((s) => s.pitchId))];
    pitchIds.forEach((id) => pitchBookings.set(id, new Set()));

    let totalPreferenceScore = 0;
    let preferenceCount = 0;

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

            availableSlots.push({ slot, score: combinedScore });
        }

        // Sort by score (best first)
        availableSlots.sort((a, b) => b.score - a.score);

        // Try each available slot (greedy approach with backtracking if needed)
        for (const { slot, score } of availableSlots) {
            // Assign this match to this slot
            homeTeamTimes.add(timeKey);
            awayTeamTimes.add(timeKey);
            pitchBookings.get(slot.pitchId).add(timeKey);

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
            schedule.pop();
            totalPreferenceScore -= score;
            preferenceCount -= 2;
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

    return {
        success,
        schedule,
        matchCount: matches.length,
        scheduledMatchCount: schedule.length,
        satisfactionScore: Math.round(satisfactionScore),
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
