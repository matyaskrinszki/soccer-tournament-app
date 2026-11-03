// Tests for lib/scheduler.js. Scenarios mirror scripts/scheduler-playground.mjs.
// Run: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSchedule, validateSchedule } from "../lib/scheduler.js";

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
            assert.equal(result.satisfactionScore, 0);
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

    describe("satisfaction score", () => {
        const teamIds = [1, 2, 3, 4];

        it("is 100 when every slot is preferred by every team", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: uniformPreferences(teamIds, slots, "preferred"),
            });
            assert.equal(result.success, true);
            assert.equal(result.satisfactionScore, 100);
        });

        it("is 0 when every slot is unavailable for every team", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: uniformPreferences(teamIds, slots, "unavailable"),
            });
            // Current behaviour: "unavailable" is only a penalty, so this still succeeds
            assert.equal(result.success, true);
            assert.equal(result.satisfactionScore, 0);
        });

        it("is 33 with no preferences (neutral sits at 50/150 of the -50..100 range)", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const result = generateSchedule({
                teamIds,
                timeSlots: slots,
                teamPreferences: new Map(),
            });
            assert.equal(result.satisfactionScore, 33);
        });

        it("stays an integer within 0..100 for mixed preferences", () => {
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
            assert.ok(Number.isInteger(result.satisfactionScore));
            assert.ok(result.satisfactionScore >= 0 && result.satisfactionScore <= 100);
        });

        it("scenario B: preferences raise the score above the no-preference baseline", () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const teamPreferences = new Map([
                [3, new Map([[3, "preferred"]])], // slot 3 = 18:00
                [4, new Map([[1, "unavailable"], [2, "unavailable"]])], // 17:00
            ]);
            const result = generateSchedule({ teamIds, timeSlots: slots, teamPreferences });

            assert.equal(result.success, true);
            assert.ok(result.satisfactionScore > 33);
        });
    });

    // Known gap, fixed in step 6 ("unavailable" as a hard rule). Marked todo so it
    // reports without failing the run; remove { todo } once the fix lands.
    it(
        "scenario B: never schedules a team in a slot it marked unavailable",
        { todo: "unavailable is only a -50 penalty today" },
        () => {
            const slots = buildSlots(SCENARIO_A_LAYOUT);
            const teamPreferences = new Map([
                [4, new Map([[1, "unavailable"], [2, "unavailable"]])],
            ]);
            const result = generateSchedule({
                teamIds: [1, 2, 3, 4],
                timeSlots: slots,
                teamPreferences,
            });

            for (const match of result.schedule) {
                if (match.homeTeamId === 4 || match.awayTeamId === 4) {
                    assert.ok(![1, 2].includes(match.timeSlotId));
                }
            }
        },
    );
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
});
