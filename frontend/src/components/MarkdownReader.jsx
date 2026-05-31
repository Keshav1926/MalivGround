import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";

export default function MarkdownReader({ featureId, filename, onBack }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setContent(null); setError("");
    api(`/features/${featureId}/spec-files/${encodeURIComponent(filename)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => { if (!cancelled) setContent(text); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [featureId, filename]);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button className="btn-ghost" onClick={onBack}>← Back to spec</button>
        <span style={styles.filename}>{filename}</span>
      </div>

      {error && <div style={styles.error}>Failed to load: {error}</div>}
      {!error && content === null && <div style={styles.loading}>Loading…</div>}
      {content !== null && (
        <div style={styles.markdownBody} className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: 12 },
  toolbar: {
    display: "flex", alignItems: "center", gap: 12,
    paddingBottom: 8, borderBottom: "1px solid var(--border)",
  },
  filename: {
    fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)",
    background: "var(--surface2)", padding: "2px 8px", borderRadius: 4,
  },
  markdownBody: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "22px 26px",
    fontSize: 14,
    lineHeight: 1.7,
  },
  loading: { color: "var(--text-muted)", padding: 20, textAlign: "center" },
  error: { color: "var(--red)", padding: 20, textAlign: "center" },
};
