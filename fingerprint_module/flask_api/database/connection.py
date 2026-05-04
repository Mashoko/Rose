"""MongoDB client lifecycle (shared with the existing Rose / Mongoose database)."""

from __future__ import annotations

from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.uri_parser import parse_uri

from flask_api.config import Config


@lru_cache(maxsize=1)
def _client() -> MongoClient:
    # Major step: connect once per process; URI matches Express mongoose.connect(MONGO_URI)
    return MongoClient(Config.MONGO_URI)


def get_database() -> Database:
    """
    Resolve the database handle (same DB name Mongoose uses from MONGO_URI).
    """
    client = _client()
    parsed = parse_uri(Config.MONGO_URI)
    name = parsed.get("database") or Config.MONGO_DB_NAME or "test"
    return client[name]
