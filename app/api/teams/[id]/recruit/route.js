import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db";

export async function POST(request, context) {
    let teamId = context?.params?.id;

    if (!teamId) {
        const pathParts = new URL(request.url).pathname
            .split("/")
            .filter(Boolean);
        const teamsIndex = pathParts.indexOf("teams");
        if (teamsIndex !== -1 && teamsIndex + 1 < pathParts.length) {
            teamId = pathParts[teamsIndex + 1];
        }
    }

    if (!teamId) {
        return NextResponse.json(
            { error: "Csapat azonosító hiányzik" },
            { status: 400 },
        );
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

    const { captainId, playerId } = payload || {};

    if (!captainId || !playerId) {
        return NextResponse.json({ error: "Hiányzó adatok" }, { status: 400 });
    }

    const db = getDb();

    return new Promise((resolve) => {
        // Forward to recruitment-invitations endpoint
        db.close();
        resolve(
            NextResponse.json(
                {
                    error: "Használd a /api/recruitment-invitations végpontot a játékos meghívásához",
                },
                { status: 410 },
            ),
        );
    });
}
