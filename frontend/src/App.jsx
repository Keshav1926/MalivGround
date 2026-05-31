import React, { useState, useEffect } from "react";
import FeatureList from "./components/FeatureList";
import SpecEditor from "./components/SpecEditor";
import QnAThread from "./components/QnAThread";
import SummaryView from "./components/SummaryView";
import ConflictsView from "./components/ConflictsView";
import LoginPage from "./components/LoginPage";
import UserMenu from "./components/UserMenu";
import SettingsPanel from "./components/SettingsPanel";
import { apiJson, getToken, setToken } from "./api";

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("spec");
  const [showSettings, setShowSettings] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);

  // Initial auth check
  useEffect(() => {
    if (!getToken()) { setAuthChecking(false); return; }
    apiJson("/auth/me")
      .then(u => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setAuthChecking(false));

    function onLogout() { setUser(null); setSelected(null); setFeatures([]); }
    window.addEventListener("maliv:logout", onLogout);
    return () => window.removeEventListener("maliv:logout", onLogout);
  }, []);

  // Load projects + features when authed
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiJson("/projects").then(setProjects).catch(() => {}),
      apiJson("/features").then(setFeatures).catch(() => {}),
    ]).finally(() => setLoading(false));
    fetch("/system/status").then(r => r.json()).then(setSystemStatus).catch(() => {});
  }, [user]);

  async function handleSelect(f) {
    const full = await apiJson(`/features/${f.id}`);
    setSelected(full);
    setTab("spec");
  }

  function handleFeatureCreated(feature) {
    setFeatures(prev => [feature, ...prev]);
    setSelected(feature);
    setTab("spec");
  }

  function handleProjectCreated(project) {
    setProjects(prev => [{ ...project, feature_count: 0 }, ...prev]);
  }

  function handleUpdated(updated) {
    setSelected(updated);
    setFeatures(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setSelected(null);
    setFeatures([]);
    setProjects([]);
  }

  if (authChecking) {
    return <div style={styles.center}>Loading…</div>;
  }

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }

  return (
    <div style={styles.layout}>
      <FeatureList
        projects={projects}
        features={features}
        selected={selected}
        onSelect={handleSelect}
        onFeatureCreated={handleFeatureCreated}
        onProjectCreated={handleProjectCreated}
        currentUser={user}
      />

      <main style={styles.main}>
        <div style={styles.topBar}>
          <div style={styles.statusChip}>
            {systemStatus?.master_llm_enabled ? (
              <span style={{ color: "var(--green)" }}>● Master LLM: {systemStatus.provider}</span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>○ Master LLM disabled</span>
            )}
          </div>
          <UserMenu user={user} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />
        </div>

        {loading && <p style={styles.empty}>Loading…</p>}
        {!loading && !selected && (
          <div style={styles.empty}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Welcome to Maliv-Ground</p>
            <p style={{ color: "var(--text-muted)" }}>Select a feature from the sidebar or create a new one to get started.</p>
          </div>
        )}
        {selected && (
          <>
            <div style={styles.featureHeader}>
              <div>
                <h1 style={styles.featureTitle}>{selected.title}</h1>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <span className="badge-active">{selected.status}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {selected.id} · created by {selected.created_by} · {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selected.tags?.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>

            <div style={styles.tabs}>
              {[
                { key: "spec", label: "Spec" },
                { key: "qa", label: `Q&A (${(selected.qa || []).length})` },
                { key: "conflicts", label: `Conflicts (${(selected.conflicts || []).filter(c => !c.resolved).length})` },
                { key: "summary", label: "Summary" },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={styles.content}>
              {tab === "spec" && (
                <SpecEditor feature={selected} onUpdated={handleUpdated} currentUser={user} />
              )}
              {tab === "qa" && (
                <QnAThread feature={selected} onUpdated={handleUpdated} currentUser={user} />
              )}
              {tab === "conflicts" && (
                <ConflictsView feature={selected} onUpdated={handleUpdated} currentUser={user} />
              )}
              {tab === "summary" && (
                <SummaryView feature={selected} onUpdated={handleUpdated} currentUser={user} />
              )}
            </div>
          </>
        )}
      </main>

      {showSettings && (
        <SettingsPanel user={user} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

const styles = {
  layout: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--bg)",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 24px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  statusChip: {
    fontSize: 11,
    color: "var(--text-muted)",
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    background: "var(--bg)",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    textAlign: "center",
    padding: 40,
  },
  featureHeader: {
    padding: "20px 28px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  featureTitle: { fontSize: 22, fontWeight: 700 },
  tabs: {
    display: "flex",
    gap: 4,
    padding: "14px 28px 0",
    borderBottom: "1px solid var(--border)",
  },
  tab: {
    background: "transparent",
    color: "var(--text-muted)",
    padding: "8px 14px",
    borderRadius: "var(--radius) var(--radius) 0 0",
    fontWeight: 500,
    fontSize: 13,
  },
  tabActive: {
    background: "var(--surface)",
    color: "var(--text)",
    borderBottom: "2px solid var(--accent)",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "22px 28px",
  },
};
