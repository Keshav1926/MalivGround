import React, { useState } from "react";
import { apiJson, api } from "../api";
import SpecFilesList from "./SpecFilesList";
import MarkdownReader from "./MarkdownReader";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function SpecEditor({ feature, onUpdated, currentUser }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(feature.spec.current);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [readingFile, setReadingFile] = useState(null);  // filename string when active

  const canEdit = currentUser && WRITE_ROLES.includes(currentUser.role);

  // When reading a markdown file, swap the whole spec view
  if (readingFile) {
    return (
      <MarkdownReader
        featureId={feature.id}
        filename={readingFile}
        onBack={() => setReadingFile(null)}
      />
    );
  }

  async function handleSave() {
    setLoading(true);
    try {
      const updated = await apiJson(`/features/${feature.id}/spec`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setContent(feature.spec.current);
    setEditing(false);
  }

  const versions = feature.spec.versions || [];
  const warnings = feature.spec.viability_warnings || [];

  async function handleRecheck() {
    await api(`/features/${feature.id}/recheck`, { method: "POST" });
    setTimeout(async () => {
      try {
        const fresh = await apiJson(`/features/${feature.id}`);
        onUpdated(fresh);
      } catch {}
    }, 3000);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={styles.title}>Spec</h2>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            v{versions.length} · {versions.length > 0 ? new Date(versions[versions.length - 1].timestamp).toLocaleDateString() : "—"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button className="btn-ghost" onClick={handleRecheck} title="Re-run Master LLM viability check">↻ Recheck</button>
          )}
          {versions.length > 1 && (
            <button className="btn-ghost" onClick={() => setShowHistory(v => !v)}>
              {showHistory ? "Hide History" : `History (${versions.length})`}
            </button>
          )}
          {!editing && canEdit && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={styles.warningBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Viability Warnings · {warnings.length}
            </strong>
            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>
              flagged by Master LLM
            </span>
          </div>
          <ul style={{ paddingLeft: 22, fontSize: 13, lineHeight: 1.8 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{ minHeight: 200, fontFamily: "monospace", fontSize: 13 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              Updating as <strong>{currentUser.username}</strong> ({currentUser.role})
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Save Revision"}
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.specText}>{feature.spec.current || <em style={{ color: "var(--text-muted)" }}>No spec written yet.</em>}</div>
      )}

      {showHistory && (
        <div style={styles.history}>
          <p style={styles.label}>Version History</p>
          {[...versions].reverse().map((v, i) => (
            <div key={i} style={styles.version}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  v{versions.length - i} · {v.updated_by} · {new Date(v.timestamp).toLocaleString()}
                </span>
              </div>
              <pre style={styles.versionContent}>{v.content}</pre>
            </div>
          ))}
        </div>
      )}

      <SpecFilesList
        feature={feature}
        onUpdated={onUpdated}
        onOpenFile={(filename) => setReadingFile(filename)}
        currentUser={currentUser}
      />
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: 600 },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  specText: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "14px 16px",
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.7,
    minHeight: 80,
  },
  history: {
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  version: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 14px",
  },
  versionContent: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  warningBanner: {
    background: "#3a2e0a",
    border: "1px solid #facc15",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
    color: "#fde68a",
  },
};
