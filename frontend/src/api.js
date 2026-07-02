// Thin API client. Matches API_CONTRACT.md + v2 extensions.
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export function getToken() {
  return localStorage.getItem("smartrx_token");
}
export function setSession(token, user) {
  localStorage.setItem("smartrx_token", token);
  localStorage.setItem("smartrx_user", JSON.stringify(user));
}
export function getUser() {
  const raw = localStorage.getItem("smartrx_user");
  return raw ? JSON.parse(raw) : null;
}
export function clearSession() {
  localStorage.removeItem("smartrx_token");
  localStorage.removeItem("smartrx_user");
}

async function handle(res) {
  if (!res.ok) {
    let detail = `request failed (${res.status})`;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const api = {
  // ---- auth ----
  register: (body) =>
    fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  login: (phone, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }).then(handle),

  // ---- prescriptions (patient) ----
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/upload`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: fd,
    }).then(handle);
  },

  patchPrescription: (id, body) =>
    fetch(`${BASE}/prescription/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  deletePrescription: (id) =>
    fetch(`${BASE}/prescription/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    }).then(handle),

  patientLog: (phone) =>
    fetch(`${BASE}/patient/${encodeURIComponent(phone)}`, {
      headers: { ...authHeaders() },
    }).then(handle),

  // ---- summary (doctor) ----
  summary: (phone) =>
    fetch(`${BASE}/summary/${encodeURIComponent(phone)}`, {
      headers: { ...authHeaders() },
    }).then(handle),

  interactionReport: (phone) =>
    fetch(`${BASE}/interactions/${encodeURIComponent(phone)}`, {
      headers: { ...authHeaders() },
    }).then(handle),

  // ---- notes ----
  addNote: (phone, note) =>
    fetch(`${BASE}/patient/${encodeURIComponent(phone)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ note }),
    }).then(handle),

  getNotes: (phone) =>
    fetch(`${BASE}/patient/${encodeURIComponent(phone)}/notes`, {
      headers: { ...authHeaders() },
    }).then(handle),

  // ---- settings ----
  getSettings: () =>
    fetch(`${BASE}/settings`, {
      headers: { ...authHeaders() },
    }).then(handle),

  updateSettings: (body) =>
    fetch(`${BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  // ---- audit log ----
  getAuditLog: () =>
    fetch(`${BASE}/audit-log`, {
      headers: { ...authHeaders() },
    }).then(handle),
};
