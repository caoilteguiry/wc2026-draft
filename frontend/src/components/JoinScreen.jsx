import { useState } from "react";
import { joinSession } from "../api";

export default function JoinScreen({ sessionToken, adminToken, inviteUrl, onJoined }) {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await joinSession(sessionToken, name.trim());
      onJoined(data.player_id, data.name);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="center-page">
      <h1>⚽ WC 2026 Draft</h1>

      {inviteUrl && (
        <div style={{
          background: "#131c2e",
          border: "1px solid #1d2d44",
          borderRadius: 10,
          padding: "16px 20px",
          width: "100%",
          maxWidth: 480,
          textAlign: "left",
        }}>
          <p style={{ fontSize: "0.85rem", color: "#8ba0bb", marginBottom: 8 }}>
            Share this invite link with the other 3 players:
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={inviteUrl}
              style={{
                flex: 1,
                padding: "8px 10px",
                fontSize: "0.85rem",
                background: "#0b0f1a",
                border: "1px solid #1d2d44",
                borderRadius: 6,
                color: "#e8edf5",
              }}
              onFocus={(e) => e.target.select()}
            />
            <button className="btn-secondary" onClick={handleCopy} style={{ whiteSpace: "nowrap" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 8 }}>Enter your name to join</h2>
      <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoFocus
          style={{
            padding: "8px 12px",
            fontSize: 16,
            background: "#131c2e",
            border: "1px solid #1d2d44",
            borderRadius: 6,
            color: "#e8edf5",
          }}
        />
        {error && <p style={{ color: "#f87171", margin: 0, fontSize: "0.85rem" }}>{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading || !name.trim()}>
          {loading ? "Joining…" : "Join Draft"}
        </button>
      </form>
    </div>
  );
}
