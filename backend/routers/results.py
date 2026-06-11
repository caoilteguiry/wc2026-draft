import asyncio
import os
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db, AsyncSessionLocal
from models import DraftSession, Match, Team, STAGE_ORDER

router = APIRouter(prefix="/results", tags=["results"])

_FOOTBALL_DATA_URL = "https://api.football-data.org/v4/competitions/WC/matches"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _match_out(m: Match) -> dict:
    return {
        "id": m.id,
        "external_id": m.external_id,
        "stage": m.stage,
        "matchday": m.matchday,
        "status": m.status,
        "utc_date": m.utc_date.isoformat() + "Z",
        "home_team": (
            {"id": m.home_team_id, "name": m.home_team.name, "crest_url": m.home_team.crest_url}
            if m.home_team else None
        ),
        "away_team": (
            {"id": m.away_team_id, "name": m.away_team.name, "crest_url": m.away_team.crest_url}
            if m.away_team else None
        ),
        "home_score": m.home_score,
        "away_score": m.away_score,
        "winner": m.winner,
    }


async def _do_sync(db: AsyncSession) -> int:
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY", "")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(_FOOTBALL_DATA_URL, headers={"X-Auth-Token": api_key})
        r.raise_for_status()

    data = r.json()

    # Build external_id → local team id map
    team_rows = await db.execute(select(Team))
    teams = {t.external_id: t.id for t in team_rows.scalars().all()}

    for m in data.get("matches", []):
        home_ext = (m.get("homeTeam") or {}).get("id")
        away_ext = (m.get("awayTeam") or {}).get("id")
        score = m.get("score") or {}
        full_time = score.get("fullTime") or {}

        try:
            utc_date = datetime.strptime(m["utcDate"], "%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            utc_date = datetime.fromisoformat(m["utcDate"].rstrip("Z"))

        values = dict(
            external_id=m["id"],
            home_team_id=teams.get(home_ext),
            away_team_id=teams.get(away_ext),
            home_score=full_time.get("home"),
            away_score=full_time.get("away"),
            winner=score.get("winner"),
            stage=m.get("stage", ""),
            matchday=m.get("matchday"),
            status=m.get("status", ""),
            utc_date=utc_date,
        )

        existing = (await db.execute(
            select(Match).where(Match.external_id == m["id"])
        )).scalar_one_or_none()

        if existing:
            for k, v in values.items():
                setattr(existing, k, v)
        else:
            db.add(Match(**values))

    await db.commit()
    return len(data.get("matches", []))


async def _next_interval(db: AsyncSession) -> int:
    """Return seconds until next sync based on current match activity."""
    now = datetime.utcnow()
    soon = now + timedelta(hours=2)
    active = (await db.execute(
        select(Match).where(
            or_(
                Match.status == "IN_PLAY",
                and_(
                    Match.status == "SCHEDULED",
                    Match.utc_date >= now,
                    Match.utc_date <= soon,
                ),
            )
        ).limit(1)
    )).scalar_one_or_none()

    if active is None:
        return 3600       # nothing imminent — sync hourly
    if active.status == "IN_PLAY":
        return 120        # live match — sync every 2 minutes
    return 600            # kick-off within 2 hours — sync every 10 minutes


async def adaptive_sync_loop():
    """Background task started on app startup."""
    await asyncio.sleep(30)  # startup grace period
    while True:
        interval = 3600
        try:
            async with AsyncSessionLocal() as db:
                await _do_sync(db)
                interval = await _next_interval(db)
        except Exception:
            pass  # on error keep the default 1-hour interval
        await asyncio.sleep(interval)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/sync")
async def sync_results(admin_token: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Admin-triggered sync. Verifies admin_token against any existing session."""
    valid = (await db.execute(
        select(DraftSession).where(DraftSession.admin_token == admin_token)
    )).scalar_one_or_none()
    if not valid:
        raise HTTPException(status_code=403, detail="Not authorised")

    count = await _do_sync(db)
    return {"synced": count}


@router.get("/")
async def get_results(db: AsyncSession = Depends(get_db)):
    matches = (await db.execute(
        select(Match)
        .options(selectinload(Match.home_team), selectinload(Match.away_team))
        .order_by(Match.utc_date)
    )).scalars().all()
    return [_match_out(m) for m in matches]
