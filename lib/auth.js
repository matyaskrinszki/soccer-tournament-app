import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getDb } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "mysupersecretkey";

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token
 * @returns {object|null} Decoded token or null if invalid
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

/**
 * Get user from token in request headers
 * @param {Request} request - Next.js request object
 * @returns {object|null} User data from token or null
 */
export function getUserFromRequest(request) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.substring(7);
    return verifyToken(token);
}

/**
 * Check if user has required role
 * @param {string} userRole - User's role
 * @param {string|string[]} requiredRoles - Required role(s)
 * @returns {boolean} True if user has required role
 */
export function hasRole(userRole, requiredRoles) {
    if (Array.isArray(requiredRoles)) {
        return requiredRoles.includes(userRole);
    }
    return userRole === requiredRoles;
}

/**
 * Check if user is admin
 * @param {string} userRole - User's role
 * @returns {boolean} True if user is admin
 */
export function isAdmin(userRole) {
    return userRole === "Admin";
}

/**
 * Check if user is captain
 * @param {string} userRole - User's role
 * @returns {boolean} True if user is captain
 */
export function isCaptain(userRole) {
    return userRole === "Captain";
}

/**
 * Check if user is captain or admin
 * @param {string} userRole - User's role
 * @returns {boolean} True if user is captain or admin
 */
export function isCaptainOrAdmin(userRole) {
    return userRole === "Captain" || userRole === "Admin";
}

/**
 * Middleware to require authentication - checks database for current role
 * @param {Request} request - Next.js request object
 * @returns {Promise<object|NextResponse>} User data or error response
 */
export async function requireAuth(request) {
    const user = getUserFromRequest(request);
    if (!user) {
        return NextResponse.json(
            { error: "Hitelesítés szükséges" },
            { status: 401 },
        );
    }

    // Fetch current role from database (in case it changed after JWT was issued)
    const currentPlayer = await getPlayerById(user.playerId);
    if (!currentPlayer) {
        return NextResponse.json(
            { error: "Játékos nem található" },
            { status: 401 },
        );
    }

    // Update user object with current role from database
    user.role = currentPlayer.role;

    return user;
}

/**
 * Middleware to require specific role(s) - checks database for current role
 * @param {Request} request - Next.js request object
 * @param {string|string[]} requiredRoles - Required role(s)
 * @returns {Promise<object|NextResponse>} User data or error response
 */
export async function requireRole(request, requiredRoles) {
    const user = getUserFromRequest(request);
    if (!user) {
        return NextResponse.json(
            { error: "Hitelesítés szükséges" },
            { status: 401 },
        );
    }

    // Fetch current role from database (in case it changed after JWT was issued)
    const currentPlayer = await getPlayerById(user.playerId);
    if (!currentPlayer) {
        return NextResponse.json(
            { error: "Játékos nem található" },
            { status: 401 },
        );
    }

    // Update user object with current role from database
    user.role = currentPlayer.role;

    if (!hasRole(user.role, requiredRoles)) {
        return NextResponse.json(
            { error: "Nincs jogosultságod ehhez a művelethez" },
            { status: 403 },
        );
    }

    return user;
}

/**
 * Middleware to require admin role
 * @param {Request} request - Next.js request object
 * @returns {object|NextResponse} User data or error response
 */
export function requireAdmin(request) {
    return requireRole(request, "Admin");
}

/**
 * Middleware to require captain or admin role
 * @param {Request} request - Next.js request object
 * @returns {object|NextResponse} User data or error response
 */
export function requireCaptainOrAdmin(request) {
    return requireRole(request, ["Captain", "Admin"]);
}

/**
 * Get player data from database by ID (with role)
 * @param {number} playerId - Player ID
 * @returns {Promise<object|null>} Player data or null
 */
export function getPlayerById(playerId) {
    return new Promise((resolve) => {
        const db = getDb();
        db.get(
            "SELECT id, email, name, team_id, role FROM players WHERE id = ?",
            [playerId],
            (err, row) => {
                db.close();
                if (err || !row) {
                    resolve(null);
                    return;
                }
                resolve(row);
            },
        );
    });
}

/**
 * Verify user owns the resource (player profile) or is admin
 * @param {object} user - User from token
 * @param {number} resourcePlayerId - Player ID of the resource
 * @returns {boolean} True if user can access resource
 */
export function canAccessPlayerResource(user, resourcePlayerId) {
    if (user == null) {
        return false;
    }
    return user.playerId === resourcePlayerId || user.role === "Admin";
}

/**
 * Verify user is captain of the specified team or is admin
 * @param {object} user - User from token
 * @param {number} teamId - Team ID
 * @returns {Promise<boolean>} True if user is captain of team or admin
 */
export async function isCaptainOfTeam(user, teamId) {
    if (user.role === "Admin") {
        return true;
    }

    if (user.role !== "Captain") {
        return false;
    }

    return new Promise((resolve) => {
        const db = getDb();
        db.get(
            "SELECT id FROM teams WHERE id = ? AND captain_player_id = ?",
            [teamId, user.playerId],
            (err, row) => {
                db.close();
                if (err || !row) {
                    resolve(false);
                    return;
                }
                resolve(true);
            },
        );
    });
}
