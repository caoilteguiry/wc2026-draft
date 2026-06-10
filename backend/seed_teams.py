"""
Fetch WC 2026 teams from football-data.org and seed the database.

Usage:
    uv run python seed_teams.py

Requires DATABASE_URL and FOOTBALL_DATA_API_KEY in .env
"""

import asyncio
import os
import httpx
from sqlalchemy import select
from dotenv import load_dotenv
from database import engine, Base, AsyncSessionLocal
from models import Team

load_dotenv()

API_KEY = os.environ["FOOTBALL_DATA_API_KEY"]
COMPETITION_CODE = "WC"  # football-data.org code for FIFA World Cup


async def fetch_teams() -> list[dict]:
    url = f"https://api.football-data.org/v4/competitions/{COMPETITION_CODE}/teams"
    headers = {"X-Auth-Token": API_KEY}
    async with httpx.AsyncClient(verify=False) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
    return data.get("teams", [])


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    teams_data = await fetch_teams()
    if not teams_data:
        print("No teams returned from API. Check your API key and competition code.")
        return

    async with AsyncSessionLocal() as db:
        for t in teams_data:
            external_id = t["id"]
            existing = await db.execute(select(Team).where(Team.external_id == external_id))
            if existing.scalar_one_or_none():
                continue  # skip if already seeded
            team = Team(
                name=t.get("name"),
                crest_url=t.get("crest"),
                external_id=external_id,
                group=None,  # group stage draw data not always in /teams endpoint
            )
            db.add(team)
        await db.commit()

    print(f"Seeded {len(teams_data)} teams.")

    # Print teams for verification
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Team).order_by(Team.name))
        for team in result.scalars().all():
            print(f"  [{team.id}] {team.name} — {team.crest_url}")


if __name__ == "__main__":
    asyncio.run(seed())
