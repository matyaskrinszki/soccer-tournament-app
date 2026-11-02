import { NextResponse } from "next/server";

export async function POST(request, context) {
    let teamId = context?.params?.id;

    if (!teamId) {
        // Fallback: extract from URL path /api/teams/123/join
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

    const { playerId } = payload || {};

    if (!playerId) {
        return NextResponse.json(
            { error: "Játékos azonosító hiányzik" },
            { status: 400 },
        );
    }

    // Forward to join-requests endpoint
    return NextResponse.json(
        {
            error: "Használd a /api/join-requests végpontot a csapathoz csatlakozáshoz",
        },
        { status: 410 },
    );
}
