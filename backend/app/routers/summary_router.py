"""Doctor endpoint: structured AI-generated patient summary with drug interaction detection."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import ValidationError

from ..auth import require_role
from ..database import get_db
from ..models import User, AccessLog
from ..schemas import (
    SummaryOut, StructuredSummary, StructuredMed, StructuredCondition, DrugInteraction,
)
from ..gemini_client import generate_structured_summary
from ..interaction_engine import build_interaction_report

router = APIRouter(tags=["summary"])


def _parse_structured(raw: dict) -> StructuredSummary:
    """Convert raw Gemini dict to StructuredSummary, normalising field shapes."""
    meds = []
    for m in raw.get("current_medicines") or []:
        if isinstance(m, dict):
            meds.append(StructuredMed(
                name=m.get("name", ""),
                dose=m.get("dose"),
                frequency=m.get("frequency"),
                last_prescribed=m.get("last_prescribed"),
                status=m.get("status", "unknown"),
            ))

    conditions = []
    for c in raw.get("conditions") or []:
        if isinstance(c, dict):
            conditions.append(StructuredCondition(
                name=c.get("name", ""),
                onset=c.get("onset"),
                status=c.get("status", "unknown"),
            ))

    interactions = []
    for ix in raw.get("interactions") or []:
        if isinstance(ix, dict):
            interactions.append(DrugInteraction(
                medicines=ix.get("medicines") or [],
                severity=ix.get("severity") or "moderate",
                description=ix.get("description") or "",
                sources=ix.get("sources") or [],
                confidence=ix.get("confidence"),
            ))

    return StructuredSummary(
        clinical_notes=raw.get("clinical_notes") or "",
        current_medicines=meds,
        conditions=conditions,
        allergies=raw.get("allergies") or [],
        interactions=interactions,
        last_consultation=raw.get("last_consultation"),
        trend=raw.get("trend") or "insufficient_data",
    )


@router.get("/summary/{phone}", response_model=SummaryOut)
def patient_summary(
    phone: str,
    doctor: User = Depends(require_role("doctor")),
    db: Session = Depends(get_db),
):
    patient = db.get(User, phone)
    if not patient or patient.role != "patient":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no records found")

    prescriptions = [
        {
            "doctor_name": rx.doctor_name,
            "hospital": rx.hospital,
            "date": str(rx.date) if rx.date else None,
            "medicines": [
                {"name": m.name, "dose": m.dose, "frequency": m.frequency,
                 "duration": m.duration, "instructions": m.instructions}
                for m in rx.medicines
            ],
        }
        for rx in patient.prescriptions
    ]
    med_count = sum(len(p["medicines"]) for p in prescriptions)

    # Audit log
    db.add(AccessLog(
        accessed_by_phone=doctor.phone,
        accessed_by_name=doctor.name,
        patient_phone=phone,
        action="view_summary",
    ))
    db.commit()

    if med_count == 0:
        return SummaryOut(
            phone=patient.phone, name=patient.name, summary="",
            structured=StructuredSummary(clinical_notes=""),
            medicine_count=0, generated_at=None,
        )

    raw = generate_structured_summary(patient.name, prescriptions)
    try:
        structured = _parse_structured(raw)
    except (ValidationError, Exception):
        structured = StructuredSummary(clinical_notes=str(raw))

    report = build_interaction_report(patient.name, prescriptions, db)
    structured.interactions = [
        DrugInteraction(**item)
        for item in report.get("interactions") or []
    ]

    return SummaryOut(
        phone=patient.phone,
        name=patient.name,
        summary=structured.clinical_notes,
        structured=structured,
        medicine_count=med_count,
        generated_at=datetime.now(timezone.utc),
    )
