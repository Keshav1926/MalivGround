import React, { useState } from "react";
import { setToken, apiJson } from "../api";

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleLogin} style={styles.card}>
        <div style={styles.brand}>🗂 Maliv-Ground</div>
        <div style={styles.tagline}>Sign in to your team's ground truth.</div>

        <div style={styles.field}>
          <label style={styles.label}>Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
            autoComplete="username"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 6 }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div style={styles.hint}>
          First run? Check the server console for the auto-generated <code>admin</code> credentials.
        </div>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "30px 30px",
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  brand: { fontSize: 20, fontWeight: 700, letterSpacing: 0.3 },
  tagline: { color: "var(--text-muted)", fontSize: 13, marginBottom: 8 },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  hint: {
    fontSize: 11,
    color: "var(--text-muted)",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    marginTop: 6,
    lineHeight: 1.5,
  },
};
