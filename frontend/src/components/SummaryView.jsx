import React, { useState } from "react";
import { api, apiJson } from "../api";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function SummaryView({ feature, onUpdated, currentUser }) {
  const [regenerating, setRegenerating] = useState(false);
  const canRegenerate = currentUser && WRITE_ROLES.includes(currentUser.role);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api(`/features/${feature.id}/summarize`, { method: "POST" });
      setTimeout(async () => {
        try {
          const fresh = await apiJson(`/features/${feature.id}`);
          onUpdated(fresh);
        } catch {}
        setRegenerating(false);
      }, 4000);
    } catch {
      setRegenerating(false);
    }
  }

  const summary = feature.knowledge_graph_summary;
  const generatedAt = feature.summary_generated_at;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={styles.title}>Knowledge Graph Summary</h2>
          {generatedAt && (
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Last generated: {new Date(generatedAt).toLocaleString()}
            </span>
          )}
        </div>
        {canRegenerate && (
          <button className="btn-secondary" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "↻ Regenerate"}
          </button>
        )}
      </div>

      <div style={styles.note}>
        Token-efficient compressed view of spec + answered Q&A. Used by AI agents when{" "}
        <code style={styles.code}>context_pull_mode</code> is set to{" "}
        <code style={styles.code}>summary</code>.
      </div>

      {summary ? (
        <div style={styles.summaryBox}>{summary}</div>
      ) : (
        <div style={styles.empty}>
          <p style={{ marginBottom: 8 }}>No summary yet.</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Either Master LLM is disabled in <code style={styles.code}>config.json</code>, or the
            summary hasn't been generated yet. Click Regenerate to try.
          </p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 16, fontWeight: 600 },
  note: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
  },
  code: {
    background: "var(--surface2)",
    padding: "1px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 11,
  },
  summaryBox: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "16px 18px",
    fontSize: 13,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  },
  empty: {
    background: "var(--surface)",
    border: "1px dashed var(--border)",
    borderRadius: "var(--radius)",
    padding: "30px 20px",
    textAlign: "center",
    color: "var(--text)",
  },
};
