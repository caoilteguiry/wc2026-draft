import { useState, useEffect } from "react";
import { getResults, syncResults } from "../api";

const STAGE_ORDER = [
  "GROUP_STAGE",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

const STAGE_LABELS = {
  GROUP_STAGE: "Group Stage",
  ROUND_OF_32: "Round of 32",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "3rd Place",
  FINAL: "Final",
};

function formatDate(utcString) {
  return new Date(utcString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const badges = {
    FINISHED:  { background: "#1e293b", color: "#64748b",  label: "FT"         },
    IN_PLAY:   { background: "#166534", color: "#86efac",  label: "LIVE"       },
    POSTPONED: { background: "#451a03", color: "#fcd34d",  label: "POSTPONED"  },
  };
  const badge = badges[status];
  if (!badge) return null;  // SCHEDULED / TIMED — time shown instead
  return (
    <span style={{ ...badge, padding: "2px 8px", borderRadius: 12, fontSize: "0.7rem", fontWeight: 700 }}>
      {badge.label}
    </span>
  );
}

function MatchRow({ match }) {
  const home = match.home_team;
  const away = match.away_team;
  const finished = match.status === "FINISHED";
  const live = match.status === "IN_PLAY";

  return (
    <div className="match-row">
      <div className="match-team match-team-home">
        {home?.crest_url && <img src={home.crest_url} alt="" onError={e => e.target.style.display = "none"} />}
        <span>{home?.name ?? "TBD"}</span>
      </div>

      <div className="match-score">
        {finished || live
          ? <span className={live ? "score-live" : ""}>{match.home_score ?? 0} – {match.away_score ?? 0}</span>
          : <span className="score-time">{formatDate(match.utc_date)}</span>
        }
        <StatusBadge status={match.status} />
      </div>

      <div className="match-team match-team-away">
        {away?.crest_url && <img src={away.crest_url} alt="" onError={e => e.target.style.display = "none"} />}
        <span>{away?.name ?? "TBD"}</span>
      </div>
    </div>
  );
}

export default function ResultsTab({ adminToken }) {
  const [matches, setMatches] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  useEffect(() => {
    getResults().then(setMatches).catch(e => setError(e.message));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await syncResults(adminToken);
      const fresh = await getResults();
      setMatches(fresh);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  // Group by stage in display order
  const grouped = STAGE_ORDER.reduce((acc, stage) => {
    const ms = matches.filter(m => m.stage === stage);
    if (ms.length) acc.push({ stage, matches: ms });
    return acc;
  }, []);

  return (
    <div className="results-tab">
      <div className="results-toolbar">
        {adminToken && (
          <button className="btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync Results"}
          </button>
        )}
        {lastSynced && <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Last synced {lastSynced}</span>}
        {error && <span style={{ color: "#f87171", fontSize: "0.8rem" }}>{error}</span>}
      </div>

      {matches.length === 0 && !error && (
        <p style={{ color: "#64748b", padding: "16px" }}>
          No results yet.{adminToken ? " Click Sync Results to fetch fixtures." : ""}
        </p>
      )}

      {grouped.map(({ stage, matches: ms }) => (
        <div key={stage} className="stage-group">
          <div className="stage-header">{STAGE_LABELS[stage] ?? stage}</div>
          {ms.map(m => <MatchRow key={m.id} match={m} />)}
        </div>
      ))}
    </div>
  );
}
