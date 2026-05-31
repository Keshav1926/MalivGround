import React, { useState } from "react";
import { apiJson } from "../api";
import ProjectForm from "./ProjectForm";

const WRITE_ROLES = ["admin", "pa", "lead"];

export default function FeatureList({
  projects, features, selected, onSelect, onFeatureCreated, onProjectCreated, currentUser,
}) {
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState(() => new Set(projects.map(p => p.id)));
  const [newFeatureProjectId, setNewFeatureProjectId] = useState(null);

  const canWrite = currentUser && WRITE_ROLES.includes(currentUser.role);

  function toggleProject(pid) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  function featuresOf(pid) {
    return features.filter(f => f.project_id === pid);
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.logo}>🗂 Maliv-Ground</span>
        {canWrite && (
          <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => setShowProjectForm(v => !v)}>
            {showProjectForm ? "Cancel" : "+ Project"}
          </button>
        )}
      </div>

      {showProjectForm && (
        <ProjectForm
          onCreated={p => { onProjectCreated(p); setShowProjectForm(false); setExpandedProjects(prev => new Set([...prev, p.id])); }}
          onCancel={() => setShowProjectForm(false)}
        />
      )}

      <div style={styles.list}>
        {projects.length === 0 && (
          <p style={{ color: "var(--text-muted)", padding: "16px", fontSize: 13 }}>
            {canWrite ? "No projects yet. Create one above." : "No projects yet."}
          </p>
        )}

        {projects.map(p => {
          const isOpen = expandedProjects.has(p.id);
          const childFeatures = featuresOf(p.id);
          return (
            <div key={p.id} style={styles.projectBlock}>
              <div style={styles.projectHeader} onClick={() => toggleProject(p.id)}>
                <span style={styles.caret}>{isOpen ? "▾" : "▸"}</span>
                <span style={styles.projectTitle}>{p.title}</span>
                <span style={styles.count}>{childFeatures.length}</span>
              </div>

              {isOpen && (
                <div style={styles.children}>
                  {childFeatures.length === 0 && (
                    <p style={styles.emptyChild}>No features yet</p>
                  )}
                  {childFeatures.map(f => (
                    <div
                      key={f.id}
                      onClick={() => onSelect(f)}
                      style={{
                        ...styles.featureItem,
                        background: selected?.id === f.id ? "var(--surface2)" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{f.title}</span>
                        <span className="badge-active" style={{ fontSize: 10 }}>{f.status}</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{f.id}</div>
                    </div>
                  ))}

                  {canWrite && (
                    newFeatureProjectId === p.id ? (
                      <InlineNewFeature
                        projectId={p.id}
                        onCreated={f => { onFeatureCreated(f); setNewFeatureProjectId(null); }}
                        onCancel={() => setNewFeatureProjectId(null)}
                      />
                    ) : (
                      <button
                        className="btn-ghost"
                        style={styles.addBtn}
                        onClick={() => setNewFeatureProjectId(p.id)}
                      >
                        + New Feature
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function InlineNewFeature({ projectId, onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const created = await apiJson("/features", {
        method: "POST",
        body: JSON.stringify({ title, spec_content: spec, project_id: projectId }),
      });
      onCreated(created);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.inlineForm}>
      <input
        value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Feature title" required autoFocus
        style={{ fontSize: 12 }}
      />
      <textarea
        value={spec} onChange={e => setSpec(e.target.value)}
        placeholder="Initial spec" required
        style={{ minHeight: 60, fontSize: 12 }}
      />
      {err && <p style={{ color: "var(--red)", fontSize: 11 }}>{err}</p>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" type="submit" disabled={loading} style={{ fontSize: 11 }}>
          {loading ? "…" : "Create"}
        </button>
      </div>
    </form>
  );
}

const styles = {
  sidebar: {
    width: 280, minWidth: 280,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex", flexDirection: "column",
    height: "100vh", overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", borderBottom: "1px solid var(--border)",
  },
  logo: { fontWeight: 700, fontSize: 14, letterSpacing: 0.3 },
  list: { flex: 1, overflowY: "auto", padding: "6px 0 30px" },
  projectBlock: { marginBottom: 4 },
  projectHeader: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 14px",
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "var(--text-muted)",
  },
  caret: { fontSize: 10, width: 10, display: "inline-block" },
  projectTitle: { color: "var(--text)" },
  count: {
    marginLeft: "auto",
    background: "var(--surface2)",
    borderRadius: 99,
    padding: "1px 8px",
    fontSize: 10,
    color: "var(--text-muted)",
  },
  children: { paddingLeft: 14 },
  featureItem: {
    padding: "8px 14px",
    cursor: "pointer",
    borderLeft: "2px solid var(--border)",
    marginLeft: 2,
  },
  emptyChild: {
    padding: "4px 16px 8px",
    fontSize: 11,
    color: "var(--text-muted)",
    fontStyle: "italic",
  },
  addBtn: {
    fontSize: 11,
    padding: "5px 14px",
    color: "var(--accent)",
    width: "100%",
    textAlign: "left",
  },
  inlineForm: {
    padding: "8px 12px",
    margin: "4px 8px 8px 16px",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
};
