# Implementation Plan

## Phase 1 — Project Scaffolding

- Initialise backend: FastAPI project with `uv` and `pyproject.toml`
- Initialise frontend: React app with Vite
- Set up PostgreSQL connection (SQLAlchemy + asyncpg)
- Define all database models and run initial migration
- Basic project structure: `backend/` and `frontend/` directories

## Phase 2 — Team Data

- Seed all 48 WC 2026 teams into the `teams` table (name, group, flag)
- Flag icons: use a CDN-hosted flag library (e.g. flagcdn.com — free, URL-based, no install needed)
- Expose a `/teams` API endpoint

## Phase 3 — Draft System

- Invite link: admin creates a session, app generates a shareable URL token
- Player join: players visit the URL, enter their name, get persisted to `players`
- Admin starts draft: snake order is randomised and stored in `draft_session`
- Pick endpoint: validates it is the correct player's turn, records pick, advances turn
- WebSocket endpoint: broadcasts pick events to all connected clients in real time

## Phase 4 — Tournament Results

- Integrate football-data.org API client (httpx)
- Fetch all WC 2026 matches and persist to `matches` table
- Admin-triggered refresh endpoint (`POST /admin/refresh-results`)
- Normalise match data: home/away teams, score, stage, status (scheduled / in-play / finished)

## Phase 5 — Scoring Engine

- Implement scoring rules from `scoring.md`
- Calculate points per match per team
- Aggregate per player across their 12 drafted teams
- Expose `/leaderboard` endpoint returning ranked players with points breakdown

## Phase 6 — Frontend

- Tab 1 (Draft): team pool grid + 4 player columns, WebSocket connection, highlight whose turn it is
- Tab 2 (Results): match list by stage, score per match, overlay of points earned per player's teams
- Tab 3 (Leaderboard): ranked table with total points and per-team breakdown
- Admin controls: "Start Draft" button, "Refresh Results" button (only shown to admin)

## Phase 7 — Deployment

- Deploy FastAPI backend as a Render Web Service
- Deploy React frontend as a Render Static Site
- Provision Render PostgreSQL instance
- Set environment variables: `DATABASE_URL`, `FOOTBALL_DATA_API_KEY`, `ADMIN_SECRET`
- Smoke test all three tabs end-to-end
