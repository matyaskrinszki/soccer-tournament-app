// Tests for lib/scheduler.js.
// Run: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    buildRounds,
    generateSchedule,
    validateSchedule,
    DEFAULT_MAX_SEARCH_STEPS,
} from "../lib/scheduler.js";

// Build slots for one or more evenings.
// layout = { "17:00": 2, "18:00": 1 } means 2 pitches at 17:00 and 1 at 18:00.
function buildSlots(layout, dates = ["2026-03-02"]) {
    const slots = [];
    let id = 1;
    for (const date of dates) {
        for (const [startTime, pitchCount] of Object.entries(layout)) {
            for (let pitchId = 1; pitchId <= pitchCount; pitchId++) {
                slots.push({
                    id: id++,
                    pitchId,
                    slotDate: date,
                    dayOfWeek: 0,
                    startTime,
                    endTime: "",
                });
            }
        }
    }
    return slots;
}

// Same preference for every slot, for every team
function uniformPreferences(teamIds, slots, preference) {
    return new Map(
        teamIds.map((teamId) => [
            teamId,
            new Map(slots.map((slot) => [slot.id, preference])),
        ]),
    );
}

function pairKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function assertRoundRobinComplete(schedule, teamIds) {
    const expectedPairs = (teamIds.length * (teamIds.length - 1)) / 2;
    assert.equal(schedule.length, expectedPairs);

    const seen = new Set();
    for (const match of schedule) {
        assert.notEqual(match.homeTeamId, match.awayTeamId, "team plays itself");
        assert.ok(teamIds.includes(match.homeTeamId));
        assert.ok(teamIds.includes(match.awayTeamId));
        const key = pairKey(match.homeTeamId, match.awayTeamId);
        assert.ok(!seen.has(key), `pair ${key} scheduled twice`);
        seen.add(key);
    }
    assert.equal(seen.size, expectedPairs);
}

// Scenario A from the playground: needs backtracking to succeed
const SCENARIO_A_LAYOUT = { "17:00": 2, "18:00": 1, "19:00": 1, "20:00": 2 };

describe("buildRounds", () => {
    for (const teamCount of [2, 3, 4, 5, 6, 7, 8]) {
        const teamIds = Array.from({ length: teamCount }, (_, i) => i + 1);
        const rounds = buildRounds(teamIds);
        const isOdd = teamCount % 2 === 1;

        describe(`${teamCount} teams`, () => {
            it(`returns ${isOdd ? "n" : "n-1"} rounds`, () => {
                assert.equal(rounds.length, isOdd ? teamCount : teamCount - 1);
            });

            it("schedules every pair exactly once", () => {
                assertRoundRobinComplete(
                    rounds.flat().map(([homeTeamId, awayTeamId]) => ({
                        homeTeamId,
                        awayTeamId,
                    })),
                    teamIds,
                );
            });

            it("puts each team in a round at most once", () => {
                for (const round of rounds) {
                    const teams = round.flat();
                    assert.equal(new Set(teams).size, teams.length);
                    assert.equal(round.length, Math.floor(teamCount / 2));
                }
            });

            if (isOdd) {
                it("lets each team sit out exactly once", () => {
                    const sitOuts = new Map(teamIds.map((id) => [id, 0]));
                    for (const round of rounds) {
                        const playing = new Set(round.flat());
                        for (const id of teamIds) {
                            if (!playing.has(id)) sitOuts.set(id, sitOuts.get(id) + 1);
                        }
                    }
                    for (const [id, count] of sitOuts) {
                        assert.equal(count, 1, `team ${id} sits out ${count} times`);
                    }
                });
            }
        });
    }

    it("orders teams by id, whatever the input order", () => {
        assert.deepEqual(buildRounds([30, 10, 20, 40]), buildRounds([10, 20, 30, 40]));
    });

    it("gives the textbook circle-method rounds for 4 teams", () => {
        assert.deepEqual(buildRounds([1, 2, 3, 4]), [
            [[1, 4], [2, 3]],
            [[1, 3], [4, 2]],
            [[1, 2], [3, 4]],
        ]);
    });

    it("never pairs a team with the bye (3 teams)", () => {
        assert.deepEqual(buildRounds([1, 2, 3]), [[[2, 3]], [[1, 3]], [[1, 2]]]);
    });

    it("does not change the input array", () => {
        const teamIds = [3, 1, 2];
        buildRounds(teamIds);
        assert.deepEqual(teamIds, [3, 1, 2]);
    });

    it("returns no rounds for fewer than 2 teams", () => {
        assert.deepEqual(buildRounds([]), []);
        assert.deepEqual(buildRounds([1]), []);
    });
});

describe("generateSchedule", () => {
    describe("round-robin completeness", () => {
        for (const teamCount of [2, 3, 4, 5, 6]) {
            it(`schedules every pair exactly once for ${teamCount} teams`, () => {
                const teamIds = Array.from({ length: teamCount }, (_, i) => i + 1);
                const slots = buildSlots({ "17:00": 2, "18:00": 2, "19:00": 2 }, [
                    "2026-03-02",
                    "2026-03-03",
                    "2026-03-04",
                ]);

                const result = generateSchedule({
                    teamIds,
                    timeSlots: slots,
                    teamPreferences: new Map(),
                });

                assert.equal(result.success, true);
                assert.equal(result.reason, null);
                assert.equal(result.matchCount, result.scheduledMatchCount);
                assertRoundRobinComplete(result.schedule, teamIds);
            });
        }

        it("only uses the given slots, with the pitch of that slot", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const slotById = new Map(slots.map((s) => [s.id, s]));

            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            for (const match of result.schedule) {
                const slot = slotById.get(match.timeSlotId);
                assert.ok(slot, `unknown slot ${match.timeSlotId}`);
                assert.equal(match.pitchId, slot.pitchId);
            }
        });
    });

    describe("no double booking", () => {
        it("scenario A: succeeds after backtracking with a valid schedule", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            assert.equal(result.success, true);
            assertRoundRobinComplete(result.schedule, [1, 2, 3, 4]);
            assert.deepEqual(validateSchedule(result.schedule, slots), {
                isValid: true,
                conflicts: [],
            });
        });

        it("never puts a team in two matches at the same time", () => {
            // 6 teams: 15 matches, 5 per team, so at least 5 distinct times are needed
            const slots = buildSlots({ "17:00": 3, "18:00": 3 }, [
                "2026-03-02",
                "2026-03-03",
                "2026-03-04",
            ]);
            const slotById = new Map(slots.map((s) => [s.id, s]));
            const teamIds = [1, 2, 3, 4, 5, 6];

            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
            });
            assert.equal(result.success, true);

            const busy = new Set();
            for (const match of result.schedule) {
                const slot = slotById.get(match.timeSlotId);
                for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                    const key = `${teamId}|${slot.slotDate}|${slot.startTime}`;
                    assert.ok(!busy.has(key), `team double-booked: ${key}`);
                    busy.add(key);
                }
            }
        });

        it("never uses the same slot twice", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            const slotIds = result.schedule.map((m) => m.timeSlotId);
            assert.equal(new Set(slotIds).size, slotIds.length);
        });

        it("scenario D: two leagues on the same slot list clash, so used slots must be removed between leagues", () => {
            const slots = buildSlots({
                "17:00": 2,
                "18:00": 2,
                "19:00": 2,
                "20:00": 2,
            }, ["2026-03-02", "2026-03-03"]);

            const leagueX = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });
            const sameSlotsY = generateSchedule({
                teamIds: [5, 6, 7, 8],
                timeSlots: slots,
                teamPreferences: new Map(),
            });
            const clash = validateSchedule(
                [...leagueX.schedule, ...sameSlotsY.schedule],
                slots,
            );
            assert.equal(clash.isValid, false);

            // What api/admin/generate-schedule does: drop slots league X used
            const usedIds = new Set(leagueX.schedule.map((m) => m.timeSlotId));
            const freeSlots = slots.filter((s) => !usedIds.has(s.id));
            const leagueY = generateSchedule({
                teamIds: [5, 6, 7, 8],
                timeSlots: freeSlots,
                teamPreferences: new Map(),
            });
            assert.equal(leagueY.success, true);
            assert.equal(
                validateSchedule([...leagueX.schedule, ...leagueY.schedule], slots)
                    .isValid,
                true,
            );
        });
    });

    describe("not enough slots", () => {
        it("scenario C: fewer slots than matches fails fast", () => {
            const slots = buildSlots({ "17:00": 1, "18:00": 1, "19:00": 1 });
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, "not-enough-time-slots");
            assert.equal(result.matchCount, 6);
            assert.equal(result.scheduledMatchCount, 0);
            assert.deepEqual(result.schedule, []);
            assert.equal(result.totalSides, 0);
        });

        it("scenario E: enough slots, but all at the same time, finds no valid assignment", () => {
            const slots = buildSlots({ "17:00": 6 });
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, "no-valid-assignment-found");
            assert.deepEqual(result.schedule, []);
        });

        it("succeeds with exactly as many usable slots as matches", () => {
            // 3 teams = 3 matches, each team plays 2, so 3 separate times are needed
            const slots = buildSlots({ "17:00": 1, "18:00": 1, "19:00": 1 });
            const result = generateSchedule({
                teamIds: [1, 2, 3],
                timeSlots: slots,
                teamPreferences: new Map(),
            });

            assert.equal(result.success, true);
            assertRoundRobinComplete(result.schedule, [1, 2, 3]);
        });
    });

    describe("preference counts", () => {
        const teamIds = [1, 2, 3, 4];

        // Recounts the sides from the schedule, independently of the scheduler
        function countSidesIn(schedule, teamPreferences, preference) {
            let count = 0;
            for (const match of schedule) {
                for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                    if (teamPreferences.get(teamId)?.get(match.timeSlotId) === preference) {
                        count++;
                    }
                }
            }
            return count;
        }

        it("counts every side as preferred when every slot is preferred by every team", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: uniformPreferences(teamIds, slots, "preferred"),
            });
            assert.equal(result.success, true);
            assert.equal(result.preferredSides, 12);
            assert.equal(result.unavailableSides, 0);
            assert.equal(result.totalSides, 12);
        });

        it("still schedules when every slot is unavailable for every team (soft rule)", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: uniformPreferences(teamIds, slots, "unavailable"),
            });
            assert.equal(result.success, true);
            assert.equal(result.preferredSides, 0);
            assert.equal(result.unavailableSides, 12);
            assert.equal(result.totalSides, 12);
        });

        it("counts nothing with no preferences", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
            });
            assert.equal(result.preferredSides, 0);
            assert.equal(result.unavailableSides, 0);
            assert.equal(result.totalSides, 12);
        });

        it("matches a recount from the schedule for mixed preferences", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT, ["2026-03-02", "2026-03-03"]);
            const choices = ["preferred", "neutral", "unavailable"];
            const teamPreferences = new Map(
                teamIds.map((teamId) => [
                    teamId,
                    new Map(
                        slots.map((slot) => [
                            slot.id,
                            choices[(slot.id * 7 + teamId * 3) % choices.length],
                        ]),
                    ),
                ]),
            );

            const result = generateSchedule({ teamIds, timeSlots: slots, teamPreferences });
            assert.equal(result.success, true);
            assert.equal(
                result.preferredSides,
                countSidesIn(result.schedule, teamPreferences, "preferred"),
            );
            assert.equal(
                result.unavailableSides,
                countSidesIn(result.schedule, teamPreferences, "unavailable"),
            );
            assert.equal(result.totalSides, 2 * result.schedule.length);
        });

        it("scenario B: uses an unavailable slot only where it can't be avoided", () => {
            // All 6 slots are needed and both 17:00 pitches hold all 4 teams,
            // so team 4 must play once at 17:00; never twice
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const teamPreferences = new Map([
                [3, new Map([[3, "preferred"]])], // slot 3 = 18:00
                [4, new Map([[1, "unavailable"], [2, "unavailable"]])], // 17:00
            ]);
            const result = generateSchedule({ teamIds, timeSlots: slots, teamPreferences });

            assert.equal(result.success, true);
            assert.equal(result.unavailableSides, 1);
        });
    });

    describe("weekly match cap", () => {
        const teamIds = [1, 2, 3, 4, 5, 6];
        // Mondays of 5 consecutive weeks
        const fiveMondays = [
            "2026-03-02",
            "2026-03-09",
            "2026-03-16",
            "2026-03-23",
            "2026-03-30",
        ];

        // Keyed by date; the tests using it have one date per week
        function matchesPerTeamPerDate(schedule, slots) {
            const slotById = new Map(slots.map((s) => [s.id, s]));
            const counts = new Map();
            for (const match of schedule) {
                const date = slotById.get(match.timeSlotId).slotDate;
                for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                    const key = `${teamId}|${date}`;
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            }
            return counts;
        }

        it("fits 6 teams into exactly 5 weeks with 1 match per team per week", () => {
            // One evening per week, 3 pitches: every week every team must play once
            const slots = buildSlots({ "17:00": 3 }, fiveMondays);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });

            assert.equal(result.success, true);
            assertRoundRobinComplete(result.schedule, teamIds);
            for (const [key, count] of matchesPerTeamPerDate(result.schedule, slots)) {
                assert.equal(count, 1, `${key} has ${count} matches`);
            }
        });

        it("respects a cap of 3 even when one week has room for everything", () => {
            // Week 1 alone has enough slots for all 15 matches
            const slots = buildSlots({ "17:00": 3, "18:00": 3, "19:00": 3 }, [
                "2026-03-02",
                "2026-03-03",
                "2026-03-04",
                "2026-03-09",
                "2026-03-10",
            ]);
            const slotById = new Map(slots.map((s) => [s.id, s]));
            const weekOf = (date) => (date < "2026-03-09" ? "w1" : "w2");

            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 3,
            });
            assert.equal(result.success, true);

            const counts = new Map();
            for (const match of result.schedule) {
                const week = weekOf(slotById.get(match.timeSlotId).slotDate);
                for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                    const key = `${teamId}|${week}`;
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            }
            for (const [key, count] of counts) {
                assert.ok(count <= 3, `${key} has ${count} matches`);
            }
        });

        it("fails fast when the season has too few weeks", () => {
            // 18 slots for 15 matches, so only the week count is the problem
            const slots = buildSlots({ "17:00": 3, "18:00": 3, "19:00": 3 }, [
                "2026-03-02",
                "2026-03-09",
            ]);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, "not-enough-weeks");
            assert.equal(result.weekCount, 2);
            assert.equal(result.requiredWeeks, 5);
            assert.deepEqual(result.schedule, []);
        });

        it("counts weeks Monday to Sunday", () => {
            const run = (dates) =>
                generateSchedule({
                    teamIds: [1, 2, 3],
                    timeSlots: buildSlots({ "17:00": 2 }, dates),
                    teamPreferences: new Map(),
                    maxMatchesPerTeamPerWeek: 1,
                });

            // Monday and Friday: same week
            const sameWeek = run(["2026-03-02", "2026-03-06"]);
            assert.equal(sameWeek.reason, "not-enough-weeks");
            assert.equal(sameWeek.weekCount, 1);

            // Sunday and the next Monday: two weeks (3 teams need 3 rounds, so still too few)
            const twoWeeks = run(["2026-03-08", "2026-03-09"]);
            assert.equal(twoWeeks.reason, "not-enough-weeks");
            assert.equal(twoWeeks.weekCount, 2);
        });

        it("ignores the cap for slots without a date", () => {
            const weekly = [0, 1, 2].map((dayOfWeek) => ({
                id: dayOfWeek + 1,
                pitchId: 1,
                slotDate: null,
                dayOfWeek,
                startTime: "17:00",
                endTime: "",
            }));
            const result = generateSchedule({
                teamIds: [1, 2, 3],
                timeSlots: weekly,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });
            assert.equal(result.success, true);
        });
    });

    describe("search step limit", () => {
        it("gives up with search-limit-reached when the limit is too low", () => {
            // Scenario A needs at least 6 placements
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: buildSlots(SCENARIO_A_LAYOUT),
                teamPreferences: new Map(),
                maxSearchSteps: 3,
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, "search-limit-reached");
            assert.equal(result.searchSteps, 3);
            assert.deepEqual(result.schedule, []);
            assert.equal(result.totalSides, 0);
        });

        it("stops an infeasible search that would otherwise run for a very long time", () => {
            // 8 teams each need 7 distinct times, but only 6 exist. Passes the
            // slot-count check, so plain backtracking would explore a huge tree.
            const slots = buildSlots({
                "17:00": 5,
                "18:00": 5,
                "19:00": 5,
                "20:00": 5,
                "21:00": 5,
                "22:00": 5,
            });
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4, 5, 6, 7, 8],
                timeSlots: slots,
                teamPreferences: new Map(),
                maxSearchSteps: 5_000,
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, "search-limit-reached");
            assert.equal(result.searchSteps, 5_000);
        });

        it("reports the steps used on success, within the limit", () => {
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: buildSlots(SCENARIO_A_LAYOUT),
                teamPreferences: new Map(),
            });
            assert.equal(result.success, true);
            assert.ok(result.searchSteps >= result.matchCount);
            assert.ok(result.searchSteps <= DEFAULT_MAX_SEARCH_STEPS);
        });
    });

    describe("rounds into weeks (circle method)", () => {
        const fiveMondays = ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"];

        function addDays(date, days) {
            const d = new Date(`${date}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + days);
            return d.toISOString().slice(0, 10);
        }

        // Week (its Monday) of each scheduled match; the tests use Monday-based dates
        function mondayOf(date) {
            const d = new Date(`${date}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
            return d.toISOString().slice(0, 10);
        }

        function weeksOfRounds(schedule, slots) {
            const slotById = new Map(slots.map((s) => [s.id, s]));
            const weeks = new Map(); // Map<roundNumber, Set<week>>
            for (const match of schedule) {
                const week = mondayOf(slotById.get(match.timeSlotId).slotDate);
                if (!weeks.has(match.roundNumber)) weeks.set(match.roundNumber, new Set());
                weeks.get(match.roundNumber).add(week);
            }
            return weeks;
        }

        it("Matt's bug: 6 teams in exactly 5 weeks with many free slots on 2 pitches", () => {
            // Monday and Wednesday, 2 times, 2 pitches: 40 slots for 15 matches.
            // The old pair-by-pair search hit the 20,000-step limit on this input.
            const teamIds = [1, 2, 3, 4, 5, 6];
            const slots = buildSlots(
                { "17:00": 2, "18:00": 2 },
                fiveMondays.flatMap((monday) => [monday, addDays(monday, 2)]),
            );
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });

            assert.equal(result.success, true);
            assert.ok(result.searchSteps < 100, `${result.searchSteps} steps`);
            assert.deepEqual(
                validateSchedule(result.schedule, slots, {
                    teamIds,
                    maxMatchesPerTeamPerWeek: 1,
                }),
                { isValid: true, conflicts: [] },
            );
        });

        it("5 teams need 5 weeks (5 rounds with a bye): 5 succeed, 4 are too few", () => {
            const run = (dates) =>
                generateSchedule({
                    teamIds: [1, 2, 3, 4, 5],
                    timeSlots: buildSlots({ "17:00": 2, "18:00": 1 }, dates),
                    teamPreferences: new Map(),
                    maxMatchesPerTeamPerWeek: 1,
                });

            const fiveWeeks = run(fiveMondays);
            assert.equal(fiveWeeks.success, true);
            assertRoundRobinComplete(fiveWeeks.schedule, [1, 2, 3, 4, 5]);

            // 12 slots for 10 matches, so only the week count is the problem
            const fourWeeks = run(fiveMondays.slice(0, 4));
            assert.equal(fourWeeks.success, false);
            assert.equal(fourWeeks.reason, "not-enough-weeks");
            assert.equal(fourWeeks.weekCount, 4);
            assert.equal(fourWeeks.requiredWeeks, 5);
        });

        it("a slot preferred by one team and unavailable for the other loses to a neutral slot", () => {
            // Slot 1 = 17:00 (team 1 preferred, team 2 unavailable), slot 2 = 18:00 (neutral).
            // The old score (+100 - 50 = +50 > 0) picked slot 1.
            const slots = buildSlots({ "17:00": 1, "18:00": 1 });
            const teamPreferences = new Map([
                [1, new Map([[1, "preferred"]])],
                [2, new Map([[1, "unavailable"]])],
            ]);
            const result = generateSchedule({
                teamIds: [1, 2],
                timeSlots: slots,
                teamPreferences,
            });

            assert.equal(result.success, true);
            assert.equal(result.schedule[0].timeSlotId, 2);
            assert.equal(result.preferredSides, 0);
            assert.equal(result.unavailableSides, 0);
        });

        it("still uses an unavailable slot when it is the only one (soft rule)", () => {
            const slots = buildSlots({ "17:00": 1 });
            const result = generateSchedule({
                teamIds: [1, 2],
                timeSlots: slots,
                teamPreferences: new Map([[2, new Map([[1, "unavailable"]])]]),
            });

            assert.equal(result.success, true);
            assert.equal(result.schedule[0].timeSlotId, 1);
            assert.equal(result.unavailableSides, 1);
            assert.equal(result.totalSides, 2);
        });

        it("cap 2: a week holds 2 rounds", () => {
            // 4 teams = 3 rounds; one evening per week with 2 times x 2 pitches
            const teamIds = [1, 2, 3, 4];
            const slots = buildSlots({ "17:00": 2, "18:00": 2 }, fiveMondays.slice(0, 2));
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 2,
            });

            assert.equal(result.success, true);
            const weeks = weeksOfRounds(result.schedule, slots);
            assert.deepEqual([...weeks.get(1)], ["2026-03-02"]);
            assert.deepEqual([...weeks.get(2)], ["2026-03-02"]);
            assert.deepEqual([...weeks.get(3)], ["2026-03-09"]);
            assert.equal(
                validateSchedule(result.schedule, slots, {
                    teamIds,
                    maxMatchesPerTeamPerWeek: 2,
                }).isValid,
                true,
            );
        });

        it("cap 2: one week is too few for 3 rounds", () => {
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: buildSlots({ "17:00": 2, "18:00": 2, "19:00": 2 }),
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 2,
            });
            assert.equal(result.reason, "not-enough-weeks");
            assert.equal(result.requiredWeeks, 2);
        });

        it("roundNumber is the circle-method round, one week per round, non-decreasing by week", () => {
            // 7 teams = 7 rounds of 3 matches; 8 weeks, so one week is left over
            const teamIds = [1, 2, 3, 4, 5, 6, 7];
            const mondays = Array.from({ length: 8 }, (_, i) => addDays("2026-03-02", 7 * i));
            const slots = buildSlots({ "17:00": 2, "18:00": 2 }, mondays);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });
            assert.equal(result.success, true);

            // Each round is the matching buildRounds round
            const rounds = buildRounds(teamIds);
            for (let r = 0; r < rounds.length; r++) {
                const scheduled = result.schedule
                    .filter((m) => m.roundNumber === r + 1)
                    .map((m) => pairKey(m.homeTeamId, m.awayTeamId))
                    .sort();
                const expected = rounds[r].map(([a, b]) => pairKey(a, b)).sort();
                assert.deepEqual(scheduled, expected, `round ${r + 1}`);
            }

            // Every round in one week, and later rounds never in earlier weeks
            const weeks = weeksOfRounds(result.schedule, slots);
            let previousWeek = "";
            for (let round = 1; round <= rounds.length; round++) {
                assert.equal(weeks.get(round).size, 1, `round ${round} spans weeks`);
                const [week] = weeks.get(round);
                assert.ok(week >= previousWeek, `round ${round} before round ${round - 1}`);
                previousWeek = week;
            }
        });

        it("gives a roundNumber without weeks too (undated slots)", () => {
            const weekly = [0, 1, 2].map((dayOfWeek) => ({
                id: dayOfWeek + 1,
                pitchId: 1,
                slotDate: null,
                dayOfWeek,
                startTime: "17:00",
                endTime: "",
            }));
            const result = generateSchedule({
                teamIds: [1, 2, 3],
                timeSlots: weekly,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });
            assert.equal(result.success, true);
            assert.deepEqual(
                result.schedule.map((m) => m.roundNumber).sort(),
                [1, 2, 3],
            );
        });

        it("mixed dated and undated slots: no weeks, but the cap still holds on dated slots", () => {
            // Two dated slots in one week, two undated: with cap 1 only one
            // match fits in the dated week (3 teams), the other two go undated
            const slots = [
                { id: 1, pitchId: 1, slotDate: "2026-03-02", dayOfWeek: 0, startTime: "17:00", endTime: "" },
                { id: 2, pitchId: 1, slotDate: "2026-03-02", dayOfWeek: 0, startTime: "18:00", endTime: "" },
                { id: 3, pitchId: 1, slotDate: null, dayOfWeek: 1, startTime: "17:00", endTime: "" },
                { id: 4, pitchId: 1, slotDate: null, dayOfWeek: 2, startTime: "17:00", endTime: "" },
            ];
            const result = generateSchedule({
                teamIds: [1, 2, 3],
                timeSlots: slots,
                teamPreferences: new Map(),
                maxMatchesPerTeamPerWeek: 1,
            });

            assert.equal(result.success, true);
            assert.equal(
                result.schedule.filter((m) => m.timeSlotId <= 2).length,
                1,
            );
            assert.equal(
                validateSchedule(result.schedule, slots, {
                    teamIds: [1, 2, 3],
                    maxMatchesPerTeamPerWeek: 1,
                }).isValid,
                true,
            );
        });
    });
});

describe("validateSchedule", () => {
    const slots = buildSlots({ "17:00": 2, "18:00": 1 }, ["2026-03-02", "2026-03-03"]);
    // ids: 1,2 = 03-02 17:00 P1/P2; 3 = 03-02 18:00; 4,5 = 03-03 17:00 P1/P2; 6 = 03-03 18:00

    it("accepts an empty schedule", () => {
        assert.deepEqual(validateSchedule([], slots), { isValid: true, conflicts: [] });
    });

    it("accepts the same team at the same clock time on different dates", () => {
        const schedule = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 1, awayTeamId: 3, timeSlotId: 4, pitchId: 1 },
        ];
        assert.equal(validateSchedule(schedule, slots).isValid, true);
    });

    it("detects a team playing two matches at the same time", () => {
        const schedule = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 3, awayTeamId: 1, timeSlotId: 2, pitchId: 2 },
        ];
        const result = validateSchedule(schedule, slots);
        assert.equal(result.isValid, false);
        assert.equal(result.conflicts.length, 1);
        assert.match(result.conflicts[0], /Team 1/);
    });

    it("detects a pitch used twice at the same time", () => {
        const schedule = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 3, awayTeamId: 4, timeSlotId: 1, pitchId: 1 },
        ];
        const result = validateSchedule(schedule, slots);
        assert.equal(result.isValid, false);
        assert.deepEqual(
            result.conflicts.filter((c) => c.startsWith("Pitch 1")).length,
            1,
        );
    });

    it("works with weekday-only slots (no slotDate)", () => {
        const weekly = [
            { id: 1, pitchId: 1, slotDate: null, dayOfWeek: 0, startTime: "17:00", endTime: "" },
            { id: 2, pitchId: 2, slotDate: null, dayOfWeek: 0, startTime: "17:00", endTime: "" },
            { id: 3, pitchId: 1, slotDate: null, dayOfWeek: 1, startTime: "17:00", endTime: "" },
        ];
        const clash = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 1, awayTeamId: 3, timeSlotId: 2, pitchId: 2 },
        ];
        const ok = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 1, awayTeamId: 3, timeSlotId: 3, pitchId: 1 },
        ];
        assert.equal(validateSchedule(clash, weekly).isValid, false);
        assert.equal(validateSchedule(ok, weekly).isValid, true);
    });

    describe("weekly cap", () => {
        // Team 1 plays on Monday 03-02 and Tuesday 03-03: same week
        const twoInOneWeek = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 1, awayTeamId: 3, timeSlotId: 4, pitchId: 1 },
        ];

        it("detects a team over the cap in one week", () => {
            const result = validateSchedule(twoInOneWeek, slots, {
                maxMatchesPerTeamPerWeek: 1,
            });
            assert.equal(result.isValid, false);
            assert.equal(result.conflicts.length, 1);
            assert.match(result.conflicts[0], /Team 1 has 2 matches in the week of 2026-03-02/);
        });

        it("accepts the same matches when the cap allows them", () => {
            assert.equal(
                validateSchedule(twoInOneWeek, slots, { maxMatchesPerTeamPerWeek: 2 })
                    .isValid,
                true,
            );
        });

        it("has no cap by default", () => {
            assert.equal(validateSchedule(twoInOneWeek, slots).isValid, true);
        });

        it("counts weeks Monday to Sunday", () => {
            const sundayMonday = buildSlots({ "17:00": 1 }, ["2026-03-08", "2026-03-09"]);
            const schedule = [
                { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
                { homeTeamId: 1, awayTeamId: 3, timeSlotId: 2, pitchId: 1 },
            ];
            assert.equal(
                validateSchedule(schedule, sundayMonday, { maxMatchesPerTeamPerWeek: 1 })
                    .isValid,
                true,
            );
        });

        it("ignores slots without a date", () => {
            const weekly = [0, 1].map((dayOfWeek) => ({
                id: dayOfWeek + 1,
                pitchId: 1,
                slotDate: null,
                dayOfWeek,
                startTime: "17:00",
                endTime: "",
            }));
            const schedule = [
                { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
                { homeTeamId: 1, awayTeamId: 3, timeSlotId: 2, pitchId: 1 },
            ];
            assert.equal(
                validateSchedule(schedule, weekly, { maxMatchesPerTeamPerWeek: 1 })
                    .isValid,
                true,
            );
        });
    });

    describe("every pair exactly once", () => {
        const teamIds = [1, 2, 3];
        // 3 teams, 3 separate times
        const complete = [
            { homeTeamId: 1, awayTeamId: 2, timeSlotId: 1, pitchId: 1 },
            { homeTeamId: 1, awayTeamId: 3, timeSlotId: 3, pitchId: 1 },
            { homeTeamId: 2, awayTeamId: 3, timeSlotId: 4, pitchId: 1 },
        ];

        it("accepts a complete round robin", () => {
            assert.deepEqual(validateSchedule(complete, slots, { teamIds }), {
                isValid: true,
                conflicts: [],
            });
        });

        it("accepts a pair in either home/away order", () => {
            const swapped = [
                complete[0],
                { ...complete[1], homeTeamId: 3, awayTeamId: 1 },
                complete[2],
            ];
            assert.equal(validateSchedule(swapped, slots, { teamIds }).isValid, true);
        });

        it("detects a missing pair", () => {
            const result = validateSchedule(complete.slice(0, 2), slots, { teamIds });
            assert.equal(result.isValid, false);
            assert.deepEqual(result.conflicts, [
                "Expected 3 matches, found 2",
                "Pair 2-3 is not scheduled",
            ]);
        });

        it("detects a pair scheduled twice (home/away swapped)", () => {
            const twice = [
                ...complete,
                { homeTeamId: 2, awayTeamId: 1, timeSlotId: 6, pitchId: 1 },
            ];
            const result = validateSchedule(twice, slots, { teamIds });
            assert.equal(result.isValid, false);
            assert.deepEqual(result.conflicts, [
                "Expected 3 matches, found 4",
                "Pair 1-2 is scheduled 2 times",
            ]);
        });

        it("detects a match with a team outside the league", () => {
            const outsider = [
                complete[0],
                complete[1],
                { homeTeamId: 2, awayTeamId: 9, timeSlotId: 4, pitchId: 1 },
            ];
            const result = validateSchedule(outsider, slots, { teamIds });
            assert.equal(result.isValid, false);
            assert.deepEqual(result.conflicts, [
                "Match 2-9 is not a pair of the league's teams",
                "Pair 2-3 is not scheduled",
            ]);
        });

        it("is skipped without teamIds (e.g. two leagues checked together)", () => {
            assert.equal(validateSchedule(complete.slice(0, 2), slots).isValid, true);
        });
    });

    it("accepts every schedule generateSchedule returns, with both new checks on", () => {
        const teamIds = [1, 2, 3, 4, 5, 6];
        const timeSlots = buildSlots({ "17:00": 3 }, [
            "2026-03-02",
            "2026-03-09",
            "2026-03-16",
            "2026-03-23",
            "2026-03-30",
        ]);
        const result = generateSchedule({
            teamIds,
            timeSlots,
            teamPreferences: new Map(),
            maxMatchesPerTeamPerWeek: 1,
        });
        assert.equal(result.success, true);
        assert.deepEqual(
            validateSchedule(result.schedule, timeSlots, {
                teamIds,
                maxMatchesPerTeamPerWeek: 1,
            }),
            { isValid: true, conflicts: [] },
        );
    });
});
