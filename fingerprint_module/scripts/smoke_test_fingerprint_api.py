#!/usr/bin/env python3
"""
Smoke-test the fingerprint Flask API without a real MongoDB (mongomock).

Run from fingerprint_module:
  ./.venv/bin/pip install -r requirements-dev.txt
  ./.venv/bin/python scripts/smoke_test_fingerprint_api.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/rose_smoke")


def main() -> None:
    import mongomock

    import flask_api.database.connection as conn

    conn._client.cache_clear()
    with patch.object(conn, "MongoClient", mongomock.MongoClient):
        conn._client.cache_clear()
        from flask_api.app import create_app

        app = create_app()
        client = app.test_client()

        # Major step: liveness
        r = client.get("/health")
        assert r.status_code == 200, r.get_data(as_text=True)
        body = r.get_json()
        assert body.get("ok") is True

        # Major step: enroll → storage
        r = client.post(
            "/register_user",
            json={
                "name": "Test User",
                "email": "test@example.com",
                "fingerprint_id": 42,
            },
        )
        assert r.status_code == 201, r.get_json()
        assert r.get_json()["user"]["fingerprintId"] == 42

        # Major step: verify lookup
        r = client.post("/verify_fingerprint", json={"fingerprint_id": 42})
        assert r.status_code == 200
        assert r.get_json()["user"]["email"] == "test@example.com"

        # Major step: first scan counts as present for the day
        r = client.post("/attendance/scan", json={"fingerprint_id": 42})
        assert r.status_code == 200
        data = r.get_json()
        assert data.get("alreadyPresentToday") is False
        assert data["employee"]["attendanceDays"] == 1

        # Major step: same calendar day → no second present
        r = client.post("/attendance/scan", json={"fingerprint_id": 42})
        assert r.status_code == 200
        data = r.get_json()
        assert data.get("alreadyPresentToday") is True
        assert data["employee"]["attendanceDays"] == 1
        assert data["employee"]["biometricLogs"] == 2

        # Major step: dashboard HTML
        r = client.get("/")
        assert r.status_code == 200
        assert b"Test User" in r.data

    print("smoke_test_fingerprint_api: OK")


if __name__ == "__main__":
    main()
