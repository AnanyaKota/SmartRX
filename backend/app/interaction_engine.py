"""Drug interaction analysis engine.

This module combines three signals:
1) Public API checks (RxNav) for known interaction pairs.
2) Gemini reasoning to produce doctor/patient-friendly explanations.
3) Lightweight Apriori-style association mining over historical prescriptions.
"""
from __future__ import annotations

import re
from collections import Counter
from itertools import combinations

import httpx
from sqlalchemy.orm import Session, joinedload

from .models import Prescription
from .gemini_client import reason_drug_interactions
from .config import get_settings

SEVERITY_ORDER = {"mild": 1, "moderate": 2, "severe": 3}
settings = get_settings()


def _canonical_med_name(name: str) -> str:
    """Normalize medicine names to improve matching across sources."""
    if not name:
        return ""
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", name).lower().strip()
    tokens = [
        t
        for t in cleaned.split()
        if t not in {"mg", "mcg", "ml", "tab", "tabs", "tablet", "capsule", "syrup"}
    ]
    return " ".join(tokens).strip()


def _infer_severity(text: str) -> str:
    raw = (text or "").lower()
    if any(k in raw for k in ("contraindicated", "severe", "life-threatening", "serious")):
        return "severe"
    if any(k in raw for k in ("major", "significant", "moderate", "monitor")):
        return "moderate"
    return "mild"


def _display_name(canonical: str, alias_map: dict[str, str]) -> str:
    alias = alias_map.get(canonical)
    if alias:
        return alias
    return canonical.title()


def _unique_medicines_with_aliases(prescriptions: list[dict]) -> tuple[list[str], dict[str, str]]:
    alias_map: dict[str, str] = {}
    for rx in prescriptions:
        for med in rx.get("medicines") or []:
            raw_name = (med.get("name") or "").strip()
            key = _canonical_med_name(raw_name)
            if key and key not in alias_map:
                alias_map[key] = raw_name
    return sorted(alias_map.keys()), alias_map


def _extract_sentence_with_term(text: str, term: str) -> str:
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    needle = term.lower()
    for sentence in sentences:
        if needle in sentence.lower():
            return sentence.strip()
    return text[:280].strip()


def _openfda_interaction_text(client: httpx.Client, med_name: str) -> str:
    try:
        res = client.get(
            "/drug/label.json",
            params={
                "search": f'openfda.generic_name:"{med_name}"',
                "limit": 1,
            },
        )
        if res.status_code != 200:
            return ""
        data = res.json() or {}
        results = data.get("results") or []
        if not results:
            return ""
        interactions = results[0].get("drug_interactions") or []
        return "\n".join(interactions).strip()
    except Exception:
        return ""


def _api_known_interactions(medicine_names: list[str], alias_map: dict[str, str]) -> list[dict]:
    if len(medicine_names) < 2:
        return []

    found: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    try:
        with httpx.Client(base_url=settings.interaction_api_base_url, timeout=settings.interaction_http_timeout_sec) as client:
            label_map = {med: _openfda_interaction_text(client, med) for med in medicine_names}

            for a, b in combinations(medicine_names, 2):
                pair_key = tuple(sorted((a, b)))
                if pair_key in seen_pairs:
                    continue

                text_a = label_map.get(a) or ""
                text_b = label_map.get(b) or ""
                mention_a = b in text_a.lower()
                mention_b = a in text_b.lower()
                if not mention_a and not mention_b:
                    continue

                seen_pairs.add(pair_key)
                excerpt_source = text_a if mention_a else text_b
                excerpt_term = b if mention_a else a
                desc = _extract_sentence_with_term(excerpt_source, excerpt_term)

                found.append(
                    {
                        "medicines": [_display_name(a, alias_map), _display_name(b, alias_map)],
                        "severity": _infer_severity(desc),
                        "description": desc,
                        "sources": ["openfda"],
                        "confidence": 0.82,
                    }
                )
    except Exception:
        return []

    return found


def _global_prescription_baskets(db: Session) -> list[set[str]]:
    rows = (
        db.query(Prescription)
        .options(joinedload(Prescription.medicines))
        .all()
    )

    baskets: list[set[str]] = []
    for rx in rows:
        basket = {
            _canonical_med_name(m.name)
            for m in rx.medicines
            if (m.name or "").strip()
        }
        basket = {b for b in basket if b}
        if len(basket) >= 2:
            baskets.append(basket)
    return baskets


def _mine_association_signals(
    global_baskets: list[set[str]],
    patient_meds: set[str],
    alias_map: dict[str, str],
    min_support: float = 0.03,
    min_confidence: float = 0.22,
    min_lift: float = 1.1,
    min_count: int = 2,
) -> list[dict]:
    """Generate Apriori-style pair signals over the global corpus.

    These are evidence signals for reasoning, not direct clinical conclusions.
    """
    if not global_baskets:
        return []

    item_counts: Counter[str] = Counter()
    pair_counts: Counter[tuple[str, str]] = Counter()

    for basket in global_baskets:
        for item in basket:
            item_counts[item] += 1
        for a, b in combinations(sorted(basket), 2):
            pair_counts[(a, b)] += 1

    total = len(global_baskets)
    signals: list[dict] = []

    for (a, b), pair_count in pair_counts.items():
        if pair_count < min_count:
            continue
        if a not in patient_meds or b not in patient_meds:
            continue

        support = pair_count / total
        conf_ab = pair_count / item_counts[a] if item_counts[a] else 0.0
        conf_ba = pair_count / item_counts[b] if item_counts[b] else 0.0
        lift = (pair_count * total) / (item_counts[a] * item_counts[b]) if item_counts[a] and item_counts[b] else 0.0

        if support < min_support or max(conf_ab, conf_ba) < min_confidence or lift < min_lift:
            continue

        sev = "mild"
        if lift >= 2.6:
            sev = "severe"
        elif lift >= 1.7:
            sev = "moderate"

        signals.append(
            {
                "medicines": [_display_name(a, alias_map), _display_name(b, alias_map)],
                "severity": sev,
                "description": (
                    "Association signal: these medicines co-occur in historical prescriptions "
                    f"(support={support:.2f}, confidence={max(conf_ab, conf_ba):.2f}, lift={lift:.2f})."
                ),
                "sources": ["apriori"],
                "confidence": min(0.88, 0.45 + max(0.0, lift - 1.0) * 0.2),
                "metrics": {
                    "support": round(support, 4),
                    "confidence": round(max(conf_ab, conf_ba), 4),
                    "lift": round(lift, 4),
                    "count": pair_count,
                },
            }
        )

    return signals


def _merge_interactions(*groups: list[dict]) -> list[dict]:
    merged: dict[tuple[str, ...], dict] = {}

    for group in groups:
        for item in group or []:
            meds = sorted({m.strip() for m in (item.get("medicines") or []) if m and m.strip()})
            if len(meds) < 2:
                continue

            key = tuple(meds)
            severity = (item.get("severity") or "moderate").lower()
            if severity not in SEVERITY_ORDER:
                severity = "moderate"

            existing = merged.get(key)
            if not existing:
                merged[key] = {
                    "medicines": meds,
                    "severity": severity,
                    "description": (item.get("description") or "").strip(),
                    "sources": list(dict.fromkeys(item.get("sources") or [])),
                    "confidence": item.get("confidence"),
                }
                continue

            if SEVERITY_ORDER[severity] > SEVERITY_ORDER[existing["severity"]]:
                existing["severity"] = severity

            desc = (item.get("description") or "").strip()
            if desc and len(desc) > len(existing.get("description") or ""):
                existing["description"] = desc

            existing["sources"] = list(dict.fromkeys((existing.get("sources") or []) + (item.get("sources") or [])))

            new_conf = item.get("confidence")
            if isinstance(new_conf, (int, float)):
                old_conf = existing.get("confidence")
                if not isinstance(old_conf, (int, float)) or new_conf > old_conf:
                    existing["confidence"] = float(new_conf)

    return sorted(
        merged.values(),
        key=lambda x: (
            -SEVERITY_ORDER.get(x.get("severity") or "moderate", 2),
            -(x.get("confidence") if isinstance(x.get("confidence"), (int, float)) else 0.0),
            "+".join(x.get("medicines") or []),
        ),
    )


def build_interaction_report(name: str, prescriptions: list[dict], db: Session) -> dict:
    """Build an interaction report from API, Gemini, and Apriori signals."""
    medicine_keys, alias_map = _unique_medicines_with_aliases(prescriptions)
    if len(medicine_keys) < 2:
        return {
            "name": name,
            "medicines_analyzed": [_display_name(k, alias_map) for k in medicine_keys],
            "interactions": [],
            "signal_counts": {"api": 0, "apriori": 0, "gemini": 0},
        }

    api_hits = _api_known_interactions(medicine_keys, alias_map)
    global_baskets = _global_prescription_baskets(db)
    apriori_hits = _mine_association_signals(global_baskets, set(medicine_keys), alias_map)

    gemini_hits = reason_drug_interactions(
        name=name,
        medicine_names=[_display_name(k, alias_map) for k in medicine_keys],
        prescriptions=prescriptions,
        api_signals=api_hits,
        association_signals=apriori_hits,
    )

    merged = _merge_interactions(api_hits, gemini_hits)

    return {
        "name": name,
        "medicines_analyzed": [_display_name(k, alias_map) for k in medicine_keys],
        "interactions": merged,
        "signal_counts": {
            "api": len(api_hits),
            "apriori": len(apriori_hits),
            "gemini": len(gemini_hits),
        },
    }
