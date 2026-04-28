#!/usr/bin/env python3
"""
Start the fingerprint Flask API (port 5001 by default so Express can stay on 5000).

Usage (from repo root or fingerprint_module):

  cd fingerprint_module && ./.venv/bin/python run_fingerprint_api.py

Requires MONGO_URI in the environment (same as server.js).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from flask_api.app import create_app
from flask_api.config import Config

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=Config.FLASK_DEBUG)
