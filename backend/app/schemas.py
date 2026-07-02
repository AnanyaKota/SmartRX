"""Pydantic schemas — request/response shapes + LLM-output validation."""
import datetime as dt
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---- auth ----
class RegisterIn(BaseModel):
    phone: str = Field(min_length=5, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=4, max_length=128)
    role: Literal["patient", "doctor"]
    hospital_name: Optional[str] = Field(None, max_length=160)
    specialization: Optional[str] = Field(None, max_length=100)


class LoginIn(BaseModel):
    phone: str
    password: str


class UserOut(BaseModel):
    phone: str
    name: str
    role: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


# ---- medicines / prescriptions ----
class MedicineOut(BaseModel):
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class MedicineIn(BaseModel):
    name: str = Field(min_length=1)
    dose: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class ExtractionResult(BaseModel):
    """What the OCR/AI layer returns. Validates raw Gemini JSON."""
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    date: Optional[dt.date] = None
    engine: str
    confidence: Optional[float] = None
    medicines: list[MedicineOut] = []


class PrescriptionOut(BaseModel):
    id: int
    phone: str
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    date: Optional[dt.date] = None
    engine: Optional[str] = None
    confidence: Optional[float] = None
    medicines: list[MedicineOut] = []


class PrescriptionLite(BaseModel):
    id: int
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    date: Optional[dt.date] = None
    image_path: Optional[str] = None
    medicines: list[MedicineOut] = []


class PrescriptionPatch(BaseModel):
    """Partial update for editing extracted prescription data."""
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    date: Optional[dt.date] = None
    medicines: Optional[list[MedicineIn]] = None


class PatientLogOut(BaseModel):
    phone: str
    name: str
    prescriptions: list[PrescriptionLite] = []


# ---- structured summary ----
class StructuredMed(BaseModel):
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    last_prescribed: Optional[str] = None
    status: str = "unknown"  # "ongoing" | "completed" | "unknown"


class StructuredCondition(BaseModel):
    name: str
    onset: Optional[str] = None
    status: str = "unknown"  # "stable" | "improving" | "worsening" | "unknown"

class DrugInteraction(BaseModel):
    medicines: list[str]
    severity: str = "moderate"  # "mild" | "moderate" | "severe"
    description: str = ""
    sources: list[str] = []
    confidence: Optional[float] = None

class StructuredSummary(BaseModel):
    clinical_notes: str
    current_medicines: list[StructuredMed] = []
    conditions: list[StructuredCondition] = []
    allergies: list[str] = []
    interactions: list[DrugInteraction] = []
    last_consultation: Optional[str] = None
    trend: str = "insufficient_data"  # "stable" | "improving" | "worsening" | "insufficient_data"


class SummaryOut(BaseModel):
    phone: str
    name: str
    summary: str
    structured: Optional[StructuredSummary] = None
    medicine_count: int
    generated_at: Optional[dt.datetime] = None

class InteractionReportOut(BaseModel):
    phone: str
    name: str
    medicines_analyzed: list[str] = []
    interactions: list[DrugInteraction] = []
    signal_counts: dict[str, int] = {}
    generated_at: Optional[dt.datetime] = None


# ---- doctor notes ----
class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class NoteOut(BaseModel):
    id: int
    note: str
    created_at: dt.datetime
    doctor_name: str


class NotesListOut(BaseModel):
    notes: list[NoteOut] = []


# ---- user settings ----
class SettingsPatch(BaseModel):
    language: Optional[Literal["en", "hi"]] = None
    notifications_enabled: Optional[bool] = None
    reminder_time: Optional[str] = None
    hospital_name: Optional[str] = Field(None, max_length=160)
    specialization: Optional[str] = Field(None, max_length=100)


class SettingsOut(BaseModel):
    language: str
    notifications_enabled: bool
    reminder_time: str
    hospital_name: Optional[str] = None
    specialization: Optional[str] = None


# ---- audit log ----
class AuditEntry(BaseModel):
    id: int
    accessed_by_name: str
    accessed_by_phone: str
    patient_phone: str
    action: str
    accessed_at: dt.datetime


class AuditLogOut(BaseModel):
    entries: list[AuditEntry] = []
