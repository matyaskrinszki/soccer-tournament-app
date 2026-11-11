import { getDatabase } from "../../../../../lib/database";
import { jsonError, serverError } from "../../../../../lib/api";
import { buildTeamCalendar } from "../../../../../lib/calendar";

/**
 * The team's published matches as an iCalendar file, for Google Calendar and other
 * calendar apps. Public, like the team page's fixture list.
 * GET -> text/calendar (.ics download)
 */
export async function GET(request, context) {
    const { id } = await context.params;
    const teamId = Number(id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
        return jsonError(400, "Érvénytelen csapat azonosító");
    }

    try {
        const result = buildTeamCalendar(getDatabase(), teamId);
        if (!result.ok) {
            return jsonError(result.status, result.error);
        }
        return new Response(result.ics, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Content-Disposition": `attachment; filename="${result.filename}"`,
                // Fixtures and results change, so don't serve a stale copy
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        return serverError(err);
    }
}
