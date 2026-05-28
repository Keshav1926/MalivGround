import React, { useState, useEffect } from "react";
import { apiJson } from "../api";

export default function SettingsPanel({ user, onClose }) {
  const [tab, setTab] = useState("keys");
  const isAdmin = user.role === "admin";

  const tabs = [
    { key: "keys", label: "API Keys" },
    { key: "password", label: "Change Password" },
    ...(isAdmin ? [{ key: "users", label: "Users" }] : []),
  ];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Settings</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={styles.tabs}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto" }}>
          {tab === "keys" && <ApiKeysTab user={user} />}
          {tab === "password" && <ChangePasswordTab />}
          {tab === "users" && isAdmin && <UsersTab currentUser={user} />}
        </div>
      </div>
    </div>
  );
}

function ApiKeysTab({ user }) {
  const [keys, setKeys] = useState([]);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState(null); // { id, key, label }
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setKeys(await apiJson("/auth/api-keys"));
    } catch {}
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiJson("/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setCreated(data);
      setLabel("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm("Revoke this API key? Any service using it will lose access.")) return;
    await apiJson(`/auth/api-keys/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={styles.note}>
        API keys let MCP clients (Claude Code, Cursor, Codex CLI) authenticate as you. Set the key as
        the <code style={styles.code}>MALIV_API_KEY</code> environment variable in the MCP server config.
      </div>

      <form onSubmit={handleCreate} style={styles.form}>
        <input
          placeholder="Key label (e.g. claude-code on laptop)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          required
        />
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create Key"}
        </button>
      </form>

      {created && (
        <div style={styles.createdBox}>
          <div style={{ fontSize: 11, color: "var(--yellow)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
            ⚠ Copy this now — you won't see it again
          </div>
          <div style={styles.keyValue}>{created.key}</div>
          <button className="btn-secondary" style={{ marginTop: 8, fontSize: 11 }} onClick={() => navigator.clipboard.writeText(created.key)}>
            Copy
          </button>
          <button className="btn-ghost" style={{ marginTop: 8, marginLeft: 6, fontSize: 11 }} onClick={() => setCreated(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div>
        <p style={styles.sectionLabel}>Active keys ({keys.length})</p>
        {keys.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No keys yet.</p>}
        {keys.map(k => (
          <div key={k.id} style={styles.keyRow}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{k.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                id: <code style={styles.code}>{k.id}</code> · created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used_at && ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`}
              </div>
            </div>
            <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => handleRevoke(k.id)}>Revoke</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLES = ["pa", "lead", "dev", "qa", "admin"];

function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("dev");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    try {
      setUsers(await apiJson("/auth/users"));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setErr(""); setMsg(""); setBusy(true);
    try {
      await apiJson("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      });
      setMsg(`User '${username}' created with role '${role}'`);
      setUsername(""); setPassword(""); setRole("dev");
      setShowForm(false);
      refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(userId, uname) {
    if (!confirm(`Delete user '${uname}'? This cannot be undone.`)) return;
    try {
      await apiJson(`/auth/users/${userId}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={styles.note}>
        Manage team members. Roles control what they can do — see README for the full permissions matrix.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={styles.sectionLabel}>Users ({users.length})</p>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => { setShowForm(v => !v); setErr(""); setMsg(""); }}>
          {showForm ? "Cancel" : "+ New User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={styles.formBox}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="off" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Initial password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button className="btn-primary" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Creating…" : "Create User"}
          </button>
        </form>
      )}

      {msg && <p style={{ color: "var(--green)", fontSize: 12 }}>{msg}</p>}
      {err && <p style={{ color: "var(--red)", fontSize: 12 }}>{err}</p>}

      <div>
        {users.map(u => (
          <div key={u.id} style={styles.keyRow}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{u.username}</span>
                <span style={styles.roleBadge}>{u.role}</span>
                {u.id === currentUser.id && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(you)</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                created {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            {u.id !== currentUser.id && (
              <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => handleDelete(u.id, u.username)}>Delete</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


function ChangePasswordTab() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null); setErr(""); setBusy(true);
    try {
      await apiJson("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      setMsg("Password updated.");
      setOldPw(""); setNewPw("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
      <div style={styles.field}>
        <label style={styles.label}>Current password</label>
        <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} required />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>New password</label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} />
      </div>
      {msg && <p style={{ color: "var(--green)", fontSize: 12 }}>{msg}</p>}
      {err && <p style={{ color: "var(--red)", fontSize: 12 }}>{err}</p>}
      <button className="btn-primary" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Saving…" : "Update Password"}
      </button>
    </form>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  panel: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    width: "min(680px, 92vw)",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 24px",
    borderBottom: "1px solid var(--border)",
  },
  tabs: {
    display: "flex",
    gap: 4,
    padding: "0 24px",
    borderBottom: "1px solid var(--border)",
  },
  tab: {
    background: "transparent",
    color: "var(--text-muted)",
    padding: "10px 14px",
    borderRadius: "6px 6px 0 0",
    fontWeight: 500,
    fontSize: 13,
  },
  tabActive: {
    color: "var(--text)",
    borderBottom: "2px solid var(--accent)",
  },
  note: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    lineHeight: 1.6,
  },
  form: {
    display: "flex",
    gap: 8,
  },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionLabel: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  keyRow: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  createdBox: {
    background: "#3a2e0a",
    border: "1px solid var(--yellow)",
    borderRadius: 8,
    padding: "12px 14px",
  },
  keyValue: {
    fontFamily: "monospace",
    fontSize: 12,
    background: "rgba(0,0,0,0.3)",
    padding: "8px 10px",
    borderRadius: 6,
    wordBreak: "break-all",
    color: "#fde68a",
  },
  code: {
    background: "var(--surface2)",
    padding: "1px 5px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 11,
  },
  formBox: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  roleBadge: {
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 99,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--accent2)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
};
