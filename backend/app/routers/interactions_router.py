"""Drug interaction endpoint for doctor and patient dashboards."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import User, AccessLog
from ..schemas import InteractionReportOut, DrugInteraction
from ..interaction_engine import build_interaction_report

router = APIRouter(tags=["interactions"])


@router.get("/interactions/{phone}", response_model=InteractionReportOut)
def interaction_report(
    phone: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.role == "patient" and user.phone != phone:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "access denied")

    patient = db.get(User, phone)
    if not patient or patient.role != "patient":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no records found")

    prescriptions = [
        {
            "doctor_name": rx.doctor_name,
            "hospital": rx.hospital,
            "date": str(rx.date) if rx.date else None,
            "medicines": [
                {
                    "name": m.name,
                    "dose": m.dose,
                    "frequency": m.frequency,
                    "duration": m.duration,
                    "instructions": m.instructions,
                }
                for m in rx.medicines
            ],
        }
        for rx in patient.prescriptions
    ]

    if user.role == "doctor":
        db.add(
            AccessLog(
                accessed_by_phone=user.phone,
                accessed_by_name=user.name,
                patient_phone=phone,
                action="view_interactions",
            )
        )
        db.commit()

    report = build_interaction_report(patient.name, prescriptions, db)

    return InteractionReportOut(
        phone=patient.phone,
        name=patient.name,
        medicines_analyzed=report.get("medicines_analyzed") or [],
        interactions=[DrugInteraction(**item) for item in (report.get("interactions") or [])],
        signal_counts=report.get("signal_counts") or {},
        generated_at=datetime.now(timezone.utc),
    )
