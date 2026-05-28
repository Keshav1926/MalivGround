import React, { useState } from "react";
import { apiJson } from "../api";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function FeatureList({ features, selected, onSelect, onCreated, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canCreate = currentUser && WRITE_ROLES.includes(currentUser.role);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const created = await apiJson("/features", {
        method: "POST",
        body: JSON.stringify({ title, spec_content: spec }),
      });
      onCreated(created);
      setTitle(""); setSpec("");
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.logo}>🗂 Maliv-Ground</span>
        {canCreate && (
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(v => !v)}>
            {showForm ? "Cancel" : "+ New"}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <form onSubmit={handleCreate} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. User Auth Redesign" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Initial Spec</label>
            <textarea value={spec} onChange={e => setSpec(e.target.value)} required placeholder="Describe the feature..." style={{ minHeight: 80 }} />
          </div>
          {error && <p style={{ color: "var(--red)", fontSize: 12 }}>{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Feature"}
          </button>
        </form>
      )}

      <div style={styles.list}>
        {features.length === 0 && (
          <p style={{ color: "var(--text-muted)", padding: "16px", fontSize: 13 }}>
            {canCreate ? "No features yet. Create one above." : "No features yet."}
          </p>
        )}
        {features.map(f => (
          <div
            key={f.id}
            style={{ ...styles.item, background: selected?.id === f.id ? "var(--surface2)" : "transparent" }}
            onClick={() => onSelect(f)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{f.title}</span>
              <span className="badge-active">{f.status}</span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{f.id}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 260,
    minWidth: 260,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },
  logo: { fontWeight: 700, fontSize: 14, letterSpacing: 0.3 },
  form: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  list: { flex: 1, overflowY: "auto", padding: "8px 0" },
  item: {
    padding: "10px 16px",
    cursor: "pointer",
    borderRadius: 0,
    transition: "background 0.1s",
  },
};
