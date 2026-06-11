"""
Tests for the auto-pick timer feature.

Written before implementation — expected to fail until:
  - pick_started_at and auto_pick_timeout_seconds are added to _session_out
  - _schedule_auto_pick looks up AUTO_PICK_SECONDS dynamically (not as a
    default argument) so monkeypatching the module constant works in tests
"""

import routers.draft as draft_module


def _create_session(client):
    r = client.post("/sessions/")
    assert r.status_code == 200
    return r.json()


def _join(client, token, name):
    r = client.post(f"/sessions/{token}/join", json={"name": name})
    assert r.status_code == 200
    return r.json()


def _start(client, token, admin_token):
    r = client.post(f"/sessions/{token}/start?admin_token={admin_token}")
    assert r.status_code == 200
    return r.json()


def _pick(client, token, player_id, team_id):
    r = client.post(f"/sessions/{token}/pick", json={"player_id": player_id, "team_id": team_id})
    assert r.status_code == 200
    return r.json()


# ---------------------------------------------------------------------------
# Test 1: initial connected state exposes both auto-pick fields
# ---------------------------------------------------------------------------

def test_initial_state_includes_auto_pick_fields(client):
    """
    On WebSocket connect (before draft starts), state must include
    auto_pick_timeout_seconds (the server constant) and pick_started_at=None.
    """
    session = _create_session(client)
    token = session["token"]

    with client.websocket_connect(f"/sessions/{token}/ws") as ws:
        state = ws.receive_json()["state"]
        assert "auto_pick_timeout_seconds" in state
        assert state["auto_pick_timeout_seconds"] == draft_module.AUTO_PICK_SECONDS
        assert state["pick_started_at"] is None


# ---------------------------------------------------------------------------
# Test 2: pick_started_at is set when the draft starts
# ---------------------------------------------------------------------------

def test_pick_started_at_set_when_draft_starts(client):
    session = _create_session(client)
    token = session["token"]
    admin_token = session["admin_token"]

    _join(client, token, "Alice")
    _join(client, token, "Bob")

    with client.websocket_connect(f"/sessions/{token}/ws") as ws:
        ws.receive_json()  # connected

        _start(client, token, admin_token)
        msg = ws.receive_json()

        assert msg["event"] == "draft_started"
        assert msg["state"]["pick_started_at"] is not None


# ---------------------------------------------------------------------------
# Test 3: pick_started_at is refreshed after each manual pick
# ---------------------------------------------------------------------------

def test_pick_started_at_updates_after_manual_pick(client):
    session = _create_session(client)
    token = session["token"]
    admin_token = session["admin_token"]

    _join(client, token, "Alice")
    _join(client, token, "Bob")

    with client.websocket_connect(f"/sessions/{token}/ws") as ws:
        ws.receive_json()  # connected

        _start(client, token, admin_token)
        start_msg = ws.receive_json()
        first_pick_started_at = start_msg["state"]["pick_started_at"]
        current_player_id = start_msg["state"]["current_player_id"]

        teams = client.get("/teams/").json()
        _pick(client, token, current_player_id, teams[0]["id"])
        pick_msg = ws.receive_json()

        assert pick_msg["state"]["pick_started_at"] is not None
        assert pick_msg["state"]["pick_started_at"] != first_pick_started_at


# ---------------------------------------------------------------------------
# Test 4: auto-pick fires after the timeout and broadcasts pick_made
# ---------------------------------------------------------------------------

def test_auto_pick_fires_after_timeout(client, db_setup, monkeypatch):
    """
    With a 0.2 s timeout, the server should auto-pick and broadcast
    pick_made without any manual interaction.

    db_setup is passed so we can patch AsyncSessionLocal in the draft module —
    _auto_pick uses it directly (outside FastAPI's DI), so without the patch
    it would hit a different empty in-memory DB and silently return early.
    """
    monkeypatch.setattr(draft_module, "AUTO_PICK_SECONDS", 0.2)
    monkeypatch.setattr(draft_module, "AsyncSessionLocal", db_setup)

    session = _create_session(client)
    token = session["token"]
    admin_token = session["admin_token"]

    _join(client, token, "Alice")
    _join(client, token, "Bob")

    with client.websocket_connect(f"/sessions/{token}/ws") as ws:
        ws.receive_json()  # connected

        _start(client, token, admin_token)
        ws.receive_json()  # draft_started

        # No manual pick — wait for auto-pick broadcast
        msg = ws.receive_json()
        assert msg["event"] == "pick_made"
        assert len(msg["state"]["picks"]) == 1
