"""
Flask application: user registration, fingerprint verification, attendance, dashboard.
"""

from __future__ import annotations

import sys
from pathlib import Path

# fingerprint_module on sys.path (see run_fingerprint_api.py)
_pkg = Path(__file__).resolve().parent

from flask import Flask, jsonify, render_template, request

from flask_api.database.repository import EmployeeRepository
from flask_api.exceptions import ServiceError, ValidationError
from flask_api.services.registration import register_user as register_user_svc
from flask_api.services.verification import verify_fingerprint as verify_fingerprint_svc


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(_pkg / "templates"),
        static_folder=str(_pkg / "static"),
    )
    repo = EmployeeRepository()

    @app.errorhandler(ServiceError)
    def handle_service_error(err: ServiceError):
        return jsonify({"ok": False, "error": err.message}), err.code

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        # Major step: never leak stack traces to clients in production-style APIs
        app.logger.exception("Unhandled error: %s", err)
        return jsonify({"ok": False, "error": "Internal server error"}), 500

    @app.get("/")
    def dashboard():
        """Major step: simple HTML overview of enrolled members."""
        users = repo.list_with_fingerprints()
        return render_template("dashboard.html", users=users)

    @app.get("/enrolled")
    def enrolled_json():
        """JSON list for the main React app (proxied as /fingerprint-api/enrolled)."""
        users = repo.list_with_fingerprints()
        return jsonify({"ok": True, "users": users})

    @app.post("/register_user")
    def register_user():
        """
        Major step: after the sensor stores a template, persist member + fingerprint_id.
        Body: { "name", "email", "fingerprint_id" }
        """
        if not request.is_json:
            raise ValidationError("Expected application/json")
        data = register_user_svc(repo, request.get_json(force=True))
        return jsonify({"ok": True, "user": data}), 201

    @app.post("/verify_fingerprint")
    def verify_fingerprint():
        """
        Major step: lookup only — who owns this template id?
        Body: { "fingerprint_id": int }  (also accepts fingerprintId for compatibility)
        """
        if not request.is_json:
            raise ValidationError("Expected application/json")
        user = verify_fingerprint_svc(repo, request.get_json(force=True))
        return jsonify({"ok": True, "user": user})

    @app.post("/attendance/scan")
    def attendance_scan():
        """
        Major step: mark present for the member matching this scan (same as Express route).
        Body: { "fingerprint_id": int } or { "fingerprintId": int }
        """
        if not request.is_json:
            raise ValidationError("Expected application/json")
        body = request.get_json(force=True)
        fid = body.get("fingerprint_id")
        if fid is None:
            fid = body.get("fingerprintId")
        try:
            fid_int = int(fid)
        except (TypeError, ValueError):
            raise ValidationError("fingerprint_id must be an integer") from None
        employee, already_today = repo.record_scan(fid_int)
        name = employee.get("fullName") or employee.get("employeeId")
        if already_today:
            msg = f"Already marked present today for {name}"
        else:
            msg = f"Attendance marked for {name}"
        return jsonify(
            {
                "ok": True,
                "message": msg,
                "employee": employee,
                "alreadyPresentToday": already_today,
            }
        )

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "service": "fingerprint_flask_api"})

    return app


# `flask --app flask_api.app run` when cwd and PYTHONPATH are set
if __name__ == "__main__":
    _root = Path(__file__).resolve().parents[1]
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))
    from flask_api.config import Config

    app = create_app()
    app.run(
        host="0.0.0.0",
        port=int(__import__("os").environ.get("FLASK_PORT", "5001")),
        debug=Config.FLASK_DEBUG,
    )
