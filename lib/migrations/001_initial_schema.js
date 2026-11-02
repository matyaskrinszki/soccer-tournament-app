// Baseline: the schema as it stood when versioned migrations were introduced.
// Uses IF NOT EXISTS so databases created before the migration system (user_version 0,
// tables already present) adopt this version without changes.
export const version = 1;
export const name = "initial_schema";

export function up(db) {
    db.exec(
        `
        CREATE TABLE IF NOT EXISTS leagues (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT,
            season TEXT DEFAULT '2024-25'
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            league_id TEXT NOT NULL,
            captain_player_id INTEGER,
            matches INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            FOREIGN KEY (league_id) REFERENCES leagues (id),
            FOREIGN KEY (captain_player_id) REFERENCES players (id)
        );

        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id TEXT NOT NULL,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            home_score INTEGER,
            away_score INTEGER,
            match_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('finished','upcoming')),
            FOREIGN KEY (league_id) REFERENCES leagues (id),
            FOREIGN KEY (home_team_id) REFERENCES teams (id),
            FOREIGN KEY (away_team_id) REFERENCES teams (id)
        );

        -- Players table (merged with users)
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            team_id INTEGER,
            role TEXT NOT NULL DEFAULT 'Player' CHECK(role IN ('Player', 'Captain', 'Admin')),
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams (id)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            minute INTEGER,
            FOREIGN KEY (match_id) REFERENCES matches (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            FOREIGN KEY (player_id) REFERENCES players (id)
        );

        -- Player requests to join a team
        CREATE TABLE IF NOT EXISTS join_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            UNIQUE(player_id, team_id)
        );

        -- Team captain invites a player
        CREATE TABLE IF NOT EXISTS recruitment_invitations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            UNIQUE(player_id, team_id)
        );

        CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id TEXT,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'setup' CHECK(status IN ('setup', 'team-preferences', 'generated', 'active', 'completed')),
            start_date TEXT,
            end_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (league_id) REFERENCES leagues (id)
        );

        -- Available fields/pitches for a season
        CREATE TABLE IF NOT EXISTS pitches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            location TEXT,
            created_by_admin INTEGER,
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (created_by_admin) REFERENCES players (id)
        );

        -- Available booking times per pitch
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            pitch_id INTEGER NOT NULL,
            slot_date TEXT,
            day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (pitch_id) REFERENCES pitches (id)
        );

        -- Captain marks preferred/unavailable times
        CREATE TABLE IF NOT EXISTS team_availability_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            time_slot_id INTEGER NOT NULL,
            preference TEXT NOT NULL CHECK(preference IN ('preferred', 'unavailable', 'neutral')),
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            FOREIGN KEY (time_slot_id) REFERENCES time_slots (id),
            UNIQUE(season_id, team_id, time_slot_id)
        );

        -- Tracks different schedule generation attempts
        CREATE TABLE IF NOT EXISTS schedule_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            league_id TEXT NOT NULL,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            algorithm_score REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'current' CHECK(status IN ('current', 'archived')),
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (league_id) REFERENCES leagues (id)
        );

        -- The actual generated match schedule
        CREATE TABLE IF NOT EXISTS scheduled_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_run_id INTEGER NOT NULL,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            time_slot_id INTEGER NOT NULL,
            pitch_id INTEGER NOT NULL,
            round_number INTEGER,
            match_date TEXT,
            FOREIGN KEY (schedule_run_id) REFERENCES schedule_runs (id),
            FOREIGN KEY (home_team_id) REFERENCES teams (id),
            FOREIGN KEY (away_team_id) REFERENCES teams (id),
            FOREIGN KEY (time_slot_id) REFERENCES time_slots (id),
            FOREIGN KEY (pitch_id) REFERENCES pitches (id)
        );
        `,
    );
}
