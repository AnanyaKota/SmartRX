# smartRX Architecture: Drug Interaction Detection

## Overview

The drug interaction detection module combines three independent signal sources into a unified, high-confidence recommendation system:

```
┌─────────────────────────────────────────────────────────────────┐
│                   Doctor/Patient Request                        │
│             GET /interactions/{phone}  OR                        │
│             GET /summary/{phone} (enriched)                     │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
        ┌───────────▼─────────────┐  ┌──────────▼────────────┐
        │   Signal Extraction     │  │   Historical Context  │
        ├─────────────────────────┤  ├───────────────────────┤
        │ 1. openFDA API Labels   │  │ All prescriptions     │
        │ 2. Apriori ML Mining    │  │ for patient           │
        │ 3. Patient history      │  │                       │
        └───────────┬─────────────┘  └───────────┬───────────┘
                    │                            │
                    └────────────────┬───────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │   Merge & Deduplicate          │
                    │   (by medicine pair)            │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │   Gemini LLM Reasoning          │
                    │   (Validate + Re-rank)          │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │   Return Interactions[]         │
                    │   with severity + confidence    │
                    └────────────────────────────────┘
```

---

## Signal 1: openFDA API Labels

### Purpose
Query official FDA drug labels to find real contraindication mentions between medicine pairs.

### Implementation

**File:** `backend/app/interaction_engine.py` → `_api_known_interactions()`

```python
def _api_known_interactions(medicine_names, alias_map):
    """
    For each medicine pair, query openFDA API for drug labels
    mentioning both medicines in the same contraindication section.
    """
    interactions = []
    
    for med1, med2 in combinations(medicine_names, 2):
        # Canonicalize names (e.g., "Ibuprofen 400mg" → "ibuprofen")
        canonical_1 = _canonical_med_name(med1)
        canonical_2 = _canonical_med_name(med2)
        
        # Query: get labels for med1, check if they mention med2
        label = query_fda_label(canonical_1)
        
        if label and _mentions_both(label, canonical_1, canonical_2):
            severity = _infer_severity(label)  # Extract from text: mild/moderate/severe
            desc = _extract_sentence_with_term(label, "bleeding" or "interact")
            
            interactions.append({
                "medicines": [med1, med2],
                "severity": severity,
                "description": desc,
                "sources": ["openfda"],
                "confidence": 0.82,  # FDA label = high confidence
            })
    
    return interactions
```

### API Details
- **Endpoint:** `https://api.fda.gov/drug/label.json?search=openfda_generic_name:"ibuprofen"`
- **Response:** Official FDA label JSON with contraindication tables
- **Parsing:** Regex extraction of contraindication sections and relevant medicines
- **Timeout:** 8 seconds per request (configurable via `INTERACTION_HTTP_TIMEOUT_SEC`)
- **Caching:** None (stateless per request)

### Confidence Scoring
- **FDA label mention:** 82% confidence (official source, but may not apply to all patients)
- Severity inferred from label language:
  - **Severe:** "contraindicated", "do not use", "risk of death"
  - **Moderate:** "increased risk", "avoid if possible", "monitor"
  - **Mild:** "may increase effect", "caution", "interaction possible"

### Example Output
```json
{
  "medicines": ["Ibuprofen", "Warfarin"],
  "severity": "mild",
  "description": "Table 3: Drugs that Can Increase the Risk of Bleeding...",
  "sources": ["openfda"],
  "confidence": 0.82
}
```

---

## Signal 2: Apriori ML Mining

### Purpose
Discover frequently co-prescribed medicine pairs in historical data. High co-prescription frequency suggests doctors intentionally use them together (safe), but high *unexpectedness* (high lift) suggests potential risk.

### Implementation

**File:** `backend/app/interaction_engine.py` → `_mine_association_signals()`

```python
def _mine_association_signals(prescriptions, patient_meds, min_support=0.01):
    """
    Apriori algorithm to find medicine pairs with high lift.
    Lift = P(B|A) / P(B)  — if lift > 2.6, pair is "suspiciously frequent"
    """
    # 1. Build transaction baskets: each prescription = 1 basket of medicines
    baskets = [set(rx.medicines) for rx in prescriptions]
    
    # 2. Calculate frequent pairs (support >= min_support)
    frequent_pairs = apriori(baskets, min_support=0.01)
    
    # 3. For each pair, calculate lift
    interactions = []
    for pair in frequent_pairs:
        med1, med2 = pair
        
        # Support: fraction of baskets containing both
        support = count_baskets_with_both(baskets, med1, med2) / len(baskets)
        
        # Confidence: P(med2 | med1)
        confidence = count_baskets_with_both(baskets, med1, med2) / count_baskets_with(baskets, med1)
        
        # Lift: confidence / P(med2)
        p_med2 = count_baskets_with(baskets, med2) / len(baskets)
        lift = confidence / p_med2
        
        # High lift = unexpected co-prescription = potential risk signal
        if lift >= 2.6:
            severity = _infer_severity_from_lift(lift)  # lift 2.6-5 = moderate, >5 = severe
            
            interactions.append({
                "medicines": [med1, med2],
                "severity": severity,
                "description": f"Unusual co-prescription pattern (lift={lift:.2f}, support={support:.1%})",
                "sources": ["apriori"],
                "confidence": min(support, 0.95),  # Higher support = higher confidence
            })
    
    return interactions
```

### Severity Mapping
- **Severe:** Lift ≥ 5 (5x more likely than random)
- **Moderate:** Lift 2.6–5 (2.6–5x more likely)
- **Mild:** Lift 1.5–2.6 (slight elevation)

### Confidence Scoring
- **Support-based:** Higher support (more baskets) → higher confidence
- Max confidence capped at 95% (ML signals are probabilistic, not deterministic)

### Example
```
Database has 1000 prescriptions total:
- 50 contain Warfarin
- 30 contain Ibuprofen
- 15 contain both

Support = 15/1000 = 1.5%
Confidence = 15/50 = 30%
P(Ibuprofen) = 30/1000 = 3%
Lift = 30% / 3% = 10x

Interpretation: Patients on Warfarin are 10x more likely to ALSO be on Ibuprofen than random chance.
This is suspicious → flag as severe interaction candidate.
```

### Edge Cases
- **Cold start (few prescriptions):** Lift calculations unstable; confidence capped lower
- **Rare medicines:** May never co-occur; no signal generated
- **Safe combinations:** Lift < 1.5 ignored (common, likely intentional co-therapy)

---

## Signal 3: Gemini LLM Reasoning

### Purpose
Apply clinical knowledge to merge signals, validate against known safe combinations, and generate human-readable explanations.

### Implementation

**File:** `backend/app/gemini_client.py` → `reason_drug_interactions()`

```python
def reason_drug_interactions(
    name: str,
    medicine_names: list,
    prescriptions,
    api_signals: list,
    association_signals: list
) -> list:
    """
    Send all signals to Gemini with a structured prompt.
    Gemini validates, deduplicates, and re-ranks by clinical significance.
    """
    prompt = f"""
You are a clinical pharmacist reviewing potential drug interactions.

Patient: {name}
Medicines: {medicine_names}

API Signals (FDA labels): {json.dumps(api_signals, indent=2)}
ML Signals (co-prescription patterns): {json.dumps(association_signals, indent=2)}

Tasks:
1. Review all signals
2. Reject any medicine that is NOT in the medicine list
3. Reject any interaction without clinical basis (e.g., fabricated medicines)
4. Rank remaining interactions by clinical severity
5. Provide confidence 0-1 reflecting signal agreement

Return JSON:
{{
  "interactions": [
    {{
      "medicines": ["med1", "med2"],
      "severity": "mild|moderate|severe",
      "description": "clinical explanation",
      "sources": ["api", "apriori", "gemini"],
      "confidence": 0.95
    }}
  ]
}}
"""
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        response_schema=StructuredInteractionSchema,
    )
    
    return response.parsed.interactions
```

### Structured Prompt Design
- **Explicit constraints:** Only return medicines in the patient's medicine list
- **Ranking:** Severity-first ordering (severe → moderate → mild)
- **Deduplication:** Combine signals for the same medicine pair; take highest severity
- **Confidence:** Reflect agreement across signals:
  - API + Apriori + Gemini agree: confidence ≥ 0.95
  - 2 signals agree: confidence 0.75–0.90
  - 1 signal only: confidence ≤ 0.70

### Validation
- Gemini must return valid JSON matching `InteractionReportOut` schema
- All medicines must exist in the patient's medicine list
- Confidence must be between 0 and 1
- Severity must be one of: `mild`, `moderate`, `severe`

### Example
Input signals:
```json
{
  "api_signals": [
    {
      "medicines": ["Ibuprofen", "Warfarin"],
      "severity": "mild",
      "description": "FDA label mentions bleeding risk...",
      "confidence": 0.82
    }
  ],
  "association_signals": [
    {
      "medicines": ["Ibuprofen", "Warfarin"],
      "severity": "severe",
      "description": "10x co-prescription lift",
      "confidence": 0.88
    }
  ]
}
```

Gemini output:
```json
{
  "interactions": [
    {
      "medicines": ["Ibuprofen", "Warfarin"],
      "severity": "moderate",  // Elevated from FDA "mild" due to ML signal
      "description": "Potential bleeding risk. NSAIDs reduce Warfarin efficacy...",
      "sources": ["openfda", "apriori", "gemini"],
      "confidence": 0.93  // High confidence: 2 signals agree, Gemini validated
    }
  ]
}
```

---

## Merge & Deduplicate

**File:** `backend/app/interaction_engine.py` → `_merge_interactions()`

```python
def _merge_interactions(*signal_groups):
    """
    Combine interactions from all three sources.
    For the same medicine pair, take highest severity and merge sources.
    """
    # Create dict keyed by frozenset(medicines)
    merged = {}
    
    for signal_group in signal_groups:
        for ix in signal_group:
            key = frozenset(ix["medicines"])
            
            if key not in merged:
                merged[key] = ix
            else:
                # Same pair detected again; upgrade severity if needed
                prev_severity = severity_rank(merged[key]["severity"])
                new_severity = severity_rank(ix["severity"])
                
                if new_severity > prev_severity:
                    merged[key]["severity"] = ix["severity"]
                
                # Merge sources
                merged[key]["sources"] = list(set(
                    merged[key]["sources"] + ix["sources"]
                ))
                
                # Average confidence
                merged[key]["confidence"] = (
                    merged[key]["confidence"] + ix["confidence"]
                ) / 2
    
    # Sort by severity: severe → moderate → mild
    return sorted(
        merged.values(),
        key=lambda ix: (-severity_rank(ix["severity"]), -ix["confidence"])
    )
```

### Ranking Function
```python
def severity_rank(sev: str) -> int:
    return {"severe": 3, "moderate": 2, "mild": 1}.get(sev, 0)
```

### Deduplication Logic
- **Same pair detected multiple times:** Keep highest severity, merge source list
- **Confidence averaging:** Reflects agreement across signals
  - API only: 0.82
  - Apriori only: 0.50–0.95 (depends on support)
  - API + Apriori + Gemini: 0.90–0.98

---

## Integration Points

### API Endpoint

**File:** `backend/app/routers/interactions_router.py`

```python
@router.get("/interactions/{phone}", response_model=InteractionReportOut)
def interaction_report(phone: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """
    Main endpoint called by doctor or patient.
    Returns full report with signal breakdowns.
    """
    # 1. Fetch patient
    patient = db.get(User, phone)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # 2. Check access (doctor can access any patient, patient only own)
    if user.role == "patient" and user.phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # 3. Build report (calls all 3 signal sources)
    report = build_interaction_report(patient.name, patient.prescriptions, db)
    
    # 4. Log audit entry
    db.add(AccessLog(
        accessed_by_phone=user.phone,
        accessed_by_name=user.name,
        patient_phone=phone,
        action="view_interactions",
        accessed_at=datetime.utcnow()
    ))
    db.commit()
    
    return report
```

### Summary Endpoint Enhancement

**File:** `backend/app/routers/summary_router.py`

```python
@router.get("/summary/{phone}", response_model=SummaryOut)
def patient_summary(phone: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # ... existing summary logic ...
    
    # NEW: Also fetch interactions
    interaction_report = build_interaction_report(patient.name, patient.prescriptions, db)
    
    # NEW: Merge into structured summary
    structured.interactions = [
        DrugInteraction(**ix) for ix in interaction_report["interactions"]
    ]
    
    return SummaryOut(
        phone=phone,
        name=patient.name,
        structured=structured,
        generated_at=datetime.utcnow()
    )
```

---

## Database Schema (Unchanged)

No new tables required. Interactions are generated on-demand and not persisted.

```
users (phone PK, name, role, password_hash)
prescriptions (id, patient_phone FK, doctor_name, hospital, date, engine, confidence)
medicines (id, prescription_id FK, name, dose, frequency, duration)
access_logs (id, accessed_by_phone, accessed_by_name, patient_phone, action, accessed_at)
  └── NEW action: "view_interactions"
```

---

## Performance Considerations

### API Latency

| Signal | Time | Notes |
|--------|------|-------|
| Fetch prescriptions | 5–10ms | DB query, indexed by phone |
| openFDA API call | 500ms–2s | HTTP round-trip, ~8s timeout |
| Apriori mining | 10–50ms | In-memory algorithm, ~1000 prescriptions |
| Gemini reasoning | 1–3s | LLM call, cached model on Google servers |
| **Total** | **2–5s** | Doctor/patient waits 2–5 seconds for report |

### Optimization Strategies
1. **Parallel signal extraction:** Run API + Apriori + DB fetch in parallel
2. **Caching:** Cache interaction reports per patient for 1 hour
3. **Async Gemini calls:** Submit to queue if latency > 3s, return cached result
4. **Batch API queries:** Group medicines and batch openFDA requests

### Frontend Optimization
```javascript
// DoctorPage.jsx: Parallel loading
const [summary, interactions] = await Promise.all([
  api.summary(phone),
  api.interactionReport(phone).catch(() => null)  // Non-blocking
]);
```

---

## Testing

### Unit Tests
1. **Signal extractors:** Mock API responses, test parsing
2. **Merge logic:** Test deduplication, severity ranking
3. **Gemini parsing:** Mock LLM response, validate schema

### Integration Tests
1. End-to-end: Seed prescriptions → call `/interactions/{phone}` → verify response
2. Access control: Patient can only query own phone
3. Audit logging: Verify AccessLog entry created

### Load Tests
- 100 concurrent requests to `/interactions/{phone}`
- Monitor API timeouts, memory usage
- Measure percentile latencies (p50, p95, p99)

---

## Configuration

```bash
# .env file
INTERACTION_API_BASE_URL=https://api.fda.gov     # OpenFDA endpoint
INTERACTION_HTTP_TIMEOUT_SEC=8                    # Timeout per request
APRIORI_MIN_SUPPORT=0.01                          # 1% of prescriptions
APRIORI_MIN_LIFT=1.5                              # 1.5x co-prescription
GEMINI_MODEL=gemini-2.5-flash                     # LLM model
```

---

## Future Enhancements

1. **Real-time monitoring:** Dashboard showing top interactions across all patients
2. **Severity thresholds:** Alert patient for severe interactions immediately
3. **Medication alternatives:** Suggest safer alternatives when interaction detected
4. **Longitudinal tracking:** Track how interactions resolve over time
5. **Comparative analysis:** "This patient's interaction profile vs. similar patients"
6. **Regulatory updates:** Subscribe to FDA label change feeds, refresh interactions monthly

---

## References

- **Apriori Algorithm:** Rakesh Agrawal & Ramakrishnan Srikant. "Fast Algorithms for Mining Association Rules." VLDB 1994.
- **Lift Metric:** Tan et al. "Introduction to Data Mining." Pearson, 2006.
- **FDA Labels:** https://api.fda.gov/drug/label.json
- **Gemini API:** https://ai.google.dev/docs
