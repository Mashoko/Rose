"""Enrollment result → user record (separate from sensor capture)."""

from __future__ import annotations

from typing import Any

from flask_api.database.repository import EmployeeRepository
from flask_api.exceptions import ValidationError


def register_user(repo: EmployeeRepository, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Major step: validate JSON body and delegate to the database layer.
    Expected keys: name, email, fingerprint_id (fingerprintId also accepted).
    """
    if not isinstance(payload, dict):
        raise ValidationError("Body must be a JSON object")

    name = payload.get("name")
    email = payload.get("email")
    fp = payload.get("fingerprint_id")
    if fp is None:
        fp = payload.get("fingerprintId")

    try:
        fp_int = int(fp)
    except (TypeError, ValueError):
        raise ValidationError("fingerprint_id must be an integer") from None

    return repo.register_user(
        str(name) if name is not None else "",
        str(email) if email is not None else "",
        fp_int,
    )
