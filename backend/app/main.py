"""FastAPI app entry. Creates tables, mounts routers, enables CORS."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import Base, engine
from . import models  # noqa: F401
from .routers import (
    auth_router,
    prescriptions_router,
    summary_router,
    notes_router,
    settings_router,
    audit_router,
    interactions_router,
)

settings = get_settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="smartRX API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(prescriptions_router.router)
app.include_router(summary_router.router)
app.include_router(notes_router.router)
app.include_router(settings_router.router)
app.include_router(audit_router.router)
app.include_router(interactions_router.router)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "version": "2.0.0"}
