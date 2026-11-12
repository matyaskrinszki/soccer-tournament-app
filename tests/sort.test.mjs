// Tests for lib/sort.js (Hungarian name order).
// Run: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareHu, sortByName } from "../lib/sort.js";

describe("compareHu", () => {
    it("puts names with an accented capital in their Hungarian place, not after Z", () => {
        const names = ["Zeta", "Építész Tervezők", "Alfa", "Ödön", "Oszkár", "Ábel"];
        assert.deepEqual(names.sort(compareHu), [
            "Ábel",
            "Alfa",
            "Építész Tervezők",
            "Oszkár",
            "Ödön",
            "Zeta",
        ]);
    });

    it("sorts the double letters after the single one (cs after c)", () => {
        assert.deepEqual(["Csapat", "Cukor", "Dénes"].sort(compareHu), ["Cukor", "Csapat", "Dénes"]);
    });

    it("keeps the league order Liga I … Liga IV", () => {
        assert.deepEqual(
            ["Liga IV", "Liga II", "Liga I", "Liga III"].sort(compareHu),
            ["Liga I", "Liga II", "Liga III", "Liga IV"],
        );
    });

    it("ignores case and sorts missing names first", () => {
        assert.ok(compareHu("alfa", "Bravo") < 0);
        assert.ok(compareHu(null, "Alfa") < 0);
        assert.equal(compareHu(undefined, null), 0);
    });
});

describe("sortByName", () => {
    it("sorts rows by name in place and returns the same array", () => {
        const rows = [{ id: 1, name: "Zeta" }, { id: 2, name: "Építész" }, { id: 3, name: "Alfa" }];
        const sorted = sortByName(rows);
        assert.equal(sorted, rows);
        assert.deepEqual(rows.map((row) => row.id), [3, 2, 1]);
    });
});
