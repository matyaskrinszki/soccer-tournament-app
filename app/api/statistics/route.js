import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request) {
    return new Promise((resolve) => {
        const db = getDb();

        // Get top scorers globally
        db.all(
            `SELECT p.id, p.name, COUNT(*) as goals
             FROM goals g
             JOIN players p ON p.id = g.player_id
             GROUP BY p.id, p.name
             ORDER BY goals DESC
             LIMIT 10`,
            [],
            (err, topScorers) => {
                if (err) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Adatbázis hiba történt" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                // // Get top scorers per league
                db.all(
                    `SELECT l.id as leagueId, l.name as leagueName, p.id, p.name, COUNT(*) as goals
                     FROM goals g
                     JOIN players p ON p.id = g.player_id
                     JOIN matches m ON m.id = g.match_id
                     JOIN leagues l ON l.id = m.league_id
                     GROUP BY l.id, l.name, p.id, p.name
                     ORDER BY l.id, goals DESC`,
                    [],
                    (err2, scorersByLeague) => {
                        if (err2) {
                            db.close();
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "Adatbázis hiba történt",
                                    },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        // Get match statistics
                        db.all(
                            `SELECT 
                                COUNT(*) as totalMatches,
                                SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finishedMatches,
                                SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) as upcomingMatches,
                                ROUND(AVG(CASE WHEN status = 'finished' THEN home_score + away_score ELSE NULL END), 2) as avgGoalsPerMatch,
                                MAX(home_score + away_score) as maxGoalsInMatch
                             FROM matches`,
                            [],
                            (err3, matchStats) => {
                                if (err3) {
                                    db.close();
                                    resolve(
                                        NextResponse.json(
                                            {
                                                error: "Adatbázis hiba történt",
                                            },
                                            { status: 500 },
                                        ),
                                    );
                                    return;
                                }

                                // Get highest scoring matches
                                db.all(
                                    `SELECT 
                                        m.id,
                                        ht.name as homeName,
                                        at.name as awayName,
                                        m.home_score as homeScore,
                                        m.away_score as awayScore,
                                        m.home_score + m.away_score as totalGoals,
                                        l.name as leagueName
                                     FROM matches m
                                     JOIN teams ht ON ht.id = m.home_team_id
                                     JOIN teams at ON at.id = m.away_team_id
                                     JOIN leagues l ON l.id = m.league_id
                                     WHERE m.status = 'finished'
                                     ORDER BY totalGoals DESC
                                     LIMIT 10`,
                                    [],
                                    (err4, highestScoringMatches) => {
                                        if (err4) {
                                            db.close();
                                            resolve(
                                                NextResponse.json(
                                                    {
                                                        error: "Adatbázis hiba történt",
                                                    },
                                                    {
                                                        status: 500,
                                                    },
                                                ),
                                            );
                                            return;
                                        }

                                        // Get teams by different criteria
                                        db.all(
                                            `SELECT 
                                                t.id,
                                                t.name,
                                                t.matches,
                                                t.wins,
                                                t.draws,
                                                t.losses,
                                                t.points,
                                                l.name as leagueName,
                                                ROUND(CAST(t.wins AS REAL) / NULLIF(t.matches, 0) * 100, 1) as winPercentage
                                             FROM teams t
                                             JOIN leagues l ON l.id = t.league_id
                                             WHERE t.matches > 0
                                             ORDER BY t.points DESC, t.wins DESC
                                             LIMIT 15`,
                                            [],
                                            (err5, topTeams) => {
                                                if (err5) {
                                                    db.close();
                                                    resolve(
                                                        NextResponse.json(
                                                            {
                                                                error: "Adatbázis hiba történt",
                                                            },
                                                            {
                                                                status: 500,
                                                            },
                                                        ),
                                                    );
                                                    return;
                                                }

                                                // Get most defensive teams
                                                db.all(
                                                    `SELECT 
                                                        t.id,
                                                        t.name,
                                                        t.matches,
                                                        COUNT(g.id) as concededGoals,
                                                        ROUND(CAST(COUNT(g.id) AS REAL) / CAST(t.matches AS REAL), 2) as avgConcededPerMatch,
                                                        l.name as leagueName
                                                     FROM teams t
                                                     JOIN leagues l ON l.id = t.league_id
                                                     LEFT JOIN matches m ON ((m.home_team_id = t.id OR m.away_team_id = t.id) AND m.status = 'finished')
                                                     LEFT JOIN goals g ON g.match_id = m.id AND g.team_id != t.id
                                                     WHERE t.matches > 0
                                                     GROUP BY t.id, t.name, t.matches, l.name
                                                     ORDER BY concededGoals ASC
                                                     LIMIT 10`,
                                                    [],
                                                    (err6, defensiveTeams) => {
                                                        if (err6) {
                                                            db.close();
                                                            resolve(
                                                                NextResponse.json(
                                                                    {
                                                                        error: "Adatbázis hiba történt",
                                                                    },
                                                                    {
                                                                        status: 500,
                                                                    },
                                                                ),
                                                            );
                                                            return;
                                                        }

                                                        // Get league statistics
                                                        db.all(
                                                            `SELECT 
                                                                l.id,
                                                                l.name,
                                                                l.country,
                                                                COUNT(DISTINCT t.id) as teamCount,
                                                                COUNT(m.id) as totalMatches,
                                                                SUM(CASE WHEN m.status = 'finished' THEN 1 ELSE 0 END) as finishedMatches
                                                             FROM leagues l
                                                             LEFT JOIN teams t ON t.league_id = l.id
                                                             LEFT JOIN matches m ON m.league_id = l.id
                                                             GROUP BY l.id
                                                             ORDER BY finishedMatches DESC`,
                                                            [],
                                                            (
                                                                err7,
                                                                leagueStats,
                                                            ) => {
                                                                db.close();
                                                                if (err7) {
                                                                    resolve(
                                                                        NextResponse.json(
                                                                            {
                                                                                error: "Adatbázis hiba történt",
                                                                            },
                                                                            {
                                                                                status: 500,
                                                                            },
                                                                        ),
                                                                    );
                                                                    return;
                                                                }

                                                                resolve(
                                                                    NextResponse.json(
                                                                        {
                                                                            topScorers:
                                                                                topScorers ||
                                                                                [],
                                                                            scorersByLeague:
                                                                                scorersByLeague ||
                                                                                [],
                                                                            matchStats:
                                                                                matchStats?.[0] ||
                                                                                {},
                                                                            highestScoringMatches:
                                                                                highestScoringMatches ||
                                                                                [],
                                                                            topTeams:
                                                                                topTeams ||
                                                                                [],
                                                                            defensiveTeams:
                                                                                defensiveTeams ||
                                                                                [],
                                                                            leagueStats:
                                                                                leagueStats ||
                                                                                [],
                                                                        },
                                                                        {
                                                                            status: 200,
                                                                        },
                                                                    ),
                                                                );
                                                            },
                                                        );
                                                    },
                                                );
                                            },
                                        );
                                    },
                                );
                            },
                        );
                    },
                );
            },
        );
    });
}
