"""Stable employeeId derived from email so bridge + API stay aligned."""

from __future__ import annotations

import hashlib


def stable_employee_id(email: str) -> str:
    """
    Produce a deterministic id (e.g. FP-A1B2C3D4E5) from the normalized email.
    Used when enrolling: Pico receives this id over serial; Flask stores the same value.
    """
    normalized = email.strip().lower()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:10].upper()
    return f"FP-{digest}"
