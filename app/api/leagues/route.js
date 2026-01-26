import { NextResponse } from 'next/server';
import { getDb, initializeDb } from '../../../lib/db';

initializeDb();

export async function GET() {
    return new Promise((resolve) => {
        const db = getDb();

        db.all("SELECT id, name, country FROM leagues ORDER BY name", (err, leagues) => {
            if (err) {
                db.close();
                resolve(NextResponse.json(
                    { error: 'Hiba történt a bajnokságok betöltésekor' },
                    { status: 500 }
                ));
                return;
            }

            // For each league, get its teams
            let completed = 0;
            const leaguesWithTeams = [];

            if (leagues.length === 0) {
                db.close();
                resolve(NextResponse.json({ leagues: [] }));
                return;
            }

            leagues.forEach((league, index) => {
                db.all(
                        "SELECT id, name, matches, wins, draws, losses, points FROM teams WHERE league_id = ? ORDER BY points DESC, name ASC",
                        [league.id],
                        (err, teams) => {
                        if (err) {
                            db.close();
                            resolve(NextResponse.json(
                                { error: 'Hiba történt a csapatok betöltésekor' },
                                { status: 500 }
                            ));
                            return;
                        }

                        leaguesWithTeams[index] = {
                            id: league.id,
                            name: league.name,
                            country: league.country,
                            teams: teams
                        };

                        completed++;
                        if (completed === leagues.length) {
                            db.close();
                            resolve(NextResponse.json({ leagues: leaguesWithTeams }));
                        }
                    }
                );
            });
        });
    });
}