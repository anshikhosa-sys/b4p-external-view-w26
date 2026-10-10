"""Optional Postgres data source. Active only when the DATABASE_URL env var is set.

Reads the `dash_supplies` / `dash_requests` views and calls the
`create_request` / `set_request_status` functions defined in the B4P database.
"""
import os

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def preview_sandboxed() -> bool:
    """Vercel preview deploys use demo data, never the real database or sheet, unless explicitly allowed."""
    return (os.environ.get("VERCEL_ENV", "").strip().lower() == "preview"
            and os.environ.get("PREVIEW_ALLOW_REAL_DATA", "").strip().lower() != "true")


def enabled() -> bool:
    return bool(os.environ.get("DATABASE_URL", "").strip()) and not preview_sandboxed()


def _connect():
    # prepare_threshold=None: Supabase's transaction pooler rejects prepared statements.
    return psycopg.connect(
        os.environ["DATABASE_URL"].strip(),
        connect_timeout=5,
        prepare_threshold=None,
        row_factory=dict_row,
    )


def _query(sql: str, params=None) -> list[dict]:
    with _connect() as conn:
        return conn.execute(sql, params).fetchall()


def get_supplies() -> list[dict]:
    return _query("SELECT * FROM dash_supplies")


def get_requests() -> list[dict]:
    return _query("SELECT * FROM dash_requests")


def create_request(org_name: str, org_email: str, items: list[dict]) -> str:
    """items: [{"item_name", "category", "quantity", "review_flag"}] -> 'REQ-<epoch>-<nnn>'."""
    with _connect() as conn:
        return conn.execute(
            "SELECT create_request(%s, %s, %s)", (org_name, org_email, Jsonb(items))
        ).fetchone()["create_request"]


def set_request_status(request_id: str, status: str) -> bool:
    """status is the display text ('Approved', 'Shipped', ...). False if the id is unknown."""
    with _connect() as conn:
        return conn.execute(
            "SELECT set_request_status(%s, %s)", (request_id, status)
        ).fetchone()["set_request_status"]


def ping() -> bool:
    try:
        _query("SELECT 1")
        return True
    except Exception:
        return False
