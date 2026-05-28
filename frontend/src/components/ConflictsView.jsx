import React, { useState } from "react";
import { apiJson } from "../api";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function ConflictsView({ feature, onUpdated, currentUser }) {
  const [resolvingId, setResolvingId] = useState(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canResolve = currentUser && WRITE_ROLES.includes(currentUser.role);
  const conflicts = feature.conflicts || [];
  const open = conflicts.filter(c => !c.resolved);
  const resolved = conflicts.filter(c => c.resolved);

  async function handleResolve(cid) {
    setSubmitting(true);
    try {
      const updatedC = await apiJson(`/features/${feature.id}/conflicts/${cid}/resolve`, {
        method: "PUT",
        body: JSON.stringify({ resolution }),
      });
      const newConflicts = conflicts.map(c => c.id === cid ? updatedC : c);
      onUpdated({ ...feature, conflicts: newConflicts });
      setResolvingId(null);
      setResolution("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Conflicts</h2>
      <div style={styles.note}>
        Contradictions flagged automatically by Master LLM (or manually). Resolve them to keep ground truth clean.
      </div>

      {conflicts.length === 0 && (
        <div style={styles.empty}>No conflicts on this feature. ✨</div>
      )}

      {open.length > 0 && (
        <section>
          <p style={styles.sectionLabel}>Open ({open.length})</p>
          {open.map(c => (
            <div key={c.id} style={{ ...styles.card, borderLeft: "3px solid var(--red)" }}>
              <div style={styles.meta}>
                <span style={styles.id}>{c.id}</span>
                {c.auto_detected && <span style={styles.autoBadge}>auto-detected</span>}
                <span style={{ color: "var(--text-muted)" }}>· flagged by {c.flagged_by} · {new Date(c.flagged_at).toLocaleString()}</span>
              </div>
              <p style={styles.desc}>{c.description}</p>

              {resolvingId === c.id ? (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    placeholder="How is this resolved?"
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    style={{ minHeight: 60 }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn-ghost" onClick={() => setResolvingId(null)}>Cancel</button>
                    <button className="btn-primary" onClick={() => handleResolve(c.id)} disabled={submitting || !resolution}>
                      {submitting ? "Saving…" : "Mark Resolved"}
                    </button>
                  </div>
                </div>
              ) : canResolve ? (
                <button
                  className="btn-secondary"
                  style={{ marginTop: 8, fontSize: 12 }}
                  onClick={() => { setResolvingId(c.id); setResolution(""); }}
                >
                  Resolve
                </button>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <p style={styles.sectionLabel}>Resolved ({resolved.length})</p>
          {resolved.map(c => (
            <div key={c.id} style={{ ...styles.card, opacity: 0.7 }}>
              <div style={styles.meta}>
                <span style={styles.id}>{c.id}</span>
                <span className="badge-answered">resolved</span>
                <span style={{ color: "var(--text-muted)" }}>· {new Date(c.flagged_at).toLocaleString()}</span>
              </div>
              <p style={styles.desc}>{c.description}</p>
              {c.resolution && (
                <div style={styles.resolution}>
                  <span style={{ fontSize: 11, color: "var(--accent2)", fontWeight: 600 }}>RESOLUTION</span>
                  <p style={{ marginTop: 4 }}>{c.resolution}</p>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: 14 },
  title: { fontSize: 16, fontWeight: 600 },
  note: { fontSize: 12, color: "var(--text-muted)" },
  sectionLabel: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  empty: {
    background: "var(--surface)",
    border: "1px dashed var(--border)",
    borderRadius: "var(--radius)",
    padding: "30px 20px",
    textAlign: "center",
    color: "var(--text-muted)",
  },
  card: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
    marginBottom: 10,
  },
  meta: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 },
  id: { fontWeight: 600, color: "var(--text)" },
  desc: { fontSize: 13, lineHeight: 1.6 },
  autoBadge: {
    background: "#3a2e0a",
    color: "#facc15",
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 99,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resolution: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 13,
  },
};
