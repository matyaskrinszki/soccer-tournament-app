import { NextResponse } from "next/server";

/**
 * Build a JSON error response
 * @param {number} status - HTTP status code
 * @param {string} message - Error message shown to the client
 * @returns {NextResponse}
 */
export function jsonError(status, message) {
    return NextResponse.json({ error: message }, { status });
}

/**
 * Log an unexpected error and return a generic 500 response
 * @param {Error} err - The caught error
 * @returns {NextResponse}
 */
export function serverError(err) {
    console.error(err);
    if (typeof err?.code === "string" && err.code.startsWith("SQLITE_")) {
        return jsonError(500, "Adatbázis hiba történt");
    }
    return jsonError(500, "Szerverhiba történt");
}

/**
 * Check whether an error is a SQLite foreign-key violation,
 * e.g. deleting a row that other rows still reference
 * @param {Error} err - The caught error
 * @returns {boolean}
 */
export function isForeignKeyError(err) {
    return err?.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
