import { useState, useEffect } from "react";
import { getLeaderboard } from "../api";

const RANK_COLOURS = { 1: "#f5a623", 2: "#a8b8cc", 3: "#cd7c4a" };

// Points per category — must match backend CATEGORY_POINTS
const CAT_PTS = {
  gw: 3, gd: 1, gl: 0, last32w: 5, last16w: 8,
  qfw: 11, sfw: 14, third: -5, fourth: -10, fw: 20,
};

const CAT_LABELS = {
  gw: "GW", gd: "GD", gl: "GL",
  last32w: "32W", last16w: "16W",
  qfw: "QW", sfw: "SW",
  third: "3rd", fourth: "4th", fw: "FW",
};

function pts(n) {
  return n > 0 ? `+${n}` : String(n);
}

function PointsFormula({ breakdown }) {
  const terms = Object.entries(breakdown)
    .filter(([k, v]) => v > 0 && CAT_PTS[k] !== 0)
    .map(([k, v]) => `(${CAT_PTS[k]}×${v})`);

  // Fourth place is a special case: non-zero count but 0 multiplier would be filtered above,
  // but fourth has a negative multiplier so it passes the v > 0 check correctly.
  // gl also has 0 pts so it is correctly excluded from the formula.

  const total = Object.entries(breakdown).reduce(
    (sum, [k, v]) => sum + CAT_PTS[k] * v, 0
  );

  if (terms.length === 0) return <span className="lb-formula">0 pts</span>;
  return (
    <span className="lb-formula">
      {terms.join(" + ")} = {total} pts
    </span>
  );
}

function TeamBreakdown({ breakdown }) {
  const cats = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (cats.length === 0) {
    return <div className="lb-breakdown-empty">No points yet</div>;
  }
  return (
    <div className="lb-breakdown">
      <div className="lb-breakdown-stats">
        {cats.map(([k, v]) => (
          <div key={k} className="lb-breakdown-stat">
            <span className="lb-breakdown-label">{CAT_LABELS[k]}</span>
            <span className="lb-breakdown-value">{v}</span>
          </div>
        ))}
      </div>
      <PointsFormula breakdown={breakdown} />
    </div>
  );
}

export default function LeaderboardTab({ sessionToken }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedPlayers, setExpandedPlayers] = useState(new Set());
  const [expandedTeams, setExpandedTeams] = useState(new Set());

  useEffect(() => {
    setData(null);
    setError(null);
    setExpandedPlayers(new Set());
    setExpandedTeams(new Set());
    getLeaderboard(sessionToken)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [sessionToken]);

  function togglePlayer(playerId) {
    setExpandedPlayers((prev) => {
      const next = new Set(prev);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  }

  function toggleTeam(teamId) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  if (error) return <p style={{ color: "#f87171", padding: "16px" }}>{error}</p>;
  if (!data) return <p style={{ color: "#4e6580", padding: "16px" }}>Loading…</p>;

  return (
    <div className="leaderboard-tab">
      {data.map((entry) => {
        const playerOpen = expandedPlayers.has(entry.player_id);
        return (
          <div key={entry.player_id} className="lb-player">
            {/* Level 1: player header */}
            <div className="lb-player-header lb-player-header-toggle" onClick={() => togglePlayer(entry.player_id)}>
              <span className="lb-rank" style={{ color: RANK_COLOURS[entry.rank] ?? "#4e6580" }}>
                #{entry.rank}
              </span>
              <span className="lb-name">{entry.player_name}</span>
              <span className="lb-total">{entry.total} pts</span>
              <span className="lb-chevron">{playerOpen ? "▾" : "▸"}</span>
            </div>

            {/* Level 2: team list */}
            {playerOpen && (
              <div className="lb-teams">
                {entry.teams.map((team) => {
                  const teamOpen = expandedTeams.has(team.team_id);
                  return (
                    <div key={team.team_id}>
                      <div className="lb-team-row lb-team-row-toggle" onClick={() => toggleTeam(team.team_id)}>
                        {team.crest_url && (
                          <img src={team.crest_url} alt="" onError={(e) => (e.target.style.display = "none")} />
                        )}
                        <span className="lb-team-name">{team.team_name}</span>
                        <span className="lb-team-played">{team.matches_played}g</span>
                        <span
                          className="lb-team-pts"
                          style={{ color: team.points < 0 ? "#f87171" : team.points > 0 ? "#86efac" : "#4e6580" }}
                        >
                          {pts(team.points)}
                        </span>
                        <span className="lb-chevron">{teamOpen ? "▾" : "▸"}</span>
                      </div>

                      {/* Level 3: stat breakdown */}
                      {teamOpen && <TeamBreakdown breakdown={team.breakdown} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
