import { useState } from "react";
import { BRACKET_MATCHES, BRACKET_STAGES } from "../bracketConfig";

// Build a map of bracketId → live match data, keyed by team-name pair.
// Also build a map of team name → { crest_url, player_name }
function buildMatchMap(matches, teamPlayerMap, teamMap) {
  // teamMap: name → { crest_url }
  // Returns: bracketId → resolved match info
  const byTeamPair = {};
  for (const m of matches) {
    if (!m.home_team || !m.away_team) continue;
    const key = [m.home_team.name, m.away_team.name].sort().join("|");
    byTeamPair[key] = m;
  }

  const resolved = {}; // bracketId → { home, away, score, status, winner }

  function resolveSlot(slot) {
    // slot is either a team name (string, R32) or a bracketId reference
    const cfg = BRACKET_MATCHES.find(m => m.id === slot);
    if (!cfg) {
      // It's a team name
      const team = teamMap[slot];
      return { name: slot, crest_url: team?.crest_url ?? null, player: teamPlayerMap[slot] ?? null };
    }
    // It's a bracket ref — return the winner if known, else TBD label
    const r = resolved[slot];
    if (r?.winner_name) {
      const team = teamMap[r.winner_name];
      return { name: r.winner_name, crest_url: team?.crest_url ?? null, player: teamPlayerMap[r.winner_name] ?? null, fromMatch: slot };
    }
    return { name: null, tbd: slot }; // winner not yet known
  }

  // Process in order (R32 first so R16 can reference resolved R32 winners)
  for (const cfg of BRACKET_MATCHES) {
    const homeSlot = resolveSlot(cfg.home);
    const awaySlot = resolveSlot(cfg.away);

    // Find the live match for this bracket slot
    let liveMatch = null;
    if (homeSlot.name && awaySlot.name) {
      const key = [homeSlot.name, awaySlot.name].sort().join("|");
      liveMatch = byTeamPair[key] ?? null;
    }

    let winner_name = null;
    if (liveMatch?.status === "FINISHED" && liveMatch.winner) {
      if (liveMatch.winner === "HOME_TEAM") winner_name = liveMatch.home_team.name;
      else if (liveMatch.winner === "AWAY_TEAM") winner_name = liveMatch.away_team.name;
    }

    resolved[cfg.id] = { cfg, homeSlot, awaySlot, liveMatch, winner_name };
  }

  return resolved;
}

function TeamSlot({ slot, resolved, align }) {
  if (!slot.name && slot.tbd) {
    // Show "W of X vs Y" using the bracket config
    const r = resolved[slot.tbd];
    if (r) {
      const h = r.homeSlot.name ?? "?";
      const a = r.awaySlot.name ?? "?";
      return (
        <div className={`bracket-team bracket-team-${align} bracket-tbd`}>
          <span className="bracket-tbd-label">W: {h} / {a}</span>
        </div>
      );
    }
    return <div className={`bracket-team bracket-team-${align} bracket-tbd`}><span className="bracket-tbd-label">TBD</span></div>;
  }

  return (
    <div className={`bracket-team bracket-team-${align}`}>
      {slot.crest_url && <img src={slot.crest_url} alt="" onError={e => (e.target.style.display = "none")} />}
      <div className="bracket-team-info">
        <span className="bracket-team-name">{slot.name}</span>
        {slot.player && <span className="bracket-team-player">({slot.player})</span>}
      </div>
    </div>
  );
}

function MatchCard({ bracketId, resolved }) {
  const r = resolved[bracketId];
  if (!r) return null;
  const { homeSlot, awaySlot, liveMatch } = r;
  const finished = liveMatch?.status === "FINISHED";
  const live = liveMatch?.status === "IN_PLAY";

  return (
    <div className="bracket-match">
      <TeamSlot slot={homeSlot} resolved={resolved} align="home" />
      <div className="bracket-score">
        {finished || live
          ? <span className={live ? "score-live" : ""}>{liveMatch.home_score ?? 0} – {liveMatch.away_score ?? 0}</span>
          : liveMatch
            ? <span className="score-time">{new Date(liveMatch.utc_date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            : <span className="score-time">—</span>
        }
      </div>
      <TeamSlot slot={awaySlot} resolved={resolved} align="away" />
    </div>
  );
}

export default function BracketTab({ matches, session }) {
  // Build team name → crest_url map
  const teamMap = {};
  for (const m of matches) {
    if (m.home_team) teamMap[m.home_team.name] = m.home_team;
    if (m.away_team) teamMap[m.away_team.name] = m.away_team;
  }

  // Build team name → player name map from session picks
  const teamPlayerMap = {};
  if (session) {
    const playerById = Object.fromEntries(session.players.map(p => [p.id, p.name]));
    for (const pick of session.picks) {
      // We need team name, not id — find it from matches
      for (const m of matches) {
        if (m.home_team?.id === pick.team_id) teamPlayerMap[m.home_team.name] = playerById[pick.player_id];
        if (m.away_team?.id === pick.team_id) teamPlayerMap[m.away_team.name] = playerById[pick.player_id];
      }
    }
  }

  const resolved = buildMatchMap(matches, teamPlayerMap, teamMap);

  // Determine the initial stage: first stage that has unfinished matches, or last stage
  const knockoutMatches = matches.filter(m => m.stage !== "GROUP_STAGE");
  const firstActiveStageIdx = BRACKET_STAGES.findIndex(s =>
    s.ids.some(id => {
      const r = resolved[id];
      return r?.liveMatch && r.liveMatch.status !== "FINISHED";
    })
  );
  const defaultIdx = firstActiveStageIdx >= 0 ? firstActiveStageIdx : Math.max(0,
    BRACKET_STAGES.findIndex(s => s.ids.some(id => resolved[id]?.liveMatch))
  );

  const [stageIdx, setStageIdx] = useState(defaultIdx);
  const [touchStart, setTouchStart] = useState(null);

  const currentStage = BRACKET_STAGES[stageIdx];

  function handleTouchStart(e) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e) {
    if (touchStart === null) return;
    const delta = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 50) return;
    if (delta > 0 && stageIdx < BRACKET_STAGES.length - 1) setStageIdx(stageIdx + 1);
    if (delta < 0 && stageIdx > 0) setStageIdx(stageIdx - 1);
    setTouchStart(null);
  }

  return (
    <div className="bracket-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Stage indicator dots / tabs */}
      <div className="bracket-stage-tabs">
        {BRACKET_STAGES.map((s, i) => (
          <button
            key={s.key}
            className={`bracket-stage-btn ${i === stageIdx ? "bracket-stage-active" : ""}`}
            onClick={() => setStageIdx(i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Swipe hint */}
      <div className="bracket-swipe-hint">← swipe to navigate →</div>

      {/* Match cards for current stage */}
      <div className="bracket-matches">
        {currentStage.ids.map(id => (
          <MatchCard key={id} bracketId={id} resolved={resolved} />
        ))}
      </div>
    </div>
  );
}
