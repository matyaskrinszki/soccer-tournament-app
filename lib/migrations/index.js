// Ordered list of schema migrations. To change the schema, add a new file with the
// next version number and append it here. Never edit a migration that has already
// been applied to a database: write a new one instead.
import * as m001 from "./001_initial_schema";
import * as m002 from "./002_fix_seasons_foreign_keys";
import * as m003 from "./003_link_matches_to_schedule";

export const migrations = [m001, m002, m003];
