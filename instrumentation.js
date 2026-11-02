// Next.js calls register() once when the server starts, before it handles requests.
// https://nextjs.org/docs/app/guides/instrumentation
export async function register() {
    // sqlite3 is a native Node module; skip the Edge runtime.
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { initializeDb } = await import("./lib/db");
        await initializeDb();
    }
}
