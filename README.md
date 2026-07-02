# smartRX

AI-powered prescription management + patient health tracking.

**Core loop:** a patient photographs a prescription → AI extracts structured medicine
data → a doctor enters the patient's phone number → sees the medicine history plus an
AI-generated summary.

College capstone, 2-person team, 1-week MVP. Scope is deliberately tight — see
[Future Work](#future-work) for everything intentionally left out.

---

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18 + Vite + react-router-dom |
| Backend  | Python FastAPI + SQLAlchemy 2.0 |
| Database | SQLite (dev) — swap to Postgres via `DATABASE_URL` |
| OCR / AI | Tesseract (cross-check) + Gemini vision (extraction) + Gemini (summary) |
| Auth     | JWT (python-jose), bcrypt password hashing (passlib) |
| Interactions | openFDA API + Apriori ML mining + Gemini reasoning |

The frontend and backend talk over the fixed JSON contract in
[API_CONTRACT.md](API_CONTRACT.md). Build either side against that file.

### How the OCR/AI pipeline works
1. Image goes to **Tesseract** for a printed-text confidence signal.
2. Image also goes to **Gemini vision**, which returns structured medicines.
3. If Tesseract's mean word confidence is below `TESSERACT_CONF_FLOOR` (default 60),
   the prescription is likely handwritten → we trust Gemini vision and label the
   engine `gemini_vision`; otherwise `tesseract+gemini`.
4. A **separate Gemini call** turns the stored medicine log into a doctor-facing summary.

All AI output is validated by Pydantic (`ExtractionResult`) before it touches the DB.

### Stub mode
With no `GEMINI_API_KEY` set, the backend runs in **stub mode**: Gemini calls return
canned data so the whole app boots and round-trips end to end without an API key.
Set the key (and the real `google-genai` wiring, Day 3) to go live.

---

## Run it

Two terminals. Backend first.

### 1. Backend (port 8000)
```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
uvicorn app.main:app --reload
```
API docs: http://localhost:8000/docs · health: http://localhost:8000/health

> Tesseract is optional for dev. If the `tesseract` binary isn't installed, the
> backend skips the confidence cross-check and relies on Gemini. Install it later
> for the two-engine grading story (Windows: UB-Mannheim build; macOS: `brew install
> tesseract`; Debian/Ubuntu: `apt install tesseract-ocr`).

### 2. Frontend (port 5173)
```bash
cd frontend
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run dev
```
Open http://localhost:5173.

### Demo data (optional but recommended)
Seed sample users + prescriptions (incl. an empty-history patient for the empty state):
```bash
cd backend
python seed.py
```
Logins (all password `demo1234`): doctor `9000000001`; patients `9876543210`,
`9123456780`, `9555500000`.

### Try the loop
1. Register a **patient** → upload any JPEG/PNG → see the (stubbed) extracted medicine
   appear in the history.
2. Register a **doctor** (log out first) → enter the patient's phone → see the history
   and AI summary.

See [REPORT.md](REPORT.md) for the full capstone write-up.

---

## Project layout
```
smartRX/
├── API_CONTRACT.md        # the frozen FE↔BE JSON contract
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app, CORS, router mounts, /health
│   │   ├── config.py      # settings (env-driven)
│   │   ├── database.py    # engine + session + get_db
│   │   ├── models.py      # User, Prescription, Medicine
│   │   ├── schemas.py     # Pydantic I/O + LLM-output validation
│   │   ├── auth.py        # hashing, JWT, role guards
│   │   ├── gemini_client.py  # shared Gemini wrapper (stubbed)
│   │   ├── ocr.py         # Tesseract + Gemini extraction
│   │   └── routers/       # auth, prescriptions, summary
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api.js         # thin fetch client (matches the contract)
    │   ├── App.jsx        # routes + role guard
    │   ├── pages/         # Login, Patient, Doctor
    │   └── components/    # PrescriptionList
    └── .env.example
```

---

## Security notes (v1)
- Passwords are bcrypt-hashed, never stored in plaintext.
- JWT bearer auth gates `/upload`, `/patient/{phone}`, `/summary/{phone}`.
- **Known limitation:** any authenticated user can look up *any* phone number — there
  is no per-record access control. Accepted for the v1 demo; see Future Work. Do not
  put real patient data in this build.
- Uploaded images are stored on local disk under `UPLOAD_DIR`; no encryption at rest.

---

## NEW FEATURE: Drug Interaction Detection (v2.1)

### What it does
When a patient uploads multiple prescriptions, the system automatically detects potential drug-drug interactions and flags them with severity levels. Doctors see warnings in the patient summary. Patients see safety alerts in their medical history.

**Real example:**
- Patient has Warfarin (blood thinner) + Ibuprofen (anti-inflammatory)
- System detects: ⚠️ **MILD** interaction
- Clinical note from FDA: _"Drugs that Can Increase the Risk of Bleeding... Non-steroidal Anti-Inflammatory Agents [ibuprofen]..."_
- Confidence: 82% (verified against official FDA drug label text)
- **Doctor is alerted** in patient summary. **Patient is alerted** in history tab.

### Architecture: Hybrid Signal Fusion

The system combines three independent sources to detect interactions:

1. **openFDA Drug Labels** (API Source)
   - Scans official FDA drug labels for contraindication mentions
   - Extracts relevant clinical excerpts using regex patterns
   - Returns real label text with confidence scoring
   - Most reliable for commonly known interactions

2. **Apriori Association Mining** (ML Source)
   - Analyzes historical prescription baskets across the database
   - Identifies frequently co-prescribed medicine pairs
   - Calculates support, confidence, and lift metrics
   - Infers severity from statistical signals (high lift = potential risk)
   - Catches emerging patterns from historical data

3. **Gemini LLM Reasoning** (AI Source)
   - Receives all three signal types (API + ML + context)
   - Performs clinical reasoning over medicine combinations
   - Validates interactions against known medicine list
   - Produces human-readable explanations
   - Deduplicates and ranks by severity

All three signals feed into a final Gemini call that produces a ranked, deduplicated list of clinically relevant interactions.

### API Endpoints

#### `GET /interactions/{phone}` (New)
Returns detailed interaction report with signal source breakdown:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/interactions/9123456789
```

Response:
```json
{
  "phone": "9123456789",
  "name": "John Patient",
  "medicines_analyzed": ["Warfarin", "Ibuprofen", "Lisinopril"],
  "interactions": [
    {
      "medicines": ["Ibuprofen", "Warfarin"],
      "severity": "mild",
      "description": "Table 3: Drugs that Can Increase the Risk of Bleeding...",
      "sources": ["openfda"],
      "confidence": 0.82
    }
  ],
  "signal_counts": {
    "api": 1,
    "apriori": 0,
    "gemini": 0
  },
  "generated_at": "2026-06-20T14:32:15Z"
}
```

#### `GET /summary/{phone}` (Enhanced)
Summary endpoint now includes interactions:

```json
{
  "structured": {
    "clinical_notes": "...",
    "current_medicines": [...],
    "conditions": [...],
    "allergies": [],
    "interactions": [
      { "medicines": ["Ibuprofen", "Warfarin"], "severity": "mild", ... }
    ],
    "trend": "stable"
  }
}
```

### Backend Modules

**New file:** `backend/app/interaction_engine.py` (283 lines)
- `build_interaction_report(name, prescriptions, db)` — Main orchestrator
- Signal extractors:
  - `_api_known_interactions()` — OpenFDA label scanning
  - `_mine_association_signals()` — Apriori baskets + metrics
  - `_merge_interactions()` — Deduplication & severity ranking
- Helpers: medicine name canonicalization, severity inference

**New file:** `backend/app/routers/interactions_router.py` (70 lines)
- `GET /interactions/{phone}` endpoint with auth + audit logging
- Access control: doctors can query any patient; patients only own phone

**Modified:** `backend/app/gemini_client.py`
- New `reason_drug_interactions()` helper function
- Structured prompt for LLM output validation
- Validates JSON, ensures medicines exist, enforces confidence bounds

**Modified:** `backend/app/routers/summary_router.py`
- Calls `build_interaction_report()` after generating summary
- Parses results into `DrugInteraction` schemas
- Merges interactions into doctor's summary response

### Frontend Components

**Doctor Dashboard** (`DoctorPage.jsx`)
- Summary tab displays interaction alert block
- Each interaction shows: medicines, severity badge (color-coded), FDA label excerpt
- Stat pill warning in patient header: ⚠️ Interactions

**Patient Dashboard** (`PatientPage.jsx`)
- History tab shows interaction safety alert above prescriptions
- English: _"Potential Drug Interactions Detected. Please review these warnings and consult your doctor before changing medicines."_
- Hindi: _"संभावित दवा परस्पर क्रियाएं मिलीं..."_

**Styling** (`styles.css`)
- Warm Care theme: red accents for warning severity
- Responsive cards with flex layout
- Color-coded severity badges: mild (yellow), moderate (orange), severe (red)

### Configuration

Environment variables (see `.env.example`):
```bash
INTERACTION_API_BASE_URL=https://api.fda.gov    # OpenFDA API endpoint
INTERACTION_HTTP_TIMEOUT_SEC=8                   # API request timeout
```

### File Summary

| Component | Status | Purpose |
|-----------|--------|---------|
| `interaction_engine.py` | ✨ NEW | Core signal fusion orchestration |
| `interactions_router.py` | ✨ NEW | Dedicated API endpoint |
| `schemas.py` | ✏️ MODIFIED | DrugInteraction + InteractionReportOut types |
| `gemini_client.py` | ✏️ MODIFIED | LLM reasoning + structured prompt |
| `summary_router.py` | ✏️ MODIFIED | Integration with interaction engine |
| `DoctorPage.jsx` | ✏️ MODIFIED | Interaction warning display |
| `PatientPage.jsx` | ✏️ MODIFIED | History panel integration |
| `api.js` | ✏️ MODIFIED | New `interactionReport()` client method |
| `styles.css` | ✏️ MODIFIED | Interaction UI styling |
| `i18n.js` | ✏️ MODIFIED | English + Hindi translations |

**Total:** 12 files changed, 272 lines added

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical deep-dives.

---
Intentionally out of scope for the 1-week MVP (now implemented: ✅ Medication interactions):
- Access control / consent model so a doctor only sees patients who shared with them.
- HIPAA-grade handling: encryption at rest, audit logs, ephemeral image storage.
- Real `google-genai` wiring (replace stub mode), prompt hardening, retries.
- Postgres + Alembic migrations (currently `create_all` on boot, SQLite).
- Medication reminders, refills.
- Mobile-native capture, multi-language OCR, doctor e-sign.
- Tests + CI, rate limiting, observability.
