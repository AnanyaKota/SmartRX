import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession, getUser } from "../api.js";

// Code-split the 3D backdrop: the form paints instantly, three.js streams in.
// Swap back to ThreeBackground.jsx to restore the light glossy-helix look.
const ThreeBackground = lazy(() => import("../components/DnaParticles.jsx"));

const EMPTY = { phone: "", password: "", name: "", role: "patient", hospital_name: "", specialization: "" };

/* ---- inline line icons (stroke = currentColor) ---- */
const Icon = {
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  hospital: (
    <>
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <path d="M12 8v6M9 11h6" />
    </>
  ),
  badge: (
    <>
      <path d="M12 2v4M8 4h8" />
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M12 11v4M10 13h4" />
    </>
  ),
  pill: (
    <>
      <path d="M10.6 20.4 3.6 13.4a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" />
      <path d="M7 10 14 17" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  pulse: <path d="M2 12h3.5l2.5 7 4-15 2.5 8H20" />,
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.3-7 9-4-1.7-7-4.5-7-9V6l7-3z" />
      <path d="M9.2 11.8 11 13.6 14.8 9.8" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3H5a1 1 0 0 0-1 1v5a5 5 0 0 0 10 0V4a1 1 0 0 0-1-1h-1" />
      <path d="M9 14v1a6 6 0 0 0 6 6 4 4 0 0 0 4-4v-2" />
      <circle cx="19" cy="11" r="2" />
    </>
  ),
};

function Glyph({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {Icon[name]}
    </svg>
  );
}

function Field({ icon, label, ...props }) {
  return (
    <label className="auth-field">
      <span className="auth-field-icon">
        <Glyph name={icon} />
      </span>
      <input placeholder=" " {...props} />
      <span className="auth-field-label">{label}</span>
    </label>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = getUser();
    if (existing) {
      navigate(existing.role === "doctor" ? "/doctor" : "/patient", { replace: true });
    }
  }, [navigate]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await api.register({
              phone: form.phone,
              password: form.password,
              name: form.name,
              role: form.role,
              hospital_name: form.role === "doctor" && form.hospital_name ? form.hospital_name : undefined,
              specialization: form.role === "doctor" && form.specialization ? form.specialization : undefined,
            })
          : await api.login(form.phone, form.password);
      setSession(res.token, res.user);
      navigate(res.user.role === "doctor" ? "/doctor" : "/patient", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="auth-screen auth-dark">
      <Suspense fallback={null}>
        <ThreeBackground />
      </Suspense>
      <div className="auth-grain" aria-hidden="true" />

      <nav className="auth-topnav">
        <button type="button" className="auth-topnav-link" onClick={() => navigate("/about")}>
          About us
        </button>
      </nav>

      <div className="auth-shell">
        {/* ── hero / brand panel ── */}
        <aside className="auth-hero">
          <div className="auth-brand">
            <span className="auth-brand-mark"><Glyph name="pill" /></span>
            <span className="auth-brand-name">smartRX</span>
          </div>

          <h1 className="auth-hero-title">
            Your prescriptions,<br />
            <span className="auth-hero-accent">understood</span>.
          </h1>
          <p className="auth-hero-sub">
            Snap a prescription. AI reads it, tracks your medicines, and gives your
            doctor a clear clinical picture — in seconds.
          </p>

          <ul className="auth-features">
            <li>
              <span className="auth-feat-ico"><Glyph name="camera" /></span>
              <div>
                <strong>Scan &amp; extract</strong>
                <span>AI vision reads any prescription photo.</span>
              </div>
            </li>
            <li>
              <span className="auth-feat-ico"><Glyph name="pulse" /></span>
              <div>
                <strong>Doctor-ready summary</strong>
                <span>Conditions, medicines &amp; trends at a glance.</span>
              </div>
            </li>
            <li>
              <span className="auth-feat-ico"><Glyph name="shield" /></span>
              <div>
                <strong>Private &amp; audited</strong>
                <span>You see every access to your records.</span>
              </div>
            </li>
          </ul>

          <div className="auth-pills">
            <span className="auth-pill"><i className="dot dot-coral" /> AI-powered</span>
            <span className="auth-pill"><i className="dot dot-amber" /> HIPAA-minded</span>
          </div>
        </aside>

        {/* ── form panel ── */}
        <main className="auth-panel">
          <div className="auth-card-glass">
            <div className="auth-card-head">
              <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
              <p className="muted">
                {isRegister ? "Join smartRX in under a minute." : "Log in to continue to smartRX."}
              </p>
            </div>

            <div className="auth-toggle" data-mode={mode}>
              <span className="auth-toggle-thumb" />
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => switchMode("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={isRegister ? "active" : ""}
                onClick={() => switchMode("register")}
              >
                Register
              </button>
            </div>

            <form onSubmit={submit} className="auth-form">
              <Field
                icon="phone"
                label="Phone number"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                required
                autoComplete="username"
              />

              {isRegister && (
                <Field
                  icon="user"
                  label="Full name"
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              )}

              <Field
                icon="lock"
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
                autoComplete={isRegister ? "new-password" : "current-password"}
              />

              {isRegister && (
                <div className="auth-role">
                  <span className="auth-role-label">I am a</span>
                  <div className="auth-role-grid">
                    <button
                      type="button"
                      className={form.role === "patient" ? "auth-role-opt active" : "auth-role-opt"}
                      onClick={() => update("role", "patient")}
                    >
                      <span className="auth-role-ico"><Glyph name="user" /></span>
                      Patient
                    </button>
                    <button
                      type="button"
                      className={form.role === "doctor" ? "auth-role-opt active" : "auth-role-opt"}
                      onClick={() => update("role", "doctor")}
                    >
                      <span className="auth-role-ico"><Glyph name="stethoscope" /></span>
                      Doctor
                    </button>
                  </div>
                </div>
              )}

              {isRegister && form.role === "doctor" && (
                <div className="auth-doctor-fields">
                  <Field
                    icon="hospital"
                    label="Hospital / clinic name"
                    type="text"
                    value={form.hospital_name}
                    onChange={(e) => update("hospital_name", e.target.value)}
                  />
                  <Field
                    icon="badge"
                    label="Specialization"
                    type="text"
                    value={form.specialization}
                    onChange={(e) => update("specialization", e.target.value)}
                  />
                </div>
              )}

              {error && (
                <p className="auth-error" role="alert">
                  <span>⚠</span> {error}
                </p>
              )}

              <button type="submit" className="auth-submit" disabled={busy}>
                <span>{busy ? "Working…" : isRegister ? "Create account" : "Log in"}</span>
              </button>
            </form>

            <p className="auth-switch">
              {isRegister ? "Already have an account?" : "New to smartRX?"}{" "}
              <button type="button" onClick={() => switchMode(isRegister ? "login" : "register")}>
                {isRegister ? "Log in" : "Create one"}
              </button>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
