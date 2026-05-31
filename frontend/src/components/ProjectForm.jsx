import React, { useState } from "react";
import { apiJson } from "../api";

export default function ProjectForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const project = await apiJson("/projects", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      onCreated(project);
      setTitle(""); setDescription("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.field}>
        <label style={styles.label}>Project title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. User Onboarding" autoFocus />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Description (optional)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project about?" style={{ minHeight: 60 }} />
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create Project"}
        </button>
      </div>
    </form>
  );
}

const styles = {
  form: {
    padding: "12px 16px",
    background: "var(--surface2)",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
};
