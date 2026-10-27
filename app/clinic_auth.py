"""Clinic sign-in: an email, then a 6-digit code. No passwords.

Nothing is kept in server memory between the two steps or for the session: the code check is a
signed "ticket" the page sends back with the code, and the session is a signed token. That way it
keeps working on Vercel, where each call can land on a different server instance.

Both are signed with AUTH_SECRET. Without it, a random secret is made per process: fine locally,
but every Vercel instance would have its own, so production refuses to run without it.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

CODE_MINUTES = 10
CODE_TRIES = 5
SESSION_DAYS = 30

_fallback_secret = secrets.token_bytes(32)
_tries: dict[str, int] = {}  # ticket nonce -> wrong guesses (best effort, per instance)


def configured() -> bool:
    return bool(os.environ.get("AUTH_SECRET", "").strip())


def _secret() -> bytes:
    s = os.environ.get("AUTH_SECRET", "").strip()
    return s.encode() if s else _fallback_secret


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(kind: str, payload: dict) -> str:
    body = _b64(json.dumps({**payload, "k": kind}, separators=(",", ":")).encode())
    mac = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{mac}"


def _unsign(kind: str, token: Optional[str]) -> Optional[dict]:
    if not token or token.count(".") != 1:
        return None
    body, mac = token.split(".")
    want = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(mac, want):
        return None
    try:
        data = json.loads(_unb64(body))
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("k") != kind or time.time() > data.get("exp", 0):
        return None
    return data


def _code_hash(email: str, code: str, nonce: str) -> str:
    return hmac.new(_secret(), f"{email}|{code}|{nonce}".encode(), hashlib.sha256).hexdigest()


def clean_email(email: str) -> str:
    return " ".join(str(email or "").split()).lower()


def new_code(email: str) -> tuple[str, str]:
    """(code, ticket). The page keeps the ticket and sends it back with the code."""
    email = clean_email(email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    nonce = secrets.token_urlsafe(12)
    ticket = _sign("code", {"e": email, "n": nonce, "h": _code_hash(email, code, nonce),
                            "exp": int(time.time()) + CODE_MINUTES * 60})
    return code, ticket


def check_code(email: str, code: str, ticket: str) -> str:
    """'ok', 'wrong' or 'expired'. Five wrong guesses use the code up."""
    email = clean_email(email)
    data = _unsign("code", ticket)
    if not data or data.get("e") != email:
        return "expired"
    nonce = data["n"]
    if _tries.get(nonce, 0) >= CODE_TRIES:
        return "expired"
    if not hmac.compare_digest(data["h"], _code_hash(email, "".join(str(code).split()), nonce)):
        _tries[nonce] = _tries.get(nonce, 0) + 1
        if len(_tries) > 10_000:
            _tries.clear()
        return "wrong"
    _tries[nonce] = CODE_TRIES  # a code works once
    return "ok"


def start_session(email: str) -> str:
    return _sign("session", {"e": clean_email(email), "exp": int(time.time()) + SESSION_DAYS * 86400})


def session_email(token: Optional[str]) -> Optional[str]:
    data = _unsign("session", token)
    return data["e"] if data else None


def reset() -> None:
    """For tests."""
    _tries.clear()
