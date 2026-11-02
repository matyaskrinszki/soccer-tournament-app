import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request) {
    return new Promise((resolve) => {
        const db = getDb();
        db.all(
            `SELECT 
                m.id,
                m.league_id as leagueId,
                m.home_team_id as homeTeamId,
                m.away_team_id as awayTeamId,
                m.home_score as homeScore,
                m.away_score as awayScore,
                m.match_date as matchDate,
                m.status,
                ht.name as homeTeamName,
                at.name as awayTeamName,
                l.name as leagueName
             FROM matches m
             LEFT JOIN teams ht ON ht.id = m.home_team_id
             LEFT JOIN teams at ON at.id = m.away_team_id
             LEFT JOIN leagues l ON l.id = m.league_id
             ORDER BY m.match_date DESC`,
            [],
            (err, rows) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            {
                                error: "Hiba történt a mérkőzések lekérdezésekor",
                            },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                db.close();
                resolve(NextResponse.json({ matches: rows || [] }));
            },
        );
    });
}
