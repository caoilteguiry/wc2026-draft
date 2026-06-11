import { useState, useEffect } from "react";
import { getLeaderboard } from "../api";

function pts(n) {
  return n > 0 ? `+${n}` : String(n);
}

export default function LeaderboardTab({ sessionToken }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getLeaderboard(sessionToken)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [sessionToken]);

  if (error) {
    return <p style={{ color: "#f87171", padding: "16px" }}>{error}</p>;
  }

  if (!data) {
    return <p style={{ color: "#64748b", padding: "16px" }}>Loading…</p>;
  }

  return (
    <div className="leaderboard-tab">
      {data.map((entry) => (
        <div key={entry.player_id} className="lb-player">
          <div className="lb-player-header">
            <span className="lb-rank">#{entry.rank}</span>
            <span className="lb-name">{entry.player_name}</span>
            <span className="lb-total">{entry.total} pts</span>
          </div>

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
                  style={{ color: team.points < 0 ? "#f87171" : team.points > 0 ? "#86efac" : "#64748b" }}
                >
                  {pts(team.points)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
