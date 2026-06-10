// When VITE_API_URL is unset, API calls go to the same origin (production).
// When set (e.g. http://localhost:8000), used for local dev with separate servers.
const BASE = import.meta.env.VITE_API_URL || "";
const WS_BASE = BASE
  ? BASE.replace(/^http/, "ws")
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

export async function createSession() {
  const res = await fetch(`${BASE}/sessions/`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSession(token) {
  const res = await fetch(`${BASE}/sessions/${token}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function joinSession(token, name) {
  const res = await fetch(`${BASE}/sessions/${token}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startDraft(token, adminToken) {
  const res = await fetch(`${BASE}/sessions/${token}/start?admin_token=${adminToken}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function makePick(token, playerId, teamId) {
  const res = await fetch(`${BASE}/sessions/${token}/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: playerId, team_id: teamId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeams() {
  const res = await fetch(`${BASE}/teams/`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function openSessionSocket(token, onMessage) {
  const ws = new WebSocket(`${WS_BASE}/sessions/${token}/ws`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 30000);
  ws.onclose = () => clearInterval(ping);
  return ws;
}
