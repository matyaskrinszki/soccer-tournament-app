import { getAuthHeaders } from '../../lib/client-auth';

/**
 * Call an admin API route with the auth headers and parse the JSON response.
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.method]
 * @param {Object} [options.body] - Sent as JSON
 * @param {string} [options.errorMessage] - Used when the response has no `error`
 * @returns {Promise<Object>} The response body
 * @throws {Error} With the server's error message if the response is not ok
 */
export async function adminFetch(url, { method = 'GET', body, errorMessage = 'Hiba történt' } = {}) {
    const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || errorMessage);
    }
    return data;
}
