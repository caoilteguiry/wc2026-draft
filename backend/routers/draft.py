import random
import secrets
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import DraftSession, Player, Pick, Team
from schemas import SessionOut, CreateSessionResponse, JoinRequest, PickOut, PickRequest
from draft_logic import get_current_player_id, TOTAL_PICKS

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


# --- Helpers ---

def _session_out(session: DraftSession) -> dict:
    current_player_id = get_current_player_id(
        session.draft_order or [], session.current_pick_index
    ) if session.status == "drafting" else None
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
    # Reload and broadcast
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
    await db.commit()

    session = await _load_session(token, db)
    await manager.broadcast(token, {"event": "draft_started", "state": _session_out(session)})
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
    await db.commit()

    session = await _load_session(token, db)
    event = "draft_complete" if session.status == "complete" else "pick_made"
    await manager.broadcast(token, {"event": event, "state": _session_out(session)})
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
