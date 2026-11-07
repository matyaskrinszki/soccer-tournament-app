import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/database";
import { jsonError } from "../../../../lib/api";
import { listDisplaySeasons } from "../../../../lib/seasons";
import { getSeasonStandings } from "../../../../lib/standings";

const MATCHES_QUERY = `SELECT
        m.id,
        m.match_date as matchDate,
        m.status,
        m.home_team_id as homeTeamId,
        m.away_team_id as awayTeamId,
        m.home_score as homeScore,
        m.away_score as awayScore,
        ht.name as homeName,
        at.name as awayName,
        l.name as leagueName,
        l.country as leagueCountry
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    JOIN leagues l ON l.id = m.league_id`;

export async function GET(request, context) {
    const { id } = await context.params;

    if (!id) {
        return jsonError(400, "A csapat azonosító hiányzik");
    }

    let failMessage = "Hiba történt a csapat lekérdezésekor";
    try {
        const db = getDatabase();

        const row = db
            .prepare(
                `SELECT
                    t.id,
                    t.name,
                    t.captain_player_id as captainPlayerId,
                    l.id as leagueId,
                    l.name as leagueName,
                    l.country as leagueCountry
                 FROM teams t
                 JOIN leagues l ON l.id = t.league_id
                 WHERE t.id = ?`,
            )
            .get(id);

        if (!row) {
            return jsonError(404, "A csapat nem található");
        }

        // The team's table row in the most relevant season it has matches in
        // (same order as the public pages' default, see lib/seasons.js)
        failMessage = "Hiba történt a tabella számításakor";
        const [season = null] = listDisplaySeasons(db, { teamId: row.id });
        const standing = season
            ? getSeasonStandings(db, season.id)
                  .flatMap((league) => league.teams)
                  .find((team) => team.id === row.id)
            : null;

        // Upcoming fixtures of the season being played; unplayed fixtures of
        // other seasons are not "upcoming"
        failMessage = "Hiba történt a mérkőzések lekérdezésekor";
        const upcomingMatches = db
            .prepare(
                `${MATCHES_QUERY}
                WHERE m.status = 'upcoming' AND (m.home_team_id = ? OR m.away_team_id = ?)
                  AND m.season_id = (SELECT id FROM seasons WHERE status = 'active')
                ORDER BY m.match_date ASC
                LIMIT 10`,
            )
            .all(id, id);

        // Fetch finished matches
        failMessage = "Hiba történt az eredmények lekérdezésekor";
        const previousMatches = db
            .prepare(
                `${MATCHES_QUERY}
                WHERE m.status = 'finished' AND (m.home_team_id = ? OR m.away_team_id = ?)
                ORDER BY m.match_date DESC
                LIMIT 10`,
            )
            .all(id, id);

        return NextResponse.json(
            {
                team: {
                    id: row.id,
                    name: row.name,
                    captainPlayerId: row.captainPlayerId,
                    league: {
                        id: row.leagueId,
                        name: row.leagueName,
                        country: row.leagueCountry,
                    },
                },
                season,
                standing: standing ?? null,
                upcomingMatches,
                previousMatches,
            },
            { status: 200 },
        );
    } catch (err) {
        console.error(err);
        return jsonError(500, failMessage);
    }
}
