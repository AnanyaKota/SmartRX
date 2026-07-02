import { useState, useEffect } from "react";
import { api, getUser } from "../api.js";

const DOCTOR_NAV = [
  { id: "search",   label: "Patient Search",  icon: "🔍" },
  { id: "recents",  label: "Recent Patients", icon: "👥" },
  { id: "settings", label: "Settings",        icon: "⚙️" },
];

// ── Main Page ────────────────────────────────────────────────────────────────
export default function DoctorPage() {
  const user = getUser();
  const [active, setActive]       = useState("search");
  const [patient, setPatient]     = useState(null);  // { log, summary, notes }
  const [recents, setRecents]     = useState([]);
  const [doctorSettings, setDoctorSettings] = useState(null);

  useEffect(() => {
    api.getSettings().then(setDoctorSettings).catch(() => {});
  }, []);

  function onPatientLoaded(data) {
    setPatient(data);
    setActive("search");
    // Add to recents (dedup by phone, max 5)
    setRecents(prev => {
      const filtered = prev.filter(r => r.phone !== data.log.phone);
      return [{ phone: data.log.phone, name: data.log.name }, ...filtered].slice(0, 5);
    });
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-name">{user.name}</div>
            <div className="sidebar-role">
              Doctor
              {doctorSettings?.hospital_name && (
                <span className="doctor-hospital-badge"> · {doctorSettings.hospital_name}</span>
              )}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {DOCTOR_NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " active" : ""}`}
              onClick={() => setActive(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {recents.length > 0 && (
          <div className="sidebar-recents">
            <div className="sidebar-recents-title">Recent</div>
            {recents.map(r => (
              <div key={r.phone} className="recent-item" onClick={() => { setActive("search"); }}>
                <span className="recent-avatar">{r.name.charAt(0).toUpperCase()}</span>
                <span className="recent-name">{r.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          <span className="sidebar-footer-text">smartRX · v2.0</span>
        </div>
      </aside>

      <main className="dash-content">
        {active === "search" && (
          <SearchPanel onPatientLoaded={onPatientLoaded} currentPatient={patient} />
        )}
        {active === "recents" && (
          <RecentsPanel recents={recents} onSelect={phone => { setActive("search"); }} />
        )}
        {active === "settings" && (
          <DoctorSettingsPanel user={user} settings={doctorSettings} setSettings={setDoctorSettings} />
        )}
      </main>
    </div>
  );
}

// ── Search Panel ──────────────────────────────────────────────────────────────
function SearchPanel({ onPatientLoaded, currentPatient }) {
  const [phone, setPhone]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");
  const [patient, setPatient] = useState(currentPatient);

  async function lookup(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError(""); setBusy(true); setPatient(null);
    try {
      const [logData, summaryData, notesData] = await Promise.all([
        api.patientLog(phone.trim()),
        api.summary(phone.trim()),
        api.getNotes(phone.trim()),
      ]);
      const data = { log: logData, summary: summaryData, notes: notesData.notes || [] };
      setPatient(data);
      onPatientLoaded(data);
    } catch (err) {
      setError(/no records/i.test(err.message) ? "No patient found for that phone number." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">Patient Lookup</h1>
        <p className="dash-subtitle">Enter a patient's phone number to load their complete history and AI summary.</p>
      </div>

      <section className="card">
        <form onSubmit={lookup} className="form row">
          <input
            type="tel"
            placeholder="Patient phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            disabled={busy}
            style={{ fontSize: "1.05rem" }}
          />
          <button type="submit" className="primary" disabled={busy || !phone.trim()}>
            {busy ? <><span className="spinner" />Looking up…</> : "Look up"}
          </button>
        </form>
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {patient && <PatientPanel data={patient} onNotesUpdate={notes => setPatient(p => ({ ...p, notes }))} />}
    </div>
  );
}

// ── Patient Panel ─────────────────────────────────────────────────────────────
function PatientPanel({ data, onNotesUpdate }) {
  const [tab, setTab] = useState("summary");

  const { log, summary, notes } = data;
  const hasInteractions = (summary?.structured?.interactions || []).length > 0;

  return (
    <div className="patient-panel">
      {/* Patient header */}
      <div className="patient-header card">
        <div className="patient-avatar-lg">{log.name.charAt(0).toUpperCase()}</div>
        <div className="patient-header-info">
          <h2 className="patient-name">{log.name}</h2>
          <span className="patient-phone muted">{log.phone}</span>
          {summary?.structured?.last_consultation && (
            <span className="patient-last-visit muted small">Last visit: {summary.structured.last_consultation}</span>
          )}
        </div>
        <div className="patient-header-stats">
          <div className="stat-pill">
            <span className="stat-num">{summary?.medicine_count ?? 0}</span>
            <span className="stat-label">Medicines</span>
          </div>
          <div className="stat-pill">
            <span className="stat-num">{log.prescriptions?.length ?? 0}</span>
            <span className="stat-label">Visits</span>
          </div>
          {hasInteractions && (
            <div className="stat-pill stat-pill-warn">
              <span className="stat-num">⚠</span>
              <span className="stat-label">Interactions</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="patient-tabs">
        {[
          { id: "summary", label: "Summary" },
          { id: "history", label: `History (${log.prescriptions?.length ?? 0})` },
          { id: "notes",   label: `Notes (${notes?.length ?? 0})` },
        ].map(t => (
          <button key={t.id} className={`patient-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && <SummaryTab summary={summary} />}
      {tab === "history" && <HistoryTab prescriptions={log.prescriptions || []} />}
      {tab === "notes"   && <NotesTab phone={log.phone} notes={notes} onNotesUpdate={onNotesUpdate} />}
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────
function SummaryTab({ summary }) {
  if (!summary) return <p className="muted" style={{ padding: 24 }}>No summary available.</p>;
  if (summary.medicine_count === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📋</span>
        <p>No medicines on record — nothing to summarise yet.</p>
      </div>
    );
  }

  const s = summary.structured;

  return (
    <div className="summary-tab">
      {s?.interactions?.length > 0 && (
        <div className="interactions-alert-block card">
          <div className="interactions-alert-title">
            ⚠ Drug Interaction{s.interactions.length > 1 ? "s" : ""} Detected
          </div>
          {s.interactions.map((ix, i) => (
            <div key={i} className={`interaction-item severity-${ix.severity}`}>
              <div className="interaction-meds">{(ix.medicines || []).join(" + ")}</div>
              <div className={`interaction-severity-badge severity-badge-${ix.severity}`}>{ix.severity}</div>
              <p className="interaction-desc">{ix.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Clinical notes */}
      {s?.clinical_notes && (
        <div className="summary-section card">
          <h3 className="summary-section-title">Clinical Overview</h3>
          <p className="clinical-notes-text">{s.clinical_notes}</p>
          {s.trend && s.trend !== "insufficient_data" && (
            <div className={`trend-badge trend-${s.trend}`}>
              {s.trend === "stable" ? "→ Stable" : s.trend === "improving" ? "↑ Improving" : "↓ Worsening"}
            </div>
          )}
        </div>
      )}

      {/* Current medicines */}
      {s?.current_medicines?.length > 0 && (
        <div className="summary-section card">
          <h3 className="summary-section-title">Current Medications</h3>
          <div className="med-grid">
            {s.current_medicines.map((m, i) => (
              <div key={i} className={`med-card-item status-${m.status}`}>
                <div className="med-card-name">💊 {m.name}</div>
                <div className="med-card-chips">
                  {m.dose       && <span className="tl-chip">{m.dose}</span>}
                  {m.frequency  && <span className="tl-chip">{m.frequency}</span>}
                  <span className={`med-status-badge status-badge-${m.status}`}>{m.status}</span>
                </div>
                {m.last_prescribed && (
                  <div className="med-card-date muted small">Since {m.last_prescribed}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {s?.conditions?.length > 0 && (
        <div className="summary-section card">
          <h3 className="summary-section-title">Health Conditions</h3>
          <div className="conditions-list">
            {s.conditions.map((c, i) => (
              <div key={i} className="condition-row">
                <span className="condition-name">{c.name}</span>
                {c.onset && <span className="muted small">Since {c.onset}</span>}
                <span className={`condition-status status-badge-${c.status}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allergies */}
      {s?.allergies?.length > 0 && (
        <div className="summary-section card">
          <h3 className="summary-section-title">⚠ Known Allergies</h3>
          <div className="allergy-chips">
            {s.allergies.map((a, i) => <span key={i} className="allergy-chip">{a}</span>)}
          </div>
        </div>
      )}

      {/* Fallback if no structured */}
      {!s && summary.summary && (
        <div className="summary-section card">
          <h3 className="summary-section-title">AI Summary</h3>
          <p>{summary.summary}</p>
        </div>
      )}

      {summary.generated_at && (
        <p className="muted small" style={{ textAlign: "right" }}>
          Generated {new Date(summary.generated_at).toLocaleString("en-IN")}
        </p>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ prescriptions }) {
  if (!prescriptions.length) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📋</span>
        <p>No prescriptions on record.</p>
      </div>
    );
  }
  return (
    <div className="timeline" style={{ padding: "20px 0" }}>
      {prescriptions.map((rx, i) => (
        <div key={rx.id} className="timeline-item">
          <div className="tl-dot-col">
            <div className="tl-dot" />
            {i < prescriptions.length - 1 && <div className="tl-line" />}
          </div>
          <div className="tl-card card">
            <div className="tl-header">
              <div className="tl-meta">
                <span className="tl-date">{rx.date || "No date"}</span>
                <span className="tl-doctor">{rx.doctor_name || "Unknown doctor"}</span>
                {rx.hospital && <span className="tl-hospital">🏥 {rx.hospital}</span>}
              </div>
              <span className="tl-badge">{(rx.medicines || []).length} med{(rx.medicines || []).length !== 1 ? "s" : ""}</span>
            </div>
            <div className="tl-medicines">
              {(rx.medicines || []).map((m, j) => (
                <div key={j} className="tl-med-row">
                  <span className="tl-med-name">💊 {m.name}</span>
                  <div className="tl-med-chips">
                    {m.dose        && <span className="tl-chip">{m.dose}</span>}
                    {m.frequency   && <span className="tl-chip">{m.frequency}</span>}
                    {m.duration    && <span className="tl-chip">{m.duration}</span>}
                    {m.instructions && <span className="tl-chip tl-chip-note">{m.instructions}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────
function NotesTab({ phone, notes, onNotesUpdate }) {
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  async function addNote(e) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true); setErr("");
    try {
      const added = await api.addNote(phone, newNote.trim());
      onNotesUpdate([added, ...notes]);
      setNewNote("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notes-tab">
      <form onSubmit={addNote} className="notes-add-form card">
        <h3 style={{ margin: "0 0 12px", fontWeight: 700, fontSize: "1rem" }}>Add Consultation Note</h3>
        <textarea
          className="notes-textarea"
          placeholder="e.g. Patient reports side effects from Amoxicillin. Switched to Augmentin."
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          rows={3}
          disabled={saving}
        />
        {err && <p className="error">{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button type="submit" className="primary" disabled={saving || !newNote.trim()}>
            {saving ? <><span className="spinner" />Saving…</> : "Save Note"}
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📝</span>
          <p>No consultation notes yet. Add the first note above.</p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map(n => (
            <div key={n.id} className="note-item card">
              <div className="note-header">
                <strong className="note-doctor">Dr. {n.doctor_name}</strong>
                <span className="note-date muted small">
                  {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <p className="note-body">{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recents Panel ─────────────────────────────────────────────────────────────
function RecentsPanel({ recents }) {
  if (!recents.length) {
    return (
      <div className="dash-panel">
        <div className="dash-header">
          <h1 className="dash-title">Recent Patients</h1>
          <p className="dash-subtitle">Patients you've looked up this session.</p>
        </div>
        <div className="empty-state">
          <span className="empty-icon">👥</span>
          <p>No patients looked up yet. Use Patient Search to find a patient.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">Recent Patients</h1>
        <p className="dash-subtitle">{recents.length} patient{recents.length !== 1 ? "s" : ""} looked up this session.</p>
      </div>
      <div className="recents-panel-list">
        {recents.map(r => (
          <div key={r.phone} className="recent-panel-item card">
            <div className="patient-avatar-lg">{r.name.charAt(0).toUpperCase()}</div>
            <div>
              <strong>{r.name}</strong>
              <div className="muted small">{r.phone}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Doctor Settings Panel ─────────────────────────────────────────────────────
function DoctorSettingsPanel({ user, settings, setSettings }) {
  const [hospital, setHospital]       = useState(settings?.hospital_name || "");
  const [spec, setSpec]               = useState(settings?.specialization || "");
  const [savedMsg, setSavedMsg]       = useState("");

  useEffect(() => {
    if (settings) {
      setHospital(settings.hospital_name || "");
      setSpec(settings.specialization || "");
    }
  }, [settings]);

  async function save() {
    try {
      const updated = await api.updateSettings({ hospital_name: hospital, specialization: spec });
      setSettings(updated);
      setSavedMsg("Saved");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">Settings</h1>
        <p className="dash-subtitle">Manage your profile and credentials.</p>
      </div>

      <section className="card settings-card">
        <h3 className="settings-section-title">Profile</h3>
        <div className="settings-row">
          <span className="settings-label">Full name</span>
          <span className="settings-value">{user.name}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Phone number</span>
          <span className="settings-value">{user.phone}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Account type</span>
          <span className="badge-role">Doctor</span>
        </div>
      </section>

      <section className="card settings-card">
        <h3 className="settings-section-title">Credentials</h3>
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <label style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, fontWeight: 500 }}>
            Hospital / Clinic
            <input type="text" value={hospital} onChange={e => setHospital(e.target.value)} placeholder="e.g. City Medical Centre" />
          </label>
          <label style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, fontWeight: 500 }}>
            Specialization
            <input type="text" value={spec} onChange={e => setSpec(e.target.value)} placeholder="e.g. General Medicine" />
          </label>
        </div>
        <div className="settings-row" style={{ paddingTop: 12, paddingBottom: 4 }}>
          <button className="primary" onClick={save} style={{ minWidth: 100 }}>Save</button>
          {savedMsg && <span style={{ color: "var(--ok-ink)", fontWeight: 600, fontSize: "0.9rem" }}>✓ {savedMsg}</span>}
        </div>
      </section>
    </div>
  );
}
