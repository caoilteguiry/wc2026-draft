import asyncio
import functools
import random
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db, AsyncSessionLocal
from models import DraftSession, Player, Pick, Team, Match
from schemas import SessionOut, CreateSessionResponse, JoinRequest, PickOut, PickRequest
from draft_logic import get_current_player_id, TOTAL_PICKS
from scoring import score_match_for_team

router = APIRouter(prefix="/sessions", tags=["draft"])


# --- WebSocket connection manager ---

class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, token: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(token, []).append(ws)

    def disconnect(self, token: str, ws: WebSocket):
        conns = self._connections.get(token, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, token: str, data: dict):
        dead = []
        for ws in self._connections.get(token, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[token].remove(ws)


manager = ConnectionManager()

AUTO_PICK_SECONDS = 900  # 15 minutes
_timers: dict[str, asyncio.Task] = {}


def _schedule_auto_pick(token: str, delay: float | None = None):
    """Cancel any existing timer for the session and start a fresh one."""
    if delay is None:
        delay = AUTO_PICK_SECONDS
    existing = _timers.pop(token, None)
    if existing and not existing.done():
        existing.cancel()
    _timers[token] = asyncio.create_task(_auto_pick(token, delay))


async def _auto_pick(token: str, delay: float):
    """Sleep then make a random pick on behalf of the current player."""
    try:
        await asyncio.sleep(delay)
    except asyncio.CancelledError:
        return

    async with AsyncSessionLocal() as db:
        try:
            session = await _load_session(token, db)
        except HTTPException:
            return
        if session.status != "drafting":
            return

        picked_ids = {pk.team_id for pk in session.picks}
        result = await db.execute(select(Team))
        available = [t for t in result.scalars().all() if t.id not in picked_ids]
        if not available:
            return

        player_id = get_current_player_id(session.draft_order, session.current_pick_index)
        if player_id is None:
            return

        team = random.choice(available)
        db.add(Pick(
            session_id=session.id,
            player_id=player_id,
            team_id=team.id,
            pick_number=session.current_pick_index,
        ))
        session.current_pick_index += 1
        if session.current_pick_index >= TOTAL_PICKS:
            session.status = "complete"
            session.pick_started_at = None
        else:
            session.pick_started_at = datetime.utcnow()
        await db.commit()
        db.expire_all()
        session = await _load_session(token, db)
        event = "draft_complete" if session.status == "complete" else "pick_made"
        await manager.broadcast(token, {"event": event, "state": _session_out(session)})

        if session.status == "drafting":
            _schedule_auto_pick(token, AUTO_PICK_SECONDS)
        else:
            _timers.pop(token, None)


async def reschedule_active_timers():
    """Called on startup — restores timers for any draft that was mid-pick when the server last stopped."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DraftSession).where(
                DraftSession.status == "drafting",
                DraftSession.pick_started_at.isnot(None),
            )
        )
        for session in result.scalars().all():
            elapsed = (datetime.utcnow() - session.pick_started_at).total_seconds()
            delay = max(AUTO_PICK_SECONDS - elapsed, 10)
            _schedule_auto_pick(session.token, delay)


# --- Helpers ---

def _session_out(session: DraftSession) -> dict:
    current_player_id = get_current_player_id(
        session.draft_order or [], session.current_pick_index
    ) if session.status == "drafting" else None
    pick_started_at = (
        session.pick_started_at.isoformat() + "Z" if session.pick_started_at else None
    )
    return {
        "token": session.token,
        "status": session.status,
        "players": [{"id": p.id, "name": p.name} for p in session.players],
        "picks": [
            {"pick_number": pk.pick_number, "player_id": pk.player_id, "team_id": pk.team_id}
            for pk in sorted(session.picks, key=lambda x: x.pick_number)
        ],
        "current_pick_index": session.current_pick_index,
        "current_player_id": current_player_id,
        "pick_started_at": pick_started_at,
        "auto_pick_timeout_seconds": AUTO_PICK_SECONDS,
    }


async def _load_session(token: str, db: AsyncSession) -> DraftSession:
    result = await db.execute(
        select(DraftSession)
        .options(selectinload(DraftSession.players), selectinload(DraftSession.picks))
        .where(DraftSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# --- Endpoints ---

@router.post("/", response_model=CreateSessionResponse)
async def create_session(db: AsyncSession = Depends(get_db)):
    token = secrets.token_urlsafe(12)
    admin_token = secrets.token_urlsafe(24)
    session = DraftSession(token=token, admin_token=admin_token)
    db.add(session)
    await db.commit()
    return CreateSessionResponse(
        token=token,
        admin_token=admin_token,
        invite_url=f"/?session={token}",
        admin_url=f"/?session={token}&admin={admin_token}",
    )


@router.get("/{token}")
async def get_session(token: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(token, db)
    return _session_out(session)


@router.post("/{token}/join")
async def join_session(token: str, body: JoinRequest, db: AsyncSession = Depends(get_db)):
    session = await _load_session(token, db)
    if session.status != "waiting":
        raise HTTPException(status_code=400, detail="Draft has already started")
    if len(session.players) >= 4:
        raise HTTPException(status_code=400, detail="Session is full")
    if any(p.name.lower() == body.name.lower() for p in session.players):
        raise HTTPException(status_code=400, detail="Name already taken")
    player = Player(name=body.name, session_id=session.id)
    db.add(player)
    await db.commit()
    await db.refresh(player)
    db.expire_all()
    session = await _load_session(token, db)
    await manager.broadcast(token, {"event": "player_joined", "state": _session_out(session)})
    return {"player_id": player.id, "name": player.name}


@router.post("/{token}/start")
async def start_draft(
    token: str,
    admin_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    session = await _load_session(token, db)
    if session.admin_token != admin_token:
        raise HTTPException(status_code=403, detail="Not authorised")
    if session.status != "waiting":
        raise HTTPException(status_code=400, detail="Draft already started")
    if len(session.players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    order = [p.id for p in session.players]
    random.shuffle(order)
    session.draft_order = order
    session.status = "drafting"
    session.current_pick_index = 0
    session.pick_started_at = datetime.utcnow()
    await db.commit()
    db.expire_all()
    session = await _load_session(token, db)
    await manager.broadcast(token, {"event": "draft_started", "state": _session_out(session)})
    _schedule_auto_pick(token)
    return _session_out(session)


@router.post("/{token}/pick")
async def make_pick(token: str, body: PickRequest, db: AsyncSession = Depends(get_db)):
    session = await _load_session(token, db)
    if session.status != "drafting":
        raise HTTPException(status_code=400, detail="Draft is not active")
    if session.current_pick_index >= TOTAL_PICKS:
        raise HTTPException(status_code=400, detail="Draft is complete")

    expected_player_id = get_current_player_id(session.draft_order, session.current_pick_index)
    if body.player_id != expected_player_id:
        raise HTTPException(status_code=400, detail="Not your turn")

    # Check team exists and is not already picked
    team = await db.get(Team, body.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    already_picked = any(pk.team_id == body.team_id for pk in session.picks)
    if already_picked:
        raise HTTPException(status_code=400, detail="Team already drafted")

    pick = Pick(
        session_id=session.id,
        player_id=body.player_id,
        team_id=body.team_id,
        pick_number=session.current_pick_index,
    )
    db.add(pick)
    session.current_pick_index += 1
    if session.current_pick_index >= TOTAL_PICKS:
        session.status = "complete"
        session.pick_started_at = None
    else:
        session.pick_started_at = datetime.utcnow()
    await db.commit()
    db.expire_all()
    session = await _load_session(token, db)
    event = "draft_complete" if session.status == "complete" else "pick_made"
    await manager.broadcast(token, {"event": event, "state": _session_out(session)})
    if session.status == "drafting":
        _schedule_auto_pick(token)
    else:
        _timers.pop(token, None)
    return _session_out(session)


@router.websocket("/{token}/ws")
async def websocket_endpoint(token: str, ws: WebSocket, db: AsyncSession = Depends(get_db)):
    await manager.connect(token, ws)
    try:
        # Send current state on connect
        session = await _load_session(token, db)
        await ws.send_json({"event": "connected", "state": _session_out(session)})
        while True:
            await ws.receive_text()  # keep alive; client sends pings
    except WebSocketDisconnect:
        manager.disconnect(token, ws)


@router.get("/{token}/leaderboard")
async def get_leaderboard(token: str, db: AsyncSession = Depends(get_db)):
    session = await _load_session(token, db)

    # Load all finished matches
    matches_result = await db.execute(select(Match).where(Match.status == "FINISHED"))
    finished_matches = matches_result.scalars().all()

    # Build player → set of team_ids from picks
    player_teams: dict[int, set[int]] = {p.id: set() for p in session.players}
    for pick in session.picks:
        if pick.player_id in player_teams:
            player_teams[pick.player_id].add(pick.team_id)

    # Load team details for all drafted teams
    all_team_ids = list({tid for tids in player_teams.values() for tid in tids})
    if all_team_ids:
        teams_result = await db.execute(select(Team).where(Team.id.in_(all_team_ids)))
        teams = {t.id: t for t in teams_result.scalars().all()}
    else:
        teams = {}

    # Calculate scores per player per team
    player_entries = []
    for player in session.players:
        team_scores = []
        for team_id in player_teams[player.id]:
            team = teams.get(team_id)
            pts = 0
            played = 0
            for match in finished_matches:
                if match.home_team_id == team_id or match.away_team_id == team_id:
                    pts += score_match_for_team(match, team_id)
                    played += 1
            team_scores.append({
                "team_id": team_id,
                "team_name": team.name if team else str(team_id),
                "crest_url": team.crest_url if team else None,
                "points": pts,
                "matches_played": played,
            })
        team_scores.sort(key=lambda x: x["points"], reverse=True)
        total = sum(ts["points"] for ts in team_scores)
        player_entries.append({
            "player_id": player.id,
            "player_name": player.name,
            "total": total,
            "teams": team_scores,
            "_team_ids": player_teams[player.id],
        })

    # Sort: descending total → head-to-head → alphabetical
    def compare(a, b):
        if a["total"] != b["total"]:
            return b["total"] - a["total"]
        # Head-to-head: count wins in matches where a team from a faced a team from b
        h2h = 0
        for match in finished_matches:
            a_home = match.home_team_id in a["_team_ids"]
            a_away = match.away_team_id in a["_team_ids"]
            b_home = match.home_team_id in b["_team_ids"]
            b_away = match.away_team_id in b["_team_ids"]
            if (a_home and b_away) or (a_away and b_home):
                a_won = (a_home and match.winner == "HOME_TEAM") or (a_away and match.winner == "AWAY_TEAM")
                b_won = (b_home and match.winner == "HOME_TEAM") or (b_away and match.winner == "AWAY_TEAM")
                if a_won:
                    h2h += 1
                elif b_won:
                    h2h -= 1
        if h2h != 0:
            return -h2h  # negative → a ranks higher when a won more h2h
        # Alphabetical ascending
        return (a["player_name"] > b["player_name"]) - (a["player_name"] < b["player_name"])

    player_entries.sort(key=functools.cmp_to_key(compare))

    return [
        {
            "rank": i + 1,
            "player_id": e["player_id"],
            "player_name": e["player_name"],
            "total": e["total"],
            "teams": e["teams"],
        }
        for i, e in enumerate(player_entries)
    ]
