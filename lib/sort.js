// Sorting names in Hungarian alphabetical order. SQLite's ORDER BY (even with
// COLLATE NOCASE) only knows ASCII, so names starting with an accented capital
// ("Építész…") end up after "Z"; better-sqlite3 can't register a custom collation,
// so lists of names are sorted in JS instead.

const collator = new Intl.Collator("hu");

/**
 * Compare two names in Hungarian alphabetical order (á after a, cs after c, ö after o).
 * Missing names sort first.
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {number}
 */
export function compareHu(a, b) {
    return collator.compare(a ?? "", b ?? "");
}

/**
 * Sort rows by their `name` in Hungarian order, in place.
 * @template {{name: string}} T
 * @param {T[]} rows
 * @returns {T[]} The same array
 */
export function sortByName(rows) {
    return rows.sort((a, b) => compareHu(a.name, b.name));
}
