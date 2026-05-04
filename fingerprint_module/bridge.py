#!/usr/bin/env python3
"""
bridge.py — Laptop / PC
Reads structured commands from the Pico W over USB Serial and forwards them to the
Flask fingerprint API (register / verify / attendance).

Requirements:
    pip install -r requirements-flask.txt pyserial

Usage:
    python bridge.py                              # attendance + auto-detect port
    python bridge.py --port /dev/ttyACM0
    python bridge.py --enroll                     # prompt name/email/slot, then enroll on Pico
    python bridge.py --enroll LEGACY_EMP_ID 15    # link existing Node employee (PATCH /api/...), optional
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import time
from pathlib import Path

import requests
import serial

# fingerprint_module root (for stable_employee_id shared with Flask)
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from common.employee_id import stable_employee_id

# ── Configuration ─────────────────────────────────────────────────────────────
# Major step: Flask fingerprint service (not the Express /api prefix)
API_BASE = os.environ.get("FINGERPRINT_API_BASE", "http://127.0.0.1:5001").rstrip("/")
# Legacy Rose Express API (optional second-line enroll without Flask body)
LEGACY_API = os.environ.get("ROSE_API_URL", "http://127.0.0.1:5000/api").rstrip("/")

BAUD_RATE = 115_200
TIMEOUT = 1
RETRY_LIMIT = 3

# Major step: pending interactive enroll — filled when user runs ``--enroll`` with prompts
_pending_enroll: dict | None = None


# ── Serial port auto-detection ────────────────────────────────────────────────

def detect_pico_port() -> str | None:
    """Return the first likely Pico W serial port, or None."""
    candidates = (
        glob.glob("/dev/ttyACM*")
        + glob.glob("/dev/tty.usbmodem*")
        + ["COM3", "COM4", "COM5"]
    )
    for port in candidates:
        try:
            s = serial.Serial(port, BAUD_RATE, timeout=0.2)
            s.close()
            return port
        except (serial.SerialException, OSError):
            continue
    return None


# ── HTTP helpers (Flask API) ─────────────────────────────────────────────────

def post_register_user(name: str, email: str, fingerprint_id: int) -> None:
    """Major step: persist new member after successful template storage on the AS608."""
    body = {"name": name, "email": email, "fingerprint_id": fingerprint_id}
    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            r = requests.post(f"{API_BASE}/register_user", json=body, timeout=10)
            data = r.json() if r.text else {}
            if r.status_code == 201:
                print(f"  ✔  Registered: {data.get('user', {}).get('fullName', name)}")
            elif r.status_code == 409:
                print(f"  ✘  Conflict: {data.get('error')}")
            else:
                print(f"  ✘  Server error ({r.status_code}): {data.get('error', r.text)}")
            return
        except requests.RequestException as e:
            print(f"  ⚠  HTTP error (attempt {attempt}/{RETRY_LIMIT}): {e}")
            time.sleep(1)
    print("  ✘  All retries exhausted for register_user.")


def post_attendance(fingerprint_id: int) -> None:
    """Major step: existing member scan → mark present in MongoDB via Flask."""
    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            r = requests.post(
                f"{API_BASE}/attendance/scan",
                json={"fingerprint_id": fingerprint_id},
                timeout=5,
            )
            data = r.json() if r.text else {}
            if r.ok:
                print(f"  ✔  {data.get('message', 'OK')}")
            else:
                print(f"  ✘  Server error ({r.status_code}): {data.get('error')}")
            return
        except requests.RequestException as e:
            print(f"  ⚠  HTTP error (attempt {attempt}/{RETRY_LIMIT}): {e}")
            time.sleep(1)
    print("  ✘  All retries exhausted for attendance scan.")


def patch_enroll_legacy(employee_id: str, fingerprint_id: int) -> None:
    """Optional: link template to an existing Express ``employeeId`` (no name/email on Flask)."""
    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            r = requests.patch(
                f"{LEGACY_API}/employees/enroll-fingerprint",
                json={"employeeId": employee_id, "fingerprintId": fingerprint_id},
                timeout=5,
            )
            data = r.json() if r.text else {}
            if r.ok:
                print(f"  ✔  Enrolled (legacy API): {data.get('message', 'OK')}")
            elif r.status_code == 409:
                print(f"  ✘  Conflict: {data.get('error')}")
            else:
                print(f"  ✘  Server error ({r.status_code}): {data.get('error')}")
            return
        except requests.RequestException as e:
            print(f"  ⚠  HTTP error (attempt {attempt}/{RETRY_LIMIT}): {e}")
            time.sleep(1)
    print("  ✘  All retries exhausted for legacy enrollment.")


# ── Command dispatcher ────────────────────────────────────────────────────────

def handle_line(line: str) -> None:
    global _pending_enroll

    if ":" not in line:
        return

    command, _, value = line.partition(":")

    if command == "ATTENDANCE":
        if not value.isdigit():
            print(f"  ⚠  Invalid fingerprint ID received: {value!r}")
            return
        print(f"[ATTENDANCE] Fingerprint ID {value} detected — syncing…")
        post_attendance(int(value))

    elif command == "ENROLL_SUCCESS":
        # Major step: Pico stored template; bridge completes registration in the DB
        parts = value.split(",", 1)
        if len(parts) != 2 or not parts[1].strip().isdigit():
            print(f"  ⚠  Malformed ENROLL_SUCCESS value: {value!r}")
            return
        emp_id, f_id = parts[0].strip(), parts[1].strip()

        if _pending_enroll is not None:
            if emp_id != _pending_enroll["employee_id"]:
                print(
                    f"  ⚠  Pico reported employee_id {emp_id!r}, expected "
                    f"{_pending_enroll['employee_id']!r} — registering with captured slot anyway."
                )
            post_register_user(
                _pending_enroll["name"],
                _pending_enroll["email"],
                int(f_id),
            )
            _pending_enroll = None
        else:
            print(f"[ENROLL] No pending interactive session — using legacy API for {emp_id!r}…")
            patch_enroll_legacy(emp_id, int(f_id))

    elif command == "STATUS":
        print(f"[PICO] {value}")

    elif command == "ERROR":
        print(f"[PICO ERROR] {value}")

    else:
        print(f"[UNKNOWN] {line!r}")


# ── Interactive enrollment (capture user details before the sensor runs) ─────

def prompt_and_send_enroll(ser: serial.Serial) -> None:
    """
    Major step: collect directory fields, derive stable employee id, tell Pico which slot to fill.
    """
    global _pending_enroll

    name = input("Full name: ").strip()
    email = input("Email: ").strip()
    slot_s = input("AS608 template slot (0–162): ").strip()

    if not name or not email or not slot_s.isdigit():
        print("ERROR: name, email, and numeric slot are required.")
        return

    slot = int(slot_s)
    if slot < 0 or slot > 162:
        print("ERROR: slot must be between 0 and 162.")
        return

    employee_id = stable_employee_id(email)
    _pending_enroll = {
        "name": name,
        "email": email,
        "employee_id": employee_id,
    }

    print(f"Sending ENROLL:{employee_id},{slot} (follow prompts on the sensor)…")
    ser.write(f"ENROLL:{employee_id},{slot}\r\n".encode())


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Rose Fingerprint Bridge → Flask API")
    parser.add_argument("--port", help="Serial port (e.g. /dev/ttyACM0 or COM3)")
    parser.add_argument(
        "--enroll",
        nargs="*",
        metavar=("EMP_ID", "SLOT"),
        help="Interactive enroll (no args), or legacy EMP_ID SLOT for Express PATCH only",
    )
    args = parser.parse_args()

    port = args.port or detect_pico_port()
    if not port:
        print("ERROR: Could not detect a Pico W serial port.")
        print("  • On Linux, check:  ls /dev/ttyACM*")
        print("  • Pass the port manually with --port /dev/ttyACMx")
        sys.exit(1)

    print(f"Connecting to Pico W on {port} at {BAUD_RATE} baud…")
    print(f"Flask API: {API_BASE}  |  Legacy Express: {LEGACY_API}")
    try:
        ser = serial.Serial(port, BAUD_RATE, timeout=TIMEOUT)
    except serial.SerialException as e:
        print(f"ERROR: Could not open serial port: {e}")
        sys.exit(1)

    time.sleep(2)
    print("--- Rose Fingerprint Bridge Active ---")
    print("Press Ctrl+C to stop.\n")

    if args.enroll is not None:
        if len(args.enroll) == 0:
            prompt_and_send_enroll(ser)
        elif len(args.enroll) == 2:
            emp_id, slot = args.enroll
            if not str(slot).isdigit():
                print("ERROR: slot must be numeric.")
                sys.exit(1)
            print(f"Legacy enroll: EMP={emp_id}, SLOT={slot} (Flask register_user skipped)")
            ser.write(f"ENROLL:{emp_id},{slot}\r\n".encode())
        else:
            print("ERROR: use --enroll alone (interactive) or --enroll EMP_ID SLOT (legacy).")
            sys.exit(1)

    try:
        while True:
            if ser.in_waiting > 0:
                raw = ser.readline()
                try:
                    line = raw.decode("utf-8").strip()
                except UnicodeDecodeError:
                    continue
                if line:
                    handle_line(line)
    except KeyboardInterrupt:
        print("\nBridge stopped.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
