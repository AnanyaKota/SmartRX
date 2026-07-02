"""App configuration. Reads from environment / .env."""
import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()  # loads .env from CWD (backend/) at import time


class Settings:
    # SQLite for dev (zero setup). Swap to a Postgres URL for prod:
    #   postgresql+psycopg://user:pass@host:5432/smartrx
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./smartrx.db")

    # JWT
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

    # Gemini
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    # Interaction analysis
    interaction_api_base_url: str = os.getenv("INTERACTION_API_BASE_URL", "https://api.fda.gov")
    interaction_http_timeout_sec: float = float(os.getenv("INTERACTION_HTTP_TIMEOUT_SEC", "8"))

    # Uploads
    upload_dir: str = os.getenv("UPLOAD_DIR", "./uploads")
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10MB
    allowed_image_types: tuple = ("image/jpeg", "image/png", "image/jpg")

    # OCR fallback: trust Gemini vision when Tesseract mean word-confidence is below this.
    tesseract_confidence_floor: float = float(os.getenv("TESSERACT_CONF_FLOOR", "60"))

    # CORS: comma-separated list of allowed origins.
    # Default allows local Vite dev server.
    allowed_origins: list = [
        o.strip()
        for o in os.getenv(
            "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if o.strip()
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
