// Client-side authentication utilities

/**
 * Get authorization headers with Bearer token
 * @returns {Object} Headers object with Authorization header
 */
export function getAuthHeaders() {
    const token = localStorage.getItem("token");
    if (!token) {
        return {};
    }
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}

/**
 * Get current user's role from localStorage
 * @returns {string|null} User role or null
 */
export function getUserRole() {
    return localStorage.getItem("role");
}

/**
 * Get current user's playerId from localStorage
 * @returns {number|null} Player ID or null
 */
export function getPlayerId() {
    const id = localStorage.getItem("playerId");
    return id ? parseInt(id) : null;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if user has a token
 */
export function isAuthenticated() {
    return Boolean(localStorage.getItem("token"));
}

/**
 * Check if user has a specific role
 * @param {string} role - Role to check
 * @returns {boolean} True if user has the role
 */
export function hasRole(role) {
    return getUserRole() === role;
}

/**
 * Check if user is admin
 * @returns {boolean} True if user is admin
 */
export function isAdmin() {
    return hasRole("Admin");
}

/**
 * Check if user is captain
 * @returns {boolean} True if user is captain
 */
export function isCaptain() {
    return hasRole("Captain");
}

/**
 * Check if user is captain or admin
 * @returns {boolean} True if user is captain or admin
 */
export function isCaptainOrAdmin() {
    const role = getUserRole();
    return role === "Captain" || role === "Admin";
}
