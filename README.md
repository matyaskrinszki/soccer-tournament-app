# Soccer Tournament App

A web app for organising and following a university football league, built around an
automatic match scheduler (BSc thesis project, ELTE IK). The user interface is in Hungarian.

Built with Next.js 16 (App Router), React 19, plain JavaScript and SQLite (better-sqlite3).

## Requirements

- **Node.js 22 or newer** (required by better-sqlite3 13; developed and tested on Node 24)
- npm (comes with Node.js)

better-sqlite3 ships prebuilt binaries for current Node versions on Windows, macOS and Linux,
so normally no compiler is needed.

## Setup

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from the example file and set `JWT_SECRET` (used to sign login
   tokens; the app refuses to start without it):

   ```bash
   cp .env.example .env.local
   ```

   Generate a random secret and paste it after `JWT_SECRET=`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Running

```bash
npm run dev
```

Then open <http://localhost:3000>.

On the first start the app creates the SQLite database at `data/tournament.db`, runs the
schema migrations (`lib/migrations/`) and fills the empty database with sample data:
four leagues (Liga I–IV) with six teams each, players, an admin, and a completed sample
season with results. Later starts only apply new migrations; existing data is kept.

**Starting over:** stop the server, delete `data/tournament.db` and start it again.

Production build:

```bash
npm run build
npm start
```

## Tests and lint

```bash
npm test
```

Runs the unit tests in `tests/*.test.mjs` with the built-in Node test runner (`node:test`),
using in-memory databases where needed; the dev database is not touched.

```bash
npm run lint
```

## Test logins

Every seeded account can log in. The data is generated from a fixed seed, so a fresh
database always has the same names and results.

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@example.com` | `Admin1Password` |
| Players in teams | `player1@example.com` … `player168@example.com` | `Player1Password` |
| Players without a team | `teamless1@example.com` … `teamless20@example.com` | `Player1Password` |

Each team has 7 players; the first player of each team is its captain, i.e.
`player1`, `player8`, `player15`, … (every 7th number starting from 1). Teams are numbered
in tier order: players 1–42 are in Liga I, 43–84 in Liga II, 85–126 in Liga III and
127–168 in Liga IV.

## Project structure

- `app/` — pages and API routes (`app/api/**/route.js`)
- `lib/` — application logic (scheduler, seasons, results, standings, statistics, badges),
  database access and migrations
- `tests/` — unit tests
- `instrumentation.js` — runs the migrations and the seeding when the server starts
