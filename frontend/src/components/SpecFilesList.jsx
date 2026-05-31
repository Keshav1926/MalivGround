import React, { useRef, useState } from "react";
import { api, apiJson, getToken } from "../api";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function SpecFilesList({ feature, onUpdated, onOpenFile, currentUser }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const canWrite = currentUser && WRITE_ROLES.includes(currentUser.role);
  const files = feature.spec_files || [];

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of fileList) {
        if (!/\.(md|markdown)$/i.test(f.name)) {
          throw new Error(`'${f.name}' is not a markdown file`);
        }
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(`/features/${feature.id}/spec-files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { detail = (await res.json()).detail || detail; } catch {}
          throw new Error(`'${f.name}': ${detail}`);
        }
        uploaded.push(await res.json());
      }
      // Refetch the feature to get the updated spec_files list
      const fresh = await apiJson(`/features/${feature.id}`);
      onUpdated(fresh);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await apiJson(`/features/${feature.id}/spec-files/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      const fresh = await apiJson(`/features/${feature.id}`);
      onUpdated(fresh);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h3 style={styles.title}>Attached Spec Files</h3>
        {canWrite && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              multiple
              onChange={e => handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
            <button
              className="btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "+ Upload .md"}
            </button>
          </>
        )}
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: 12 }}>{error}</p>}

      {files.length === 0 ? (
        <div style={styles.empty}>
          No spec files yet. {canWrite && "Upload .md files to attach detailed specs, design docs, or notes."}
        </div>
      ) : (
        <div style={styles.list}>
          {files.map(sf => (
            <div key={sf.filename} style={styles.fileCard}>
              <div style={styles.fileMain} onClick={() => onOpenFile(sf.filename)}>
                <div style={styles.fileName}>📄 {sf.filename}</div>
                <div style={styles.fileMeta}>
                  {sf.uploaded_by} · {new Date(sf.uploaded_at).toLocaleDateString()} · {formatBytes(sf.size_bytes)}
                </div>
              </div>
              <div style={styles.fileActions}>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => onOpenFile(sf.filename)}>Read</button>
                {canWrite && (
                  <button className="btn-ghost" style={{ fontSize: 11, color: "var(--red)" }} onClick={() => handleDelete(sf.filename)}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const styles = {
  section: {
    borderTop: "1px solid var(--border)",
    paddingTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontWeight: 600 },
  empty: {
    background: "var(--surface)",
    border: "1px dashed var(--border)",
    borderRadius: "var(--radius)",
    padding: "16px 20px",
    color: "var(--text-muted)",
    fontSize: 13,
    textAlign: "center",
  },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  fileCard: {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fileMain: { flex: 1, cursor: "pointer" },
  fileName: { fontSize: 13, fontWeight: 500 },
  fileMeta: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 },
  fileActions: { display: "flex", gap: 4 },
};
