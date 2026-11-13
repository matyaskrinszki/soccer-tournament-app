// Ordered list of schema migrations. To change the schema, add a new file with the
// next version number and append it here. Never edit a migration that has already
// been applied to a database: write a new one instead.
import * as m001 from "./001_initial_schema";
import * as m002 from "./002_fix_seasons_foreign_keys";
import * as m003 from "./003_link_matches_to_schedule";
import * as m004 from "./004_sample_season";
import * as m005 from "./005_drop_team_stat_columns";
import * as m006 from "./006_season_teams";
import * as m007 from "./007_goal_scorers";
import * as m008 from "./008_match_reports";
import * as m009 from "./009_hidden_badges";
import * as m010 from "./010_schedule_run_preference_counts";

export const migrations = [m001, m002, m003, m004, m005, m006, m007, m008, m009, m010];
