import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { getDatabase } from "./database";
import { runMigrations } from "./migrate";
import { SAMPLE_SEASON_NAME } from "./migrations/004_sample_season";

/**
 * Run pending schema migrations, then insert sample data into an empty database.
 * Called once at server startup from instrumentation.js. Completion is recorded on
 * globalThis so repeated calls (e.g. dev hot reloads) don't run it again; a failed
 * attempt is not recorded, so a later call retries.
 */
export function initializeDb() {
    if (globalThis.__dbInitialized) {
        return;
    }

    const db = getDatabase();
    const { from, to } = runMigrations(db);
    if (from !== to) {
        console.log(`[db] schema migrated from version ${from} to ${to}`);
    }

    const row = db.prepare("SELECT COUNT(*) as count FROM leagues").get();
    if (row.count === 0) {
        // All-or-nothing, so a failed seed doesn't leave a half-filled database
        db.transaction(() => insertSampleData(db))();
    }

    globalThis.__dbInitialized = true;
}

function insertSampleData(db) {
    const leagues = [
        { id: "premier-league", name: "Premier League", country: "England" },
        { id: "la-liga", name: "La Liga", country: "Spain" },
        { id: "serie-a", name: "Serie A", country: "Italy" },
        { id: "bundesliga", name: "Bundesliga", country: "Germany" },
    ];

    const insertLeague = db.prepare(
        "INSERT INTO leagues (id, name, country) VALUES (?, ?, ?)",
    );
    leagues.forEach((league) => {
        insertLeague.run(league.id, league.name, league.country);
    });

    // Teams by league with fixed ids
    const teamsByLeague = {
        "premier-league": [
            { id: 1, name: "Manchester City" },
            { id: 2, name: "Arsenal" },
            { id: 3, name: "Liverpool" },
            { id: 4, name: "Chelsea" },
            { id: 5, name: "Manchester United" },
            { id: 6, name: "Tottenham" },
        ],
        "la-liga": [
            { id: 7, name: "Real Madrid" },
            { id: 8, name: "Barcelona" },
            { id: 9, name: "Atletico Madrid" },
            { id: 10, name: "Real Sociedad" },
            { id: 11, name: "Valencia" },
            { id: 12, name: "Sevilla" },
        ],
        bundesliga: [
            { id: 19, name: "Bayern Munich" },
            { id: 20, name: "Borussia Dortmund" },
            { id: 21, name: "RB Leipzig" },
            { id: 22, name: "Bayer Leverkusen" },
            { id: 23, name: "Eintracht Frankfurt" },
            { id: 24, name: "Borussia Monchengladbach" },
        ],
    };

    // Insert teams with zeroed stats; will be recalculated from matches
    const insertTeam = db.prepare(
        "INSERT INTO teams (id, name, league_id, captain_player_id, matches, wins, draws, losses, points) VALUES (?, ?, ?, NULL, 0, 0, 0, 0, 0)",
    );
    Object.entries(teamsByLeague).forEach(([leagueId, teams]) => {
        teams.forEach((team) => {
            insertTeam.run(team.id, team.name, leagueId);
        });
    });

    // Players: 7 per team using faker for names
    const players = [];
    const playersByTeam = new Map();
    let playerId = 1;
    Object.values(teamsByLeague).forEach((teams) => {
        teams.forEach((team) => {
            const rosterIds = [];
            for (let i = 0; i < 7; i++) {
                const p = {
                    id: playerId++,
                    name: faker.person.fullName(),
                    email: `player${playerId - 1}@example.com`,
                    password: "sample-password-hash",
                    team_id: team.id,
                    role: "Player",
                };
                players.push(p);
                rosterIds.push(p.id);
            }
            playersByTeam.set(team.id, rosterIds);
        });
    });

    // Add 20 teamless players using faker
    for (let i = 0; i < 20; i++) {
        const p = {
            id: playerId++,
            name: faker.person.fullName(),
            email: `teamless${i + 1}@example.com`,
            password: "sample-password-hash",
            team_id: null,
            role: "Player",
        };
        players.push(p);
    }

    const insertPlayer = db.prepare(
        "INSERT INTO players (id, email, password, name, team_id, role) VALUES (?, ?, ?, ?, ?, ?)",
    );

    // Insert admin user
    const adminPassword = bcrypt.hashSync("Admin1Password", 10);
    insertPlayer.run(
        playerId++,
        "admin@example.com",
        adminPassword,
        "Admin",
        null,
        "Admin",
    );

    // Insert all players (including teamless ones)
    players.forEach((p) => {
        insertPlayer.run(p.id, p.email, p.password, p.name, p.team_id, p.role);
    });

    // Assign a captain for each team (first player in roster)
    const setCaptain = db.prepare(
        "UPDATE teams SET captain_player_id = ? WHERE id = ?",
    );
    const setRole = db.prepare("UPDATE players SET role = ? WHERE id = ?");
    playersByTeam.forEach((rosterIds, teamId) => {
        const captainId = rosterIds[0];
        if (captainId) {
            setCaptain.run(captainId, teamId);
            // Update player role to Captain
            setRole.run("Captain", captainId);
        }
    });

    const scorePattern = [
        [2, 1],
        [1, 1],
        [3, 0],
        [2, 2],
        [1, 0],
        [0, 1],
        [4, 2],
        [3, 2],
        [2, 3],
        [1, 2],
        [0, 0],
        [2, 4],
    ];

    const finishedMatches = [];
    let matchIdCounter = 1;

    // Local "YYYY-MM-DDT18:00:00", the format published matches use
    const kickOffOn = (time) =>
        `${new Date(time).toISOString().slice(0, 10)}T18:00:00`;

    Object.entries(teamsByLeague).forEach(([leagueId, teams], leagueIdx) => {
        const teamIds = teams.map((t) => t.id);

        // Double round-robin finished matches (each pair twice => 10 played per team)
        const finishedBase = new Date(Date.UTC(2025, 9, 1)); // 2025-10-01
        let fIndex = 0;
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const home = teamIds[i];
                const away = teamIds[j];
                const score = scorePattern[fIndex % scorePattern.length];
                const score2 = scorePattern[(fIndex + 7) % scorePattern.length];

                finishedMatches.push({
                    id: matchIdCounter++,
                    league_id: leagueId,
                    home_team_id: home,
                    away_team_id: away,
                    home_score: score[0],
                    away_score: score[1],
                    match_date: kickOffOn(
                        finishedBase.getTime() +
                            (fIndex + leagueIdx * 40) * 86400000,
                    ),
                    status: "finished",
                });

                finishedMatches.push({
                    id: matchIdCounter++,
                    league_id: leagueId,
                    home_team_id: away,
                    away_team_id: home,
                    home_score: score2[0],
                    away_score: score2[1],
                    match_date: kickOffOn(
                        finishedBase.getTime() +
                            (fIndex + 20 + leagueIdx * 40) * 86400000,
                    ),
                    status: "finished",
                });

                fIndex++;
            }
        }
    });

    // Generate goals for finished matches
    const randBetween = (min, max) =>
        Math.floor(Math.random() * (max - min + 1)) + min;
    const goals = [];
    finishedMatches.forEach((m) => {
        const homePlayers = playersByTeam.get(m.home_team_id) || [];
        const awayPlayers = playersByTeam.get(m.away_team_id) || [];

        for (let i = 0; i < m.home_score; i++) {
            const pid = homePlayers[randBetween(0, homePlayers.length - 1)];
            goals.push({
                match_id: m.id,
                team_id: m.home_team_id,
                player_id: pid,
                minute: randBetween(5, 90),
            });
        }
        for (let i = 0; i < m.away_score; i++) {
            const pid = awayPlayers[randBetween(0, awayPlayers.length - 1)];
            goals.push({
                match_id: m.id,
                team_id: m.away_team_id,
                player_id: pid,
                minute: randBetween(5, 90),
            });
        }
    });

    // The sample matches form a completed season of their own, so they never mix
    // with real results (see migration 004)
    const matchDates = finishedMatches.map((m) => m.match_date).sort();
    const sampleSeasonId = Number(
        db
            .prepare(
                `INSERT INTO seasons (league_id, name, status, start_date, end_date, is_sample)
                 VALUES (NULL, ?, 'completed', ?, ?, 1)`,
            )
            .run(
                SAMPLE_SEASON_NAME,
                matchDates[0].slice(0, 10),
                matchDates[matchDates.length - 1].slice(0, 10),
            ).lastInsertRowid,
    );

    // Insert matches with explicit ids
    const insertMatch = db.prepare(
        "INSERT INTO matches (id, league_id, season_id, home_team_id, away_team_id, home_score, away_score, match_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    finishedMatches.forEach((match) => {
        insertMatch.run(
            match.id,
            match.league_id,
            sampleSeasonId,
            match.home_team_id,
            match.away_team_id,
            match.home_score,
            match.away_score,
            match.match_date,
            match.status,
        );
    });

    // Insert goals
    const insertGoal = db.prepare(
        "INSERT INTO goals (match_id, team_id, player_id, minute) VALUES (?, ?, ?, ?)",
    );
    goals.forEach((g) => {
        insertGoal.run(g.match_id, g.team_id, g.player_id, g.minute);
    });

    // Recalculate team stats from finished matches
    const stats = new Map();
    finishedMatches.forEach((m) => {
        const home = m.home_team_id;
        const away = m.away_team_id;
        const hs = m.home_score;
        const as = m.away_score;

        if (!stats.has(home))
            stats.set(home, {
                matches: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                points: 0,
            });
        if (!stats.has(away))
            stats.set(away, {
                matches: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                points: 0,
            });

        const homeStat = stats.get(home);
        const awayStat = stats.get(away);

        homeStat.matches += 1;
        awayStat.matches += 1;

        if (hs > as) {
            homeStat.wins += 1;
            awayStat.losses += 1;
            homeStat.points += 3;
        } else if (hs < as) {
            awayStat.wins += 1;
            homeStat.losses += 1;
            awayStat.points += 3;
        } else {
            homeStat.draws += 1;
            awayStat.draws += 1;
            homeStat.points += 1;
            awayStat.points += 1;
        }
    });

    const updateStats = db.prepare(
        "UPDATE teams SET matches = ?, wins = ?, draws = ?, losses = ?, points = ? WHERE id = ?",
    );
    stats.forEach((stat, teamId) => {
        updateStats.run(
            stat.matches,
            stat.wins,
            stat.draws,
            stat.losses,
            stat.points,
            teamId,
        );
    });
}
