import { useEffect, useMemo, useState, useCallback } from "react";
import { api, getUser } from "../api.js";
import { t, getLang, setLang } from "../i18n.js";

// ── Frequency parser ─────────────────────────────────────────────────────────
function parseFrequency(frequency) {
  if (!frequency) return [{ hour: 8, min: 0, label: "Daily" }];
  const f = frequency.toLowerCase().trim();

  const dash = f.match(/^(\d)-(\d)-(\d)$/);
  if (dash) {
    const times = [];
    if (dash[1] !== "0") times.push({ hour: 8,  min: 0, label: "Morning" });
    if (dash[2] !== "0") times.push({ hour: 14, min: 0, label: "Afternoon" });
    if (dash[3] !== "0") times.push({ hour: 21, min: 0, label: "Night" });
    return times.length ? times : [{ hour: 8, min: 0, label: "Daily" }];
  }
  if (f.includes("four times") || f.includes("qid"))
    return [{ hour: 8, min: 0, label: "Morning" }, { hour: 12, min: 0, label: "Noon" },
            { hour: 16, min: 0, label: "Afternoon" }, { hour: 20, min: 0, label: "Evening" }];
  if (f.includes("thrice") || f.includes("three times") || f.includes("tds") || f.includes("tid"))
    return [{ hour: 8, min: 0, label: "Morning" }, { hour: 14, min: 0, label: "Afternoon" }, { hour: 21, min: 0, label: "Night" }];
  if (f.includes("twice") || f.includes("two times") || f.includes(" bd") || f.includes(" bid"))
    return [{ hour: 8, min: 0, label: "Morning" }, { hour: 21, min: 0, label: "Night" }];
  if (f.includes("morning") && f.includes("night"))
    return [{ hour: 8, min: 0, label: "Morning" }, { hour: 21, min: 0, label: "Night" }];
  if (f.includes("morning") && f.includes("evening"))
    return [{ hour: 8, min: 0, label: "Morning" }, { hour: 18, min: 0, label: "Evening" }];
  if (f.includes("morning")) return [{ hour: 8, min: 0, label: "Morning" }];
  if (f.includes("night") || f.includes("bedtime") || f.includes(" hs"))
    return [{ hour: 21, min: 0, label: "Night" }];
  if (f.includes("afternoon")) return [{ hour: 14, min: 0, label: "Afternoon" }];
  if (f.includes("evening"))   return [{ hour: 18, min: 0, label: "Evening" }];
  return [{ hour: 8, min: 0, label: "Daily" }];
}

function formatDate(dateStr) {
  if (!dateStr) return "Date unknown";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return dateStr; }
}

function fmtTime(hour, min) {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function getDoseStatus(diffMin) {
  if (diffMin < -120) return "past";
  if (diffMin < -5)   return "overdue";
  if (diffMin <= 15)  return "now";
  if (diffMin <= 60)  return "soon";
  return "later";
}

function getCountdownText(diffMin) {
  if (diffMin < -120) return `${Math.round(Math.abs(diffMin) / 60)}h ago`;
  if (diffMin < -60)  return `${Math.round(Math.abs(diffMin) / 60)}h ago`;
  if (diffMin < 0)    return `${Math.round(Math.abs(diffMin))} min ago`;
  if (diffMin <= 5)   return "Take now!";
  if (diffMin < 60)   return `${Math.round(diffMin)} min to go`;
  if (diffMin < 120)  return "1 hour to go";
  return `${Math.round(diffMin / 60)} hours to go`;
}

// ── Browser notifications ────────────────────────────────────────────────────
function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function fireNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/vite.svg" });
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PatientPage() {
  const user = getUser();
  const [lang, setLangState] = useState(getLang());
  const [active, setActive] = useState("upload");
  const [log, setLog] = useState(null);
  const [interactionReport, setInteractionReport] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Upload state
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [dragging, setDragging] = useState(false);

  // Verification modal
  const [pendingRx, setPendingRx] = useState(null); // extracted prescription from upload

  // Settings (loaded from backend)
  const [settings, setSettings] = useState(null);

  const navItems = [
    { id: "upload",        label: t("navUpload"),        icon: "📋" },
    { id: "history",       label: t("navHistory"),       icon: "🏥" },
    { id: "notifications", label: t("navNotifications"), icon: "🔔" },
    { id: "audit",         label: t("navAudit"),         icon: "🔐" },
    { id: "settings",      label: t("navSettings"),      icon: "⚙️" },
  ];

  async function loadLog() {
    setLoadErr("");
    setLoading(true);
    try {
      const [data, report] = await Promise.all([
        api.patientLog(user.phone),
        api.interactionReport(user.phone).catch(() => null),
      ]);
      setLog(data);
      setInteractionReport(report);
    } catch (err) {
      if (/no records/i.test(err.message)) {
        setLog({ phone: user.phone, name: user.name, prescriptions: [] });
        setInteractionReport(null);
      } else {
        setLoadErr(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      setSettings(s);
      if (s.language && s.language !== getLang()) {
        setLang(s.language);
        setLangState(s.language);
      }
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    loadLog();
    loadSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire browser notifications for upcoming doses
  useEffect(() => {
    if (!log?.prescriptions?.length) return;
    const id = setInterval(() => {
      const now = new Date();
      for (const rx of log.prescriptions) {
        for (const med of rx.medicines || []) {
          for (const slot of parseFrequency(med.frequency)) {
            const scheduled = new Date(now);
            scheduled.setHours(slot.hour, slot.min, 0, 0);
            const diff = (scheduled - now) / 60000;
            if (diff > -1 && diff <= 1) {
              fireNotification(`Time for ${med.name}`, `${med.dose || ""} — ${slot.label}`);
            }
          }
        }
      }
    }, 60000);
    return () => clearInterval(id);
  }, [log]);

  // Live badge for urgent doses
  const urgentCount = useMemo(() => {
    if (!log?.prescriptions) return 0;
    const now = new Date();
    let count = 0;
    for (const rx of log.prescriptions) {
      for (const med of rx.medicines || []) {
        for (const slot of parseFrequency(med.frequency)) {
          const s = new Date(now);
          s.setHours(slot.hour, slot.min, 0, 0);
          const d = (s - now) / 60000;
          if (d > -15 && d <= 60) count++;
        }
      }
    }
    return count;
  }, [log]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setUploadErr("");
    setUploading(true);
    try {
      const res = await api.upload(file);
      setFile(null);
      e.target.reset();
      setPendingRx(res); // open verification modal
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleVerifyConfirm(edited) {
    // Patch the prescription with user-edited data
    try {
      await api.patchPrescription(edited.id, {
        doctor_name: edited.doctor_name,
        hospital: edited.hospital,
        date: edited.date,
        medicines: edited.medicines,
      });
    } catch { /* patch is best-effort; data was already saved */ }
    setPendingRx(null);
    await loadLog();
  }

  async function handleVerifyDiscard(rxId) {
    try {
      await api.deletePrescription(rxId);
    } catch { /* ignore */ }
    setPendingRx(null);
  }

  function handleLangChange(newLang) {
    setLang(newLang);
    setLangState(newLang);
    api.updateSettings({ language: newLang }).catch(() => {});
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-name">{user.name}</div>
            <div className="sidebar-role">Patient</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " active" : ""}`}
              onClick={() => setActive(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.id === "notifications" && urgentCount > 0 && (
                <span className="nav-badge">{urgentCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-text">smartRX · v2.0</span>
        </div>
      </aside>

      <main className="dash-content">
        {pendingRx && (
          <ExtractionVerifyModal
            result={pendingRx}
            onConfirm={handleVerifyConfirm}
            onDiscard={handleVerifyDiscard}
          />
        )}

        {active === "upload" && (
          <UploadPanel
            file={file} setFile={setFile} uploading={uploading}
            uploadErr={uploadErr} dragging={dragging}
            setDragging={setDragging} onSubmit={upload}
          />
        )}
        {active === "history" && (
          <HistoryPanel
            prescriptions={log?.prescriptions ?? []}
            interactionReport={interactionReport}
            loadErr={loadErr}
            loading={loading}
          />
        )}
        {active === "notifications" && (
          <NotificationsPanel prescriptions={log?.prescriptions ?? []} />
        )}
        {active === "audit" && <AuditPanel />}
        {active === "settings" && (
          <SettingsPanel
            user={user} settings={settings} setSettings={setSettings}
            lang={lang} onLangChange={handleLangChange}
          />
        )}
      </main>
    </div>
  );
}

// ── Extraction Verify Modal ───────────────────────────────────────────────────
function ExtractionVerifyModal({ result, onConfirm, onDiscard }) {
  const [medicines, setMedicines] = useState(
    result.medicines?.length ? result.medicines : [{ name: "", dose: "", frequency: "", duration: "", instructions: "" }]
  );
  const [doctorName, setDoctorName] = useState(result.doctor_name || "");
  const [hospital, setHospital] = useState(result.hospital || "");
  const [date, setDate] = useState(result.date || "");
  const [saving, setSaving] = useState(false);

  function updateMed(i, field, val) {
    setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  }

  function addMed() {
    setMedicines(prev => [...prev, { name: "", dose: "", frequency: "", duration: "", instructions: "" }]);
  }

  function removeMed(i) {
    setMedicines(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleConfirm() {
    setSaving(true);
    await onConfirm({
      id: result.id,
      doctor_name: doctorName || null,
      hospital: hospital || null,
      date: date || null,
      medicines: medicines.filter(m => m.name.trim()),
    });
    setSaving(false);
  }

  const pct = result.confidence != null ? Math.round(result.confidence * 100) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">{t("verifyTitle")}</h2>
          <p className="modal-subtitle">{t("verifySubtitle")}</p>
          {pct != null && (
            <div className="confidence-bar-wrap">
              <span className="confidence-label">{t("verifyConfidence")}: <strong>{pct}%</strong></span>
              <div className="confidence-bar">
                <div className="confidence-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444" }} />
              </div>
            </div>
          )}
        </div>

        <div className="modal-body">
          <div className="verify-meta-grid">
            <label className="verify-field">
              {t("verifyDoctor")}
              <input type="text" value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="Unknown" />
            </label>
            <label className="verify-field">
              {t("verifyHospital")}
              <input type="text" value={hospital} onChange={e => setHospital(e.target.value)} placeholder="Unknown" />
            </label>
            <label className="verify-field">
              {t("verifyDate")}
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
          </div>

          <h3 className="verify-section-title">{t("verifyMedicines")}</h3>

          {medicines.map((m, i) => (
            <div key={i} className="verify-med-row">
              <div className="verify-med-fields">
                <input placeholder={t("verifyMedName")} value={m.name} onChange={e => updateMed(i, "name", e.target.value)} className="verify-med-name" />
                <input placeholder={t("verifyDose")} value={m.dose || ""} onChange={e => updateMed(i, "dose", e.target.value)} />
                <input placeholder={t("verifyFreq")} value={m.frequency || ""} onChange={e => updateMed(i, "frequency", e.target.value)} />
                <input placeholder={t("verifyDuration")} value={m.duration || ""} onChange={e => updateMed(i, "duration", e.target.value)} />
                <input placeholder={t("verifyInstr")} value={m.instructions || ""} onChange={e => updateMed(i, "instructions", e.target.value)} className="verify-med-wide" />
              </div>
              <button className="verify-remove-btn" onClick={() => removeMed(i)} type="button" aria-label="Remove">✕</button>
            </div>
          ))}

          <button className="btn-add-med" onClick={addMed} type="button">{t("verifyAddMed")}</button>
        </div>

        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => onDiscard(result.id)}
            disabled={saving}
          >
            {t("verifyDiscard")}
          </button>
          <button
            className="primary"
            onClick={handleConfirm}
            disabled={saving || medicines.filter(m => m.name.trim()).length === 0}
          >
            {saving ? <><span className="spinner" />{t("verifySaving")}</> : t("verifyConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Panel ──────────────────────────────────────────────────────────────
function UploadPanel({ file, setFile, uploading, uploadErr, dragging, setDragging, onSubmit }) {
  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">{t("uploadTitle")}</h1>
        <p className="dash-subtitle">{t("uploadSubtitle")}</p>
      </div>
      <section className="card">
        <form onSubmit={onSubmit} className="form">
          <label
            className={`dropzone${dragging ? " dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f && (f.type === "image/jpeg" || f.type === "image/png")) setFile(f);
            }}
          >
            <span className="dropzone-icon" aria-hidden="true">📷</span>
            <span className="dropzone-title">{file ? file.name : t("uploadDropTitle")}</span>
            <span className="dropzone-sub">{t("uploadDropSub")}</span>
            <input
              type="file" accept="image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files[0] || null)}
              disabled={uploading} hidden
            />
          </label>
          {uploadErr && <p className="error">{uploadErr}</p>}
          <button type="submit" className="primary" disabled={!file || uploading}>
            {uploading
              ? <><span className="spinner" />{t("uploadBtnLoading")}</>
              : t("uploadBtn")}
          </button>
        </form>
      </section>
      <div className="card upload-tips">
        <h3 className="tips-heading">{t("uploadTipsTitle")}</h3>
        <ul className="tips-list">
          <li>{t("uploadTip1")}</li>
          <li>{t("uploadTip2")}</li>
          <li>{t("uploadTip3")}</li>
        </ul>
      </div>
    </div>
  );
}

// ── Notifications Panel ───────────────────────────────────────────────────────
function NotificationsPanel({ prescriptions }) {
  const [now, setNow] = useState(() => new Date());
  const [permStatus, setPermStatus] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  async function handleAllowNotif() {
    const perm = await Notification.requestPermission();
    setPermStatus(perm);
  }

  const doses = useMemo(() => {
    const result = [];
    for (const rx of prescriptions) {
      for (const med of rx.medicines || []) {
        for (const slot of parseFrequency(med.frequency)) {
          const scheduled = new Date(now);
          scheduled.setHours(slot.hour, slot.min, 0, 0);
          const diffMin = (scheduled - now) / 60000;
          result.push({
            id: `${rx.id}-${med.name}-${slot.hour}`,
            name: med.name, dose: med.dose, instructions: med.instructions,
            hour: slot.hour, min: slot.min, label: slot.label, diffMin,
          });
        }
      }
    }
    const rank = d => d < -120 ? 99 : d < -5 ? 2 : d <= 15 ? 0 : d <= 60 ? 1 : 3;
    return result.sort((a, b) => {
      const ra = rank(a.diffMin), rb = rank(b.diffMin);
      return ra !== rb ? ra - rb : a.diffMin - b.diffMin;
    });
  }, [prescriptions, now]);

  const activeDoses = doses.filter(d => d.diffMin > -120);
  const pastDoses   = doses.filter(d => d.diffMin <= -120);

  if (prescriptions.length === 0) {
    return (
      <div className="dash-panel">
        <div className="dash-header">
          <h1 className="dash-title">{t("notifTitle")}</h1>
          <p className="dash-subtitle">{t("notifSubtitle")}</p>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🔔</span>
          <p>{t("notifEmpty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">{t("notifTitle")}</h1>
        <p className="dash-subtitle">{t("notifSubtitle")}</p>
      </div>

      {permStatus === "default" && (
        <div className="notif-permission-card card">
          <span style={{ fontSize: "1.4rem" }}>🔔</span>
          <div>
            <strong>{t("notifEnableTitle")}</strong>
            <p className="muted small" style={{ margin: "4px 0 0" }}>{t("notifEnablePrompt")}</p>
          </div>
          <button className="primary" style={{ marginLeft: "auto", whiteSpace: "nowrap" }} onClick={handleAllowNotif}>
            {t("notifAllowBtn")}
          </button>
        </div>
      )}

      {activeDoses.length > 0 && (
        <div className="notif-schedule">
          {activeDoses.map(dose => {
            const status = getDoseStatus(dose.diffMin);
            return (
              <div key={dose.id} className={`dose-card dose-${status}`}>
                <div className="dose-time-col">
                  <span className="dose-time-str">{fmtTime(dose.hour, dose.min)}</span>
                  <span className="dose-slot-label">{dose.label}</span>
                </div>
                <div className="dose-info">
                  <strong className="dose-name">{dose.name}</strong>
                  <div className="dose-chips">
                    {dose.dose && <span className="dose-chip">{dose.dose}</span>}
                    {dose.instructions && <span className="dose-chip dose-chip-note">{dose.instructions}</span>}
                  </div>
                </div>
                <div className="dose-right">
                  {(status === "now" || status === "overdue") && <span className="dose-pulse-dot" />}
                  <span className={`countdown-pill countdown-${status}`}>{getCountdownText(dose.diffMin)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pastDoses.length > 0 && (
        <details className="past-doses-details">
          <summary className="past-doses-summary">
            {t("notifEarlier")} · {pastDoses.length} dose{pastDoses.length !== 1 ? "s" : ""}
          </summary>
          <div className="notif-schedule past" style={{ marginTop: 10 }}>
            {pastDoses.map(dose => (
              <div key={dose.id} className="dose-card dose-past">
                <div className="dose-time-col">
                  <span className="dose-time-str">{fmtTime(dose.hour, dose.min)}</span>
                  <span className="dose-slot-label">{dose.label}</span>
                </div>
                <div className="dose-info">
                  <strong className="dose-name">{dose.name}</strong>
                  {dose.dose && <span className="dose-chip">{dose.dose}</span>}
                </div>
                <div className="dose-right">
                  <span className="countdown-pill countdown-past">{getCountdownText(dose.diffMin)}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {doses.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">✅</span>
          <p>{t("notifNoSchedule")}</p>
        </div>
      )}
    </div>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ prescriptions, interactionReport, loadErr, loading }) {
  const [search, setSearch] = useState("");
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterHospital, setFilterHospital] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const doctors   = useMemo(() => [...new Set(prescriptions.map(rx => rx.doctor_name).filter(Boolean))], [prescriptions]);
  const hospitals = useMemo(() => [...new Set(prescriptions.map(rx => rx.hospital).filter(Boolean))], [prescriptions]);

  const filtered = useMemo(() => prescriptions.filter(rx => {
    if (filterDoctor   && rx.doctor_name !== filterDoctor)   return false;
    if (filterHospital && rx.hospital    !== filterHospital) return false;
    if (dateFrom && rx.date && rx.date < dateFrom) return false;
    if (dateTo   && rx.date && rx.date > dateTo)   return false;
    if (search) {
      const s = search.toLowerCase();
      const medHit = (rx.medicines || []).some(m => m.name.toLowerCase().includes(s));
      const docHit = (rx.doctor_name || "").toLowerCase().includes(s);
      const hosHit = (rx.hospital    || "").toLowerCase().includes(s);
      if (!medHit && !docHit && !hosHit) return false;
    }
    return true;
  }), [prescriptions, filterDoctor, filterHospital, dateFrom, dateTo, search]);

  const hasFilters = !!(search || filterDoctor || filterHospital || dateFrom || dateTo);
  function clearFilters() { setSearch(""); setFilterDoctor(""); setFilterHospital(""); setDateFrom(""); setDateTo(""); }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">{t("historyTitle")}</h1>
        <p className="dash-subtitle">{prescriptions.length} consultation{prescriptions.length !== 1 ? "s" : ""} on record.</p>
      </div>

      {interactionReport?.interactions?.length > 0 && (
        <div className="interactions-alert-block card" style={{ marginBottom: 14 }}>
          <div className="interactions-alert-title">⚠ {t("interactionPatientTitle")}</div>
          <p className="muted small" style={{ margin: "0 0 6px" }}>
            {t("interactionPatientSubtitle")}
          </p>
          {interactionReport.interactions.map((ix, i) => (
            <div key={i} className={`interaction-item severity-${ix.severity}`}>
              <div className="interaction-meds">{(ix.medicines || []).join(" + ")}</div>
              <div className={`interaction-severity-badge severity-badge-${ix.severity}`}>{ix.severity}</div>
              <p className="interaction-desc">{ix.description}</p>
            </div>
          ))}
        </div>
      )}

      {prescriptions.length > 0 && (
        <div className="filter-bar card">
          <input className="filter-search" type="search" placeholder={t("historySearch")} value={search} onChange={e => setSearch(e.target.value)} />
          <div className="filter-chips">
            {doctors.length > 0 && (
              <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} className="filter-select">
                <option value="">{t("historyAllDoctors")}</option>
                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            {hospitals.length > 0 && (
              <select value={filterHospital} onChange={e => setFilterHospital(e.target.value)} className="filter-select">
                <option value="">{t("historyAllHospitals")}</option>
                {hospitals.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            <label className="filter-date-label">{t("historyFrom")} <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="filter-date" /></label>
            <label className="filter-date-label">{t("historyTo")} <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="filter-date" /></label>
            {hasFilters && <button className="btn-clear-filter" onClick={clearFilters}>{t("historyClear")}</button>}
          </div>
          {hasFilters && <p className="filter-result-text">Showing {filtered.length} of {prescriptions.length} consultations</p>}
        </div>
      )}

      {loadErr && <p className="error">{loadErr}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{hasFilters ? "🔍" : "📋"}</span>
          <p>{hasFilters ? t("historyNoMatch") : t("historyEmpty")}</p>
        </div>
      ) : (
        <div className="timeline">
          {filtered.map((rx, i) => (
            <div key={rx.id} className="timeline-item">
              <div className="tl-dot-col">
                <div className="tl-dot" />
                {i < filtered.length - 1 && <div className="tl-line" />}
              </div>
              <div className="tl-card card">
                <div className="tl-header">
                  <div className="tl-meta">
                    <span className="tl-date">{formatDate(rx.date)}</span>
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
      )}
    </div>
  );
}

// ── Audit Log Panel ───────────────────────────────────────────────────────────
function AuditPanel() {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLog()
      .then(data => setEntries(data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  function actionLabel(action) {
    if (action === "view_log")     return t("auditViewLog");
    if (action === "view_summary") return t("auditViewSummary");
    if (action === "view_interactions") return t("auditViewInteractions");
    return action;
  }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">{t("auditTitle")}</h1>
        <p className="dash-subtitle">{t("auditSubtitle")}</p>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : !entries?.length ? (
        <div className="empty-state">
          <span className="empty-icon">🔐</span>
          <p>{t("auditEmpty")}</p>
        </div>
      ) : (
        <div className="audit-list">
          {entries.map(e => (
            <div key={e.id} className="audit-item card">
              <div className="audit-icon">👨‍⚕️</div>
              <div className="audit-body">
                <strong className="audit-name">{e.accessed_by_name}</strong>
                <span className="audit-action">{actionLabel(e.action)}</span>
              </div>
              <span className="audit-time">
                {new Date(e.accessed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ user, settings, setSettings, lang, onLangChange }) {
  const [notifEnabled, setNotifEnabled] = useState(settings?.notifications_enabled ?? true);
  const [reminderTime, setReminderTime] = useState(settings?.reminder_time ?? "08:00");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    if (settings) {
      setNotifEnabled(settings.notifications_enabled);
      setReminderTime(settings.reminder_time);
    }
  }, [settings]);

  async function save() {
    try {
      const updated = await api.updateSettings({
        notifications_enabled: notifEnabled,
        reminder_time: reminderTime,
      });
      setSettings(updated);
      setSavedMsg(t("settingsSaved"));
      setTimeout(() => setSavedMsg(""), 2000);
      if (notifEnabled) requestNotifPermission();
    } catch { /* ignore */ }
  }

  return (
    <div className="dash-panel">
      <div className="dash-header">
        <h1 className="dash-title">{t("settingsTitle")}</h1>
        <p className="dash-subtitle">Manage your profile and preferences.</p>
      </div>

      <section className="card settings-card">
        <h3 className="settings-section-title">{t("settingsProfile")}</h3>
        <div className="settings-row">
          <span className="settings-label">{t("settingsName")}</span>
          <span className="settings-value">{user.name}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t("settingsPhone")}</span>
          <span className="settings-value">{user.phone}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t("settingsRole")}</span>
          <span className="badge-role">Patient</span>
        </div>
      </section>

      <section className="card settings-card">
        <h3 className="settings-section-title">{t("settingsLanguage")}</h3>
        <div className="settings-row">
          <span className="settings-label">Language / भाषा</span>
          <div className="lang-toggle-group">
            <button className={`lang-btn${lang === "en" ? " active" : ""}`} onClick={() => onLangChange("en")}>English</button>
            <button className={`lang-btn${lang === "hi" ? " active" : ""}`} onClick={() => onLangChange("hi")}>हिंदी</button>
          </div>
        </div>
      </section>

      <section className="card settings-card">
        <h3 className="settings-section-title">{t("settingsNotif")}</h3>
        <div className="settings-row">
          <div>
            <span className="settings-label">{t("settingsNotifLabel")}</span>
            <p className="settings-hint">{t("settingsNotifHint")}</p>
          </div>
          <button className={`toggle${notifEnabled ? " on" : ""}`} onClick={() => setNotifEnabled(v => !v)} aria-pressed={notifEnabled}>
            <span className="toggle-knob" />
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t("settingsReminderTime")}</span>
          <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} className="time-input" />
        </div>
        <div className="settings-row" style={{ paddingTop: 12 }}>
          <button className="primary" onClick={save} style={{ minWidth: 100 }}>{t("settingsSave")}</button>
          {savedMsg && <span style={{ color: "var(--ok-ink)", fontWeight: 600, fontSize: "0.9rem" }}>✓ {savedMsg}</span>}
        </div>
      </section>

      <section className="card settings-card">
        <h3 className="settings-section-title">{t("settingsSecurity")}</h3>
        <div className="settings-row">
          <div>
            <span className="settings-label">{t("settingsPassword")}</span>
            <p className="settings-hint">Last changed — unknown.</p>
          </div>
          <button className="btn-secondary">{t("settingsChangePassword")}</button>
        </div>
      </section>
    </div>
  );
}
