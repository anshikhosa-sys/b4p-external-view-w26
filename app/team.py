"""Blueprints team (member) sign-in: who is on the roster, one-time codes, and team sessions.

PREVIEW. A member types their roster email and gets a 6-digit code; the code is returned to the
page instead of emailed, so this only runs off production (see main.py). Later this becomes Google
sign-in limited to roster emails: verify the Google ID token server-side, then look the address up
with is_member() exactly as below and call start_session(); nothing else here needs to change.

The roster comes from the R-Roster sheet when Google credentials are set (ROSTER_SHEET_ID,
ROSTER_TAB, header on row 2), otherwise from a local JSON file (MEMBER_ROSTER_PATH). Only Name,
Position and Email are ever read: never phone numbers, birthdays or any other column.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Callable, Optional

ROSTER_CACHE_SECONDS = 300
CODE_MINUTES = 10
CODE_TRIES = 5
SESSION_HOURS = 12

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_roster_cache: dict = {}
_codes: dict[str, dict] = {}     # email -> {hash, until, tries}
_sessions: dict[str, dict] = {}  # sha256(token) -> {member, until}


def _clean(value) -> str:
    return " ".join(str(value or "").split())


def parse_roster_values(values: list[list], header_row: int = 2) -> dict[str, dict]:
    """Sheet rows (header on `header_row`, 1-based) -> {email: {name, email, position}}.
    Rows without a valid email (section titles, blank lines) are skipped; other columns ignored."""
    if len(values) < header_row:
        return {}
    header = [_clean(h).lower() for h in values[header_row - 1]]

    def col(name: str) -> Optional[int]:
        return header.index(name) if name in header else None

    i_name, i_pos, i_email = col("name"), col("position"), col("email")
    if i_name is None or i_email is None:
        raise ValueError("The roster tab needs Name and Email columns in its header row.")
    out = {}
    for row in values[header_row:]:
        cell = lambda i: _clean(row[i]) if i is not None and i < len(row) else ""  # noqa: E731
        email = cell(i_email).lower()
        if not _EMAIL_RE.match(email):
            continue
        out[email] = {"name": cell(i_name), "email": email, "position": cell(i_pos) or "Member"}
    return out


def _read_file(path: str) -> dict[str, dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    people = data.get("members", []) if isinstance(data, dict) else data
    out = {}
    for p in people:
        email = _clean(p.get("email")).lower()
        if _EMAIL_RE.match(email):
            out[email] = {"name": _clean(p.get("name")), "email": email, "position": _clean(p.get("position")) or "Member"}
    return out


def load_roster(gspread_client: Optional[Callable] = None) -> dict[str, dict]:
    """The current roster, cached for a few minutes. `gspread_client` is used only when
    ROSTER_SHEET_ID is set (and Google credentials exist)."""
    cached = _roster_cache.get("members")
    if cached is not None and time.monotonic() - _roster_cache["at"] < ROSTER_CACHE_SECONDS:
        return cached
    sheet_id = os.environ.get("ROSTER_SHEET_ID", "").strip()
    path = os.environ.get("MEMBER_ROSTER_PATH", "").strip()
    if sheet_id and gspread_client:
        tab = os.environ.get("ROSTER_TAB", "").strip() or "Fall 2026"
        values = gspread_client().open_by_key(sheet_id).worksheet(tab).get_all_values()
        members = parse_roster_values(values, header_row=2)
    elif path and Path(path).is_file():
        members = _read_file(path)
    else:
        members = {}
    _roster_cache.update(members=members, at=time.monotonic())
    return members


def is_member(email: str, roster: dict[str, dict]) -> Optional[dict]:
    return roster.get(_clean(email).lower())


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_code(email: str) -> str:
    """A fresh 6-digit code for this email (replaces any earlier one)."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    _codes[_clean(email).lower()] = {"hash": _hash(code), "until": time.time() + CODE_MINUTES * 60, "tries": 0}
    return code


def check_code(email: str, code: str) -> str:
    """'ok', 'wrong', 'expired' or 'none'. A code works once; five wrong tries use it up."""
    key = _clean(email).lower()
    entry = _codes.get(key)
    if not entry:
        return "none"
    if time.time() > entry["until"] or entry["tries"] >= CODE_TRIES:
        _codes.pop(key, None)
        return "expired"
    if not hmac.compare_digest(entry["hash"], _hash(_clean(code))):
        entry["tries"] += 1
        return "wrong"
    _codes.pop(key, None)
    return "ok"


def start_session(member: dict) -> str:
    """A random session token (256 bits); only its hash is kept."""
    token = secrets.token_urlsafe(32)
    _sessions[_hash(token)] = {"member": dict(member), "until": time.time() + SESSION_HOURS * 3600}
    return token


def session_member(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    entry = _sessions.get(_hash(token))
    if not entry:
        return None
    if time.time() > entry["until"]:
        _sessions.pop(_hash(token), None)
        return None
    return entry["member"]


def end_session(token: Optional[str]) -> None:
    if token:
        _sessions.pop(_hash(token), None)


def reset() -> None:
    """For tests: forget the roster cache, codes and sessions."""
    _roster_cache.clear()
    _codes.clear()
    _sessions.clear()
