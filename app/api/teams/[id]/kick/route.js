import { NextResponse } from "next/server";
import { getDb, initializeDb } from "../../../../../lib/db";
import {
    requireCaptainOrAdmin,
    isCaptainOfTeam,
} from "../../../../../lib/auth";

initializeDb();

export async function POST(request, context) {
    const user = await requireCaptainOrAdmin(request);
    if (user instanceof NextResponse) {
        return user;
    }

    const { id } = await context.params;
    const teamId = Number(id);

    if (!teamId) {
        return NextResponse.json(
            { error: "A csapat azonosító hiányzik" },
            { status: 400 },
        );
    }

    if (user.role !== "Admin") {
        const captainCheck = await isCaptainOfTeam(user, teamId);
        if (!captainCheck) {
            return NextResponse.json(
                { error: "Csak a csapatkapitány távolíthat el játékost" },
                { status: 403 },
            );
        }
    }

    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return NextResponse.json(
            { error: "Érvénytelen kérés" },
            { status: 400 },
        );
    }

    const playerId = Number(payload?.playerId);
    if (!playerId) {
        return NextResponse.json(
            { error: "A játékos azonosító hiányzik" },
            { status: 400 },
        );
    }

    const db = getDb();

    return new Promise((resolve) => {
        db.get(
            "SELECT captain_player_id FROM teams WHERE id = ?",
            [teamId],
            (teamErr, teamRow) => {
                if (teamErr) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "Adatbázis hiba történt" },
                            { status: 500 },
                        ),
                    );
                    return;
                }

                if (!teamRow) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "A csapat nem található" },
                            { status: 404 },
                        ),
                    );
                    return;
                }

                if (Number(teamRow.captain_player_id) === playerId) {
                    db.close();
                    resolve(
                        NextResponse.json(
                            { error: "A csapatkapitány nem távolítható el" },
                            { status: 400 },
                        ),
                    );
                    return;
                }

                db.run(
                    "UPDATE players SET team_id = NULL, role = CASE WHEN role = 'Captain' THEN 'Player' ELSE role END WHERE id = ? AND team_id = ?",
                    [playerId, teamId],
                    function (updateErr) {
                        db.close();
                        if (updateErr) {
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "Nem sikerült eltávolítani a játékost",
                                    },
                                    { status: 500 },
                                ),
                            );
                            return;
                        }

                        if (this.changes === 0) {
                            resolve(
                                NextResponse.json(
                                    {
                                        error: "A játékos nem tagja ennek a csapatnak",
                                    },
                                    { status: 404 },
                                ),
                            );
                            return;
                        }

                        resolve(
                            NextResponse.json(
                                { success: true },
                                { status: 200 },
                            ),
                        );
                    },
                );
            },
        );
    });
}
