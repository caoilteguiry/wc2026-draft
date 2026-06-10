import { useState, useEffect } from "react";
import JoinScreen from "./components/JoinScreen";
import DraftBoard from "./components/DraftBoard";
import { createSession } from "./api";
import "./App.css";

export default function App() {
  const [phase, setPhase] = useState("loading");
  const [sessionToken, setSessionToken] = useState(null);
  const [adminToken, setAdminToken] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState(null);
  const [inviteUrl, setInviteUrl] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session");
    const admin = params.get("admin");
    const playerParam = params.get("player");
    const nameParam = params.get("pname");

    if (session) {
      setSessionToken(session);
      if (admin) setAdminToken(admin);
      // URL params take priority (enables cross-device sharing); fall back to localStorage
      const savedId = playerParam || localStorage.getItem(`pid_${session}`);
      const savedName = nameParam || localStorage.getItem(`pname_${session}`);
      if (savedId) {
        setPlayerId(parseInt(savedId));
        setPlayerName(savedName);
        setPhase("draft");
      } else {
        setPhase("join");
      }
    } else {
      setPhase("home");
    }
  }, []);

  function handleJoined(id, name) {
    localStorage.setItem(`pid_${sessionToken}`, id);
    localStorage.setItem(`pname_${sessionToken}`, name);
    setPlayerId(id);
    setPlayerName(name);
    // Embed player identity in URL so it can be bookmarked / opened on another device
    const params = new URLSearchParams(window.location.search);
    params.set("player", id);
    params.set("pname", name);
    window.history.replaceState({}, "", `?${params.toString()}`);
    setPhase("draft");
  }

  async function handleCreateSession() {
    try {
      const data = await createSession();
      const inviteUrl = `${window.location.origin}${data.invite_url}`;
      const adminUrl = `${window.location.origin}${data.admin_url}`;
      window.history.replaceState({}, "", data.admin_url);
      setSessionToken(data.token);
      setAdminToken(data.admin_token);
      setInviteUrl(inviteUrl);
      setPhase("join");
    } catch (e) {
      alert(`Error creating session: ${e.message}`);
    }
  }

  if (phase === "loading") return <div className="center-page">Loading…</div>;

  if (phase === "home") {
    return (
      <div className="center-page">
        <h1>⚽ WC 2026 Draft</h1>
        <p>Create a session, share the invite link, and draft your teams.</p>
        <button className="btn-primary" onClick={handleCreateSession}>
          Create Draft Session
        </button>
      </div>
    );
  }

  if (phase === "join") {
    return (
      <JoinScreen
        sessionToken={sessionToken}
        adminToken={adminToken}
        inviteUrl={inviteUrl}
        onJoined={handleJoined}
      />
    );
  }

  return (
    <DraftBoard
      sessionToken={sessionToken}
      adminToken={adminToken}
      playerId={playerId}
      playerName={playerName}
    />
  );
}
