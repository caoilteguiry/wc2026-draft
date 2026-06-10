"""
WebSocket broadcast tests for the draft system.

Written before any fix is applied — expected to expose the bug where the
admin (first connected client) does not receive player_joined broadcasts
from subsequent joiners.
"""


def _create_session(client):
    r = client.post("/sessions/")
    assert r.status_code == 200
    return r.json()


def _join(client, token, name):
    r = client.post(f"/sessions/{token}/join", json={"name": name})
    assert r.status_code == 200
    return r.json()


# ---------------------------------------------------------------------------
# Test 1: all connected clients receive player_joined broadcasts
# ---------------------------------------------------------------------------

def test_all_connected_clients_receive_player_joined(client):
    """
    Given two WebSocket clients already connected,
    when a new player joins via HTTP,
    both clients should receive the player_joined broadcast.
    """
    session = _create_session(client)
    token = session["token"]

    with client.websocket_connect(f"/sessions/{token}/ws") as ws1, \
         client.websocket_connect(f"/sessions/{token}/ws") as ws2:

        # Consume the initial "connected" state sent on connect
        assert ws1.receive_json()["event"] == "connected"
        assert ws2.receive_json()["event"] == "connected"

        _join(client, token, "Alice")

        msg1 = ws1.receive_json()
        msg2 = ws2.receive_json()

        assert msg1["event"] == "player_joined"
        assert msg2["event"] == "player_joined"
        assert len(msg1["state"]["players"]) == 1
        assert len(msg2["state"]["players"]) == 1


# ---------------------------------------------------------------------------
# Test 2: admin receives updates from all subsequent joiners
# ---------------------------------------------------------------------------

def test_admin_receives_all_player_joined_updates(client):
    """
    The admin connects first (oldest WebSocket connection).
    When players 2, 3, and 4 join via HTTP, the admin must receive
    a player_joined broadcast for each one.

    This is the specific scenario that was failing in production:
    the admin saw a stale player count after other players joined.
    """
    session = _create_session(client)
    token = session["token"]

    with client.websocket_connect(f"/sessions/{token}/ws") as admin_ws:
        assert admin_ws.receive_json()["event"] == "connected"

        # Admin joins
        _join(client, token, "Admin")
        msg = admin_ws.receive_json()
        assert msg["event"] == "player_joined"
        assert len(msg["state"]["players"]) == 1

        # Player 2 joins — admin must see the update
        _join(client, token, "Player2")
        msg = admin_ws.receive_json()
        assert msg["event"] == "player_joined", \
            "Admin did not receive player_joined for Player2"
        assert len(msg["state"]["players"]) == 2

        # Player 3 joins
        _join(client, token, "Player3")
        msg = admin_ws.receive_json()
        assert msg["event"] == "player_joined", \
            "Admin did not receive player_joined for Player3"
        assert len(msg["state"]["players"]) == 3

        # Player 4 joins
        _join(client, token, "Player4")
        msg = admin_ws.receive_json()
        assert msg["event"] == "player_joined", \
            "Admin did not receive player_joined for Player4"
        assert len(msg["state"]["players"]) == 4


# ---------------------------------------------------------------------------
# Test 3: disconnected WebSocket is cleaned up; remaining clients still
#         receive broadcasts
# ---------------------------------------------------------------------------

def test_disconnected_client_is_removed_from_broadcast_list(client):
    """
    When a WebSocket client disconnects, it should be removed from the
    connection manager. Subsequent broadcasts to other clients should
    succeed without errors.
    """
    session = _create_session(client)
    token = session["token"]

    with client.websocket_connect(f"/sessions/{token}/ws") as persistent_ws:
        assert persistent_ws.receive_json()["event"] == "connected"

        # A second client connects then immediately disconnects
        with client.websocket_connect(f"/sessions/{token}/ws") as short_ws:
            assert short_ws.receive_json()["event"] == "connected"
        # short_ws is now closed

        # A player joins — the persistent client must still receive the broadcast
        # even though the disconnected client is in (or was in) the manager
        _join(client, token, "Alice")
        msg = persistent_ws.receive_json()
        assert msg["event"] == "player_joined"
        assert len(msg["state"]["players"]) == 1
