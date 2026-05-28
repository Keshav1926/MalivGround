// Centralized fetch wrapper that auto-attaches the Bearer token.

const TOKEN_KEY = "maliv.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("maliv:logout"));
  }
  return res;
}

export async function apiJson(path, options = {}) {
  const res = await api(path, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = d.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}
