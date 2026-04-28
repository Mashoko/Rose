"""Environment-driven settings for the fingerprint Flask service."""

from __future__ import annotations

import os

from pathlib import Path

from dotenv import load_dotenv

# Rose repo root: fingerprint_module/flask_api/config.py → parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv()


class Config:
    """Central place for MongoDB URI and server tuning."""

    MONGO_URI: str = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/rose")
    MONGO_DB_NAME: str = os.environ.get("MONGO_DB_NAME", "")
    FLASK_DEBUG: bool = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
