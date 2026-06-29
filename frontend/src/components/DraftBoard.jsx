import { useState, useEffect, useRef, useCallback } from "react";
import { getTeams, getResults, startDraft, makePick, openSessionSocket } from "../api";
import ResultsTab from "./ResultsTab";
import LeaderboardTab from "./LeaderboardTab";
import BracketTab from "./BracketTab";

const KNOCKOUT_STAGES = new Set(["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]);

// Derives a status for each team based on match data.
// Green  = has at least one non-FINISHED match (confirmed upcoming/live)
// Red    = lost a knockout match and has no upcoming fixture (definitively eliminated)
// Neutral = everything else, including:
//   - teams that won their last knockout match but have no next fixture yet scheduled
//     (common mid-tournament when next round fixtures aren't published yet)
//   - teams only seen in GROUP_STAGE (group elimination requires complex table logic
//     including best-3rd-place rules, so we don't attempt to detect it here)
//   - teams with no match data at all
function deriveTeamStatuses(matches) {
  const hasUpcoming = new Set();
  const knockoutLosers = new Set();

  for (const m of matches) {
    if (m.status !== "FINISHED") {
      if (m.home_team?.id) hasUpcoming.add(m.home_team.id);
      if (m.away_team?.id) hasUpcoming.add(m.away_team.id);
    } else if (KNOCKOUT_STAGES.has(m.stage) && m.winner && m.winner !== "DRAW") {
      const loserId = m.winner === "HOME_TEAM" ? m.away_team?.id : m.home_team?.id;
      if (loserId) knockoutLosers.add(loserId);
    }
  }

  return { hasUpcoming, knockoutLosers };
}

function teamStatusClass(teamId, { hasUpcoming, knockoutLosers }) {
  if (hasUpcoming.has(teamId)) return "team-active";
  if (knockoutLosers.has(teamId)) return "team-eliminated";
  return "";
}

export default function DraftBoard({ sessionToken, adminToken, playerId, playerName }) {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [activeTab, setActiveTab] = useState("draft");
  const wsRef = useRef(null);

  // Load teams and matches once
  useEffect(() => {
    getTeams().then(setTeams).catch((e) => setError(e.message));
    getResults().then(setMatches).catch(() => {});
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

  // Close WebSocket once draft is complete — no further events will be broadcast
  useEffect(() => {
    if (session?.status === "complete" && wsRef.current) {
      wsRef.current.close();
    }
  }, [session?.status]);

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
  const teamStatuses = deriveTeamStatuses(matches);

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
        {session.status === "drafting" && (
          <span style={{ fontSize: "0.85rem", color: "#8ba0bb" }}>
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
        {["draft", "results", "fixtures", "bracket", "leaderboard"].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "results" && <ResultsTab adminToken={adminToken} session={session} mode="results" matches={matches} onMatchesUpdated={setMatches} />}
      {activeTab === "fixtures" && <ResultsTab adminToken={adminToken} session={session} mode="fixtures" matches={matches} onMatchesUpdated={setMatches} />}
      {activeTab === "bracket" && <BracketTab matches={matches} session={session} />}
      {activeTab === "leaderboard" && <LeaderboardTab sessionToken={sessionToken} />}

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
        <div className="turn-banner turn-banner-complete">
          Draft complete!
        </div>
      )}

      {error && (
        <div style={{ color: "#f87171", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* Waiting lobby */}
      {session.status === "waiting" && (
        <div>
          <p style={{ color: "#8ba0bb", marginBottom: 12 }}>
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
        <div
          className="columns"
          style={session.status === "complete" ? { gridTemplateColumns: "repeat(4, minmax(120px, 1fr))" } : undefined}
        >
          {/* Pool — hidden once draft is complete */}
          {session.status !== "complete" && (
          <div className="column">
            <div className="column-header">
              Available ({poolTeams.length})
            </div>
            <div className="team-list">
              {poolTeams.map((team) => (
                <div
                  key={team.id}
                  className={`team-card ${isMyTurn ? "clickable" : ""} ${teamStatusClass(team.id, teamStatuses)}`}
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
          )}

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
                      <div key={pick.pick_number} className={`team-card ${teamStatusClass(pick.team_id, teamStatuses)}`}>
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
