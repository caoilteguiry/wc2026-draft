import { useState, useEffect } from "react";
import { getLeaderboard } from "../api";

function pts(n) {
  return n > 0 ? `+${n}` : String(n);
}

const RANK_COLOURS = {
  1: "#f5a623", // gold
  2: "#a8b8cc", // silver
  3: "#cd7c4a", // bronze
};

export default function LeaderboardTab({ sessionToken }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    setData(null);
    setError(null);
    setExpanded(new Set());
    getLeaderboard(sessionToken)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [sessionToken]);

  function toggle(playerId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  }

  if (error) {
    return <p style={{ color: "#f87171", padding: "16px" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "#4e6580", padding: "16px" }}>Loading…</p>;
  }

  return (
    <div className="leaderboard-tab">
      {data.map((entry) => {
        const isOpen = expanded.has(entry.player_id);
        return (
          <div key={entry.player_id} className="lb-player">
            <div className="lb-player-header lb-player-header-toggle" onClick={() => toggle(entry.player_id)}>
              <span className="lb-rank" style={{ color: RANK_COLOURS[entry.rank] ?? "#4e6580" }}>
                #{entry.rank}
              </span>
              <span className="lb-name">{entry.player_name}</span>
              <span className="lb-total">{entry.total} pts</span>
              <span className="lb-chevron">{isOpen ? "▾" : "▸"}</span>
            </div>

            {isOpen && (
              <div className="lb-teams">
                {entry.teams.map((team) => (
                  <div key={team.team_id} className="lb-team-row">
                    {team.crest_url && (
                      <img
                        src={team.crest_url}
                        alt=""
                        onError={(e) => (e.target.style.display = "none")}
                      />
                    )}
                    <span className="lb-team-name">{team.team_name}</span>
                    <span className="lb-team-played">{team.matches_played}g</span>
                    <span
                      className="lb-team-pts"
                      style={{ color: team.points < 0 ? "#f87171" : team.points > 0 ? "#86efac" : "#4e6580" }}
                    >
                      {pts(team.points)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
