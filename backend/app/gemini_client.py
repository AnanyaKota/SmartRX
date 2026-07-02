"""Single shared Gemini client wrapper.

Two real calls:
  - vision_extract(): image -> structured prescription JSON.
  - generate_structured_summary(): medicine log -> structured doctor-facing summary
    with drug interaction detection.

Stub mode: no GEMINI_API_KEY → canned data, app boots without a key.
"""
import json
import re

from .config import get_settings

settings = get_settings()

_client = None


def _get_client():
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            return None
        from google import genai
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _extract_json(text: str) -> dict:
    """Pull a JSON object out of a model response, tolerating ```json fences / prose."""
    if not text:
        return {}
    text = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    span = re.search(r"\{.*\}", text, re.DOTALL)
    candidate = span.group(0) if span else text
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        return {}


_VISION_PROMPT = """You are a medical prescription reader. Read this prescription image and
return ONLY a JSON object (no prose, no markdown) with exactly these keys:
{
  "doctor_name": string or null,
  "hospital": string or null,
  "date": "YYYY-MM-DD" or null,
  "confidence": number between 0 and 1 (your confidence in the extraction),
  "medicines": [
    { "name": string, "dose": string or null, "frequency": string or null,
      "duration": string or null, "instructions": string or null }
  ]
}
If a field is unreadable, use null. Never invent medicines that are not on the image.
Return [] for medicines if none are legible."""


def vision_extract(image_bytes: bytes, mime: str) -> dict:
    """Send an image to Gemini vision, return a structured prescription dict."""
    client = _get_client()
    if client is None:
        return _STUB_EXTRACTION

    from google.genai import types

    resp = client.models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            _VISION_PROMPT,
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    data = _extract_json(getattr(resp, "text", "") or "")
    return {
        "doctor_name": data.get("doctor_name"),
        "hospital": data.get("hospital"),
        "date": data.get("date"),
        "confidence": data.get("confidence"),
        "medicines": data.get("medicines") or [],
    }


_STRUCTURED_SUMMARY_PROMPT = """You are a clinical assistant. Analyze this patient's complete prescription history
and return ONLY a JSON object with these exact keys (no prose, no markdown fences):
{{
  "clinical_notes": "2-3 sentence factual overview for a doctor reading this in under 30 seconds",
  "current_medicines": [
    {{ "name": "...", "dose": "...", "frequency": "...", "last_prescribed": "YYYY-MM-DD or null", "status": "ongoing|completed|unknown" }}
  ],
  "conditions": [
    {{ "name": "...", "onset": "date or null", "status": "stable|improving|worsening|unknown" }}
  ],
  "allergies": [],
  "last_consultation": "YYYY-MM-DD or null",
  "trend": "stable|improving|worsening|insufficient_data"
}}

Rules:
- Only state what is supported by the prescription data. Do not invent diagnoses.
- current_medicines: list unique medicines. Mark ongoing if no end date visible.
- conditions: infer only if prescriptions clearly indicate a condition.
- allergies: only if explicitly mentioned. Default to [].

Patient name: {name}
Prescription data (JSON):
{data}"""


_INTERACTION_REASONING_PROMPT = """You are a medication safety assistant.
Given:
- Patient name
- A list of current medicines
- Prescription history
- Signals from external interaction APIs and association-rule mining

Return ONLY valid JSON with this exact shape:
{{
    "interactions": [
        {{
            "medicines": ["medicine A", "medicine B"],
            "severity": "mild|moderate|severe",
            "description": "human-readable clinical explanation",
            "sources": ["gemini", "api", "apriori"],
            "confidence": 0.0
        }}
    ]
}}

Rules:
- Only include interactions that are clinically plausible and supported by provided signals.
- If no credible interaction exists, return interactions as an empty list.
- Never fabricate medicines not present in the provided medicine list.
- confidence must be between 0 and 1.

Patient name: {name}
Medicines: {medicines}
Prescription data: {prescriptions}
API interaction signals: {api_signals}
Apriori association signals: {association_signals}
"""


def generate_structured_summary(name: str, prescriptions: list[dict]) -> dict:
    """Return a structured summary dict. Falls back to stub if no API key."""
    client = _get_client()
    if client is None:
        meds = [m["name"] for p in prescriptions for m in p.get("medicines", [])]
        stub = dict(_STUB_STRUCTURED)
        stub["clinical_notes"] = (
            f"[stub] {name} has {len(meds)} medicine(s) on record: " + ", ".join(meds[:5])
        )
        stub["current_medicines"] = [
            {"name": m, "dose": None, "frequency": None, "last_prescribed": None, "status": "unknown"}
            for m in meds[:10]
        ]
        return stub

    prompt = _STRUCTURED_SUMMARY_PROMPT.format(
        name=name,
        data=json.dumps(prescriptions, default=str),
    )
    resp = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=None,
    )
    raw = _extract_json(getattr(resp, "text", "") or "")
    if not raw:
        return {
            "clinical_notes": (getattr(resp, "text", "") or "").strip(),
            "current_medicines": [],
            "conditions": [],
            "allergies": [],
            "last_consultation": None,
            "trend": "insufficient_data",
        }
    return raw


def generate_summary(name: str, prescriptions: list[dict]) -> str:
    """Plain-text summary fallback (kept for backward compat)."""
    structured = generate_structured_summary(name, prescriptions)
    return structured.get("clinical_notes", "")


def reason_drug_interactions(
    name: str,
    medicine_names: list[str],
    prescriptions: list[dict],
    api_signals: list[dict],
    association_signals: list[dict],
) -> list[dict]:
    """Use Gemini to reason over interaction candidates and return typed dicts."""
    client = _get_client()
    if client is None:
        return []

    prompt = _INTERACTION_REASONING_PROMPT.format(
        name=name,
        medicines=json.dumps(medicine_names, ensure_ascii=False),
        prescriptions=json.dumps(prescriptions, default=str),
        api_signals=json.dumps(api_signals, default=str),
        association_signals=json.dumps(association_signals, default=str),
    )

    resp = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=None,
    )

    raw = _extract_json(getattr(resp, "text", "") or "")
    interactions: list[dict] = []
    for item in raw.get("interactions") or []:
        if not isinstance(item, dict):
            continue

        meds = [str(m).strip() for m in (item.get("medicines") or []) if str(m).strip()]
        if len(meds) < 2:
            continue

        severity = str(item.get("severity") or "moderate").lower()
        if severity not in {"mild", "moderate", "severe"}:
            severity = "moderate"

        confidence = item.get("confidence")
        if not isinstance(confidence, (int, float)):
            confidence = None
        elif confidence < 0:
            confidence = 0.0
        elif confidence > 1:
            confidence = 1.0

        sources = [str(s).strip().lower() for s in (item.get("sources") or []) if str(s).strip()]
        sources = list(dict.fromkeys(["gemini"] + sources))

        interactions.append(
            {
                "medicines": meds,
                "severity": severity,
                "description": str(item.get("description") or "").strip(),
                "sources": sources,
                "confidence": confidence,
            }
        )

    return interactions


_STUB_EXTRACTION = {
    "doctor_name": "Dr. Mehta",
    "hospital": "City Clinic",
    "date": "2026-06-15",
    "confidence": 0.85,
    "medicines": [
        {"name": "Amoxicillin", "dose": "500mg", "frequency": "1-0-1",
         "duration": "5 days", "instructions": "after food"}
    ],
}

_STUB_STRUCTURED = {
    "clinical_notes": "[stub] Patient is on Amoxicillin 500mg (1-0-1 × 5 days) prescribed 2026-06-15 by Dr. Mehta at City Clinic for a likely bacterial infection.",
    "current_medicines": [
        {"name": "Amoxicillin", "dose": "500mg", "frequency": "1-0-1",
         "last_prescribed": "2026-06-15", "status": "ongoing"}
    ],
    "conditions": [],
    "allergies": [],
    "last_consultation": "2026-06-15",
    "trend": "insufficient_data",
}
