import { useState, useEffect, useRef, useCallback } from "react";
import { getTeams, startDraft, makePick, openSessionSocket } from "../api";
import ResultsTab from "./ResultsTab";

export default function DraftBoard({ sessionToken, adminToken, playerId, playerName }) {
  const [teams, setTeams] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [activeTab, setActiveTab] = useState("draft");
  const wsRef = useRef(null);

  // Load teams once
  useEffect(() => {
    getTeams().then(setTeams).catch((e) => setError(e.message));
  }, []);

  // Open WebSocket and keep session state in sync
  useEffect(() => {
    if (!sessionToken) return;
    const ws = openSessionSocket(sessionToken, (msg) => {
      if (msg.state) setSession(msg.state);
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [sessionToken]);

  // Client-side countdown — derived from pick_started_at sent by the server
  useEffect(() => {
    if (!session?.pick_started_at) {
      setSecondsLeft(null);
      return;
    }
    const timeout = session.auto_pick_timeout_seconds;
    function tick() {
      const elapsed = (Date.now() - new Date(session.pick_started_at).getTime()) / 1000;
      const left = Math.max(0, Math.ceil(timeout - elapsed));
      setSecondsLeft(left);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.pick_started_at, session?.auto_pick_timeout_seconds]);

  async function handleStartDraft() {
    try {
      await startDraft(sessionToken, adminToken);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handlePick(teamId) {
    if (!session || session.current_player_id !== playerId) return;
    try {
      await makePick(sessionToken, playerId, teamId);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!session) return <div className="center-page">Connecting…</div>;

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]));
  const pickedTeamIds = new Set(session.picks.map((p) => p.team_id));
  const poolTeams = teams.filter((t) => !pickedTeamIds.has(t.id));

  const isMyTurn = session.status === "drafting" && session.current_player_id === playerId;
  const currentPlayer = session.players.find((p) => p.id === session.current_player_id);

  function picksForPlayer(pid) {
    return session.picks
      .filter((p) => p.player_id === pid)
      .sort((a, b) => a.pick_number - b.pick_number);
  }

  const totalPicks = 48;
  const picksMade = session.picks.length;

  return (
    <div className="draft-board">
      {/* Header */}
      <div className="draft-header">
        <h1>⚽ WC 2026 Draft</h1>
        <span className={`status-badge status-${session.status}`}>{session.status}</span>
        {session.status === "drafting" && (
          <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            Pick {picksMade + 1} of {totalPicks}
          </span>
        )}
        {adminToken && session.status === "waiting" && (
          <button
            className="btn-primary"
            onClick={handleStartDraft}
            disabled={session.players.length < 2}
          >
            Start Draft ({session.players.length}/4 joined)
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {["draft", "results", "leaderboard"].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "results" && <ResultsTab adminToken={adminToken} />}
      {activeTab === "leaderboard" && (
        <p style={{ color: "#64748b", padding: "16px" }}>Leaderboard coming soon.</p>
      )}

      {activeTab === "draft" && <>

      {/* Turn banner */}
      {session.status === "drafting" && currentPlayer && (
        <div className={`turn-banner ${isMyTurn ? "" : "turn-banner-waiting"}`}>
          <span>
            {isMyTurn
              ? "Your turn — click a team to pick"
              : `Waiting for ${currentPlayer.name} to pick…`}
          </span>
          {secondsLeft !== null && (
            <span className="auto-pick-timer">
              ⏱ {secondsLeft}s
            </span>
          )}
        </div>
      )}

      {session.status === "complete" && (
        <div className="turn-banner" style={{ background: "#1e3a5f", color: "#93c5fd" }}>
          Draft complete!
        </div>
      )}

      {error && (
        <div style={{ color: "#f87171", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* Waiting lobby */}
      {session.status === "waiting" && (
        <div>
          <p style={{ color: "#94a3b8", marginBottom: 12 }}>
            Waiting for players to join ({session.players.length}/4)
          </p>
          <div className="waiting-players">
            {session.players.map((p) => (
              <div key={p.id} className="player-slot filled">
                {p.name} {p.id === playerId ? "(you)" : ""}
              </div>
            ))}
            {Array.from({ length: 4 - session.players.length }).map((_, i) => (
              <div key={i} className="player-slot">Waiting for player…</div>
            ))}
          </div>
        </div>
      )}

      {/* Draft columns */}
      {session.status !== "waiting" && (
        <div className="columns">
          {/* Pool */}
          <div className="column">
            <div className="column-header">
              Available ({poolTeams.length})
            </div>
            <div className="team-list">
              {poolTeams.map((team) => (
                <div
                  key={team.id}
                  className={`team-card ${isMyTurn ? "clickable" : ""}`}
                  onClick={() => isMyTurn && handlePick(team.id)}
                >
                  {team.crest_url && (
                    <img src={team.crest_url} alt="" onError={(e) => (e.target.style.display = "none")} />
                  )}
                  <span>{team.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Player columns */}
          {session.players.map((player) => {
            const playerPicks = picksForPlayer(player.id);
            const isActive = session.current_player_id === player.id && session.status === "drafting";
            const isMe = player.id === playerId;
            const colClass = isActive && isMe ? "my-turn-col" : isActive ? "active-player" : "";
            const headerClass = isActive && isMe ? "my-turn-header" : isActive ? "active-header" : "";
            return (
              <div key={player.id} className={`column ${colClass}`}>
                <div className={`column-header ${headerClass}`}>
                  {player.name} {isMe ? "(you)" : ""} — {playerPicks.length}
                </div>
                <div className="team-list">
                  {playerPicks.map((pick) => {
                    const team = teamMap[pick.team_id];
                    return (
                      <div key={pick.pick_number} className="team-card">
                        {team?.crest_url && (
                          <img src={team.crest_url} alt="" onError={(e) => (e.target.style.display = "none")} />
                        )}
                        <span>{team?.name ?? `Team ${pick.team_id}`}</span>
                        <span className="pick-number">#{pick.pick_number + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty player slots if < 4 players */}
          {Array.from({ length: 4 - session.players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="column">
              <div className="column-header">—</div>
            </div>
          ))}
        </div>
      )}

      </>}
    </div>
  );
}
