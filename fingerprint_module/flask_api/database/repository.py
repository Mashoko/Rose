"""
Persistence for fingerprint users and attendance.
Collections align with Mongoose models: ``employees`` and ``histories``.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# Ensure ``fingerprint_module`` root is importable when running as a script
_fp_root = Path(__file__).resolve().parents[2]
if str(_fp_root) not in sys.path:
    sys.path.insert(0, str(_fp_root))

from common.employee_id import stable_employee_id
from flask_api.database.connection import get_database
from flask_api.exceptions import ConflictError, NotFoundError, ValidationError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _local_date_iso() -> str:
    """Calendar day for attendance dedup (server local timezone)."""
    return date.today().isoformat()


def _serialize_employee(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return None
    out = dict(doc)
    oid = out.pop("_id", None)
    if oid is not None:
        out["id"] = str(oid)
    return out


class EmployeeRepository:
    """All MongoDB access for enrollment, lookup, listing, and attendance."""

    COLLECTION = "employees"
    HISTORY = "histories"

    def __init__(self) -> None:
        db = get_database()
        self._employees = db[self.COLLECTION]
        self._history = db[self.HISTORY]

    # --- Registration (storage only; enrollment capture happens on device + bridge) ---

    def register_user(self, name: str, email: str, fingerprint_id: int) -> dict[str, Any]:
        """
        Major step: persist (or update) the member tied to this AS608 template slot.
        """
        if not name or not str(name).strip():
            raise ValidationError("name is required")
        if not email or not str(email).strip():
            raise ValidationError("email is required")
        if fingerprint_id is None or not isinstance(fingerprint_id, int):
            raise ValidationError("fingerprint_id must be an integer")
        if fingerprint_id < 0:
            raise ValidationError("fingerprint_id must be non-negative")

        email_norm = email.strip().lower()
        name_clean = name.strip()
        employee_id = stable_employee_id(email_norm)

        # Major step: reject if this template id already belongs to another person
        holder = self._employees.find_one({"fingerprintId": fingerprint_id})
        by_email = self._employees.find_one({"email": email_norm})

        # Major step: slot belongs to someone else (and it is not this email's record)
        if holder is not None and (by_email is None or holder["_id"] != by_email["_id"]):
            raise ConflictError("This fingerprint_id is already enrolled to another employee")

        now = _utcnow()

        if by_email:
            # Major step: same member re-enrolled (e.g. new finger / same email)
            self._employees.update_one(
                {"_id": by_email["_id"]},
                {
                    "$set": {
                        "fullName": name_clean,
                        "email": email_norm,
                        "fingerprintId": fingerprint_id,
                        "employeeId": by_email.get("employeeId") or employee_id,
                        "updatedAt": now,
                    }
                },
            )
            updated = self._employees.find_one({"_id": by_email["_id"]})
            return _serialize_employee(updated) or {}

        # Major step: brand-new directory entry
        doc = {
            "employeeId": employee_id,
            "fullName": name_clean,
            "email": email_norm,
            "fingerprintId": fingerprint_id,
            "attendanceDays": 0,
            "biometricLogs": 0,
            "createdAt": now,
            "updatedAt": now,
        }
        try:
            self._employees.insert_one(doc)
        except Exception as e:
            if "duplicate key" in str(e).lower() or getattr(e, "code", None) == 11000:
                raise ConflictError("Duplicate key: email or fingerprint already exists") from e
            raise

        saved = self._employees.find_one({"employeeId": employee_id})
        return _serialize_employee(saved) or {}

    # --- Verification ---

    def find_by_fingerprint(self, fingerprint_id: int) -> dict[str, Any]:
        """Major step: map template id → stored employee document."""
        if fingerprint_id is None or not isinstance(fingerprint_id, int):
            raise ValidationError("fingerprint_id must be an integer")
        doc = self._employees.find_one({"fingerprintId": fingerprint_id})
        if not doc:
            raise NotFoundError("No user registered for this fingerprint_id")
        return _serialize_employee(doc) or {}

    def list_with_fingerprints(self) -> list[dict[str, Any]]:
        """Dashboard + admin: everyone who has a template id."""
        cur = self._employees.find({"fingerprintId": {"$exists": True, "$ne": None}}).sort(
            "fullName", 1
        )
        return [_serialize_employee(d) for d in cur if d.get("fingerprintId") is not None]

    # --- Attendance (aligned with Express POST /api/attendance/scan: one present / local day) ---

    def record_scan(self, fingerprint_id: int) -> tuple[dict[str, Any], bool]:
        """
        Major step: at most one counted present per local calendar day.
        Every scan still increments biometricLogs and refreshes lastActive.
        Returns (serialized_employee, already_present_today).
        """
        if fingerprint_id is None or not isinstance(fingerprint_id, int):
            raise ValidationError("fingerprint_id must be an integer")

        employee = self._employees.find_one({"fingerprintId": fingerprint_id})
        if not employee:
            raise NotFoundError("Fingerprint not recognized")

        now = _utcnow()
        today = _local_date_iso()
        last_day = employee.get("lastAttendanceDate")
        already_today = last_day == today

        # Major step: always record the scan; only bump attendance + history once per day
        if already_today:
            self._employees.update_one(
                {"_id": employee["_id"]},
                {
                    "$inc": {"biometricLogs": 1},
                    "$set": {"lastActive": now, "updatedAt": now},
                },
            )
        else:
            days = (employee.get("attendanceDays") or 0) + 1
            self._employees.update_one(
                {"_id": employee["_id"]},
                {
                    "$inc": {"biometricLogs": 1},
                    "$set": {
                        "attendanceDays": days,
                        "lastAttendanceDate": today,
                        "lastActive": now,
                        "updatedAt": now,
                    },
                },
            )

            month_name = now.strftime("%B")
            self._history.insert_one(
                {
                    "employeeId": employee.get("employeeId"),
                    "month": month_name,
                    "attendance": days,
                    "riskScore": employee.get("anomalyScore") or 0,
                    "status": "Present",
                    "createdAt": now,
                    "updatedAt": now,
                }
            )

        refreshed = self._employees.find_one({"_id": employee["_id"]})
        return _serialize_employee(refreshed) or {}, already_today
