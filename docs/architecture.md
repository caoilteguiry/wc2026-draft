# Architecture

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | React (Vite)                      |
| Backend     | Python / FastAPI                  |
| Database    | PostgreSQL (Render managed)       |
| Real-time   | WebSockets (FastAPI native)       |
| Deployment  | Render (backend service + static site) |
| Data source | football-data.org API             |

## Components

### Draft Manager
- Participant management via invite link (no authentication — players enter their name on arrival)
- Draft session creation and state
- Snake draft order generation (randomised on session start)
- Team selection with pick validation
- WebSocket broadcast — all connected clients receive real-time pick updates

### Tournament Data Service
- Fetch match results from football-data.org API
- Admin-triggered refresh (manual button in UI)
- Normalise and persist match results to PostgreSQL

### Scoring Engine
- Calculate points per match per drafted team (see scoring.md)
- Aggregate scores per player across all 12 of their teams
- Produce ranked leaderboard

## Database Tables (high level)

- `teams` — 48 WC teams with name, flag, group
- `players` — 4 participants with name
- `draft_session` — session state, draft order, current pick index
- `picks` — which player drafted which team (and pick order)
- `matches` — match results from football-data.org
- `scores` — computed points per player per match (or derived at query time)

## Frontend Structure

Three tabs:

1. **Draft** — unselected team pool + 4 player columns, real-time via WebSocket
2. **Results** — all WC matches with scores; overlay shows points earned per game for each player's teams
3. **Leaderboard** — ranked table of players with total points

## Invite Flow

1. Admin (single designated user) creates the draft session
2. App generates a shareable URL with a session token
3. Each player visits the URL, enters their name, and joins
4. Once all 4 players have joined, admin starts the draft
5. Draft order is randomised at start time
