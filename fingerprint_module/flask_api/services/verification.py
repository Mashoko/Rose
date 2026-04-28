"""Fingerprint template id → user profile (no side effects)."""

from __future__ import annotations

from typing import Any

from flask_api.database.repository import EmployeeRepository
from flask_api.exceptions import ValidationError


def verify_fingerprint(repo: EmployeeRepository, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Major step: resolve ``fingerprint_id`` to the stored user document.
    """
    if not isinstance(payload, dict):
        raise ValidationError("Body must be a JSON object")
    fp = payload.get("fingerprint_id")
    if fp is None:
        fp = payload.get("fingerprintId")
    try:
        fp_int = int(fp)
    except (TypeError, ValueError):
        raise ValidationError("fingerprint_id must be an integer") from None
    return repo.find_by_fingerprint(fp_int)
