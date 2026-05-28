import React, { useState, useRef, useEffect } from "react";

export default function UserMenu({ user, onLogout, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} style={styles.wrap}>
      <button onClick={() => setOpen(v => !v)} style={styles.trigger}>
        <span style={styles.avatar}>{initial}</span>
        <span style={styles.name}>{user.username}</span>
        <span style={styles.role}>{user.role}</span>
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user.username}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>role: {user.role}</div>
          </div>
          <button style={styles.item} onClick={() => { setOpen(false); onOpenSettings(); }}>
            ⚙ API Keys & Settings
          </button>
          <button style={{ ...styles.item, color: "var(--red)" }} onClick={onLogout}>
            ↪ Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: "relative" },
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    padding: "5px 10px 5px 5px",
    borderRadius: 99,
    fontSize: 12,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 99,
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
  },
  name: { fontWeight: 500 },
  role: { color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  dropdown: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    minWidth: 220,
    padding: 4,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  header: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    marginBottom: 4,
  },
  item: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    color: "var(--text)",
    padding: "8px 12px",
    fontSize: 13,
    borderRadius: 6,
  },
};
