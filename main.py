import concurrent.futures
import hashlib
import ipaddress
import unicodedata
from collections import OrderedDict
import hmac
import json
import logging
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import gspread
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from google.oauth2.service_account import Credentials
from pydantic import BaseModel, Field, field_validator

import psycopg
from fastapi.responses import JSONResponse

from app import db
from app.services import email as email_svc

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
SAMPLE_PATH = Path(os.environ.get("SAMPLE_INVENTORY_PATH") or BASE_DIR / "sample_inventory.json")

logger = logging.getLogger(__name__)

app = FastAPI()

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(GZipMiddleware, minimum_size=1000)  # inventory JSON is ~134 KB raw
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

REQ_HEADERS = [
    "request_id",
    "submitted_at_utc",
    "nametag",
    "inventory_sheet_row",
    "item_name",
    "manufacturer",
    "warehouse_category",
    "quantity_requested",
    "request_notes",
    "status",
    "client_request_id",
]

_sample_client_request_ids: set[str] = set()
_sample_org_request_rows: list[dict[str, str]] = []


def _vercel_env() -> str:
    return os.environ.get("VERCEL_ENV", "").strip().lower()  # production | preview | development


def _has_google_creds() -> bool:
    if os.environ.get("GOOGLE_CREDENTIALS_JSON"):
        return True
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(key_path) and Path(key_path).is_file()


def _auto_sample_preview() -> bool:
    """Vercel preview deploys with no secrets run on the demo inventory, with email off."""
    return (_vercel_env() == "preview" and not os.environ.get("DATABASE_URL", "").strip()
            and not os.environ.get("GOOGLE_CREDENTIALS_JSON"))


def _use_sample_data() -> bool:
    if _vercel_env() == "production":
        return False  # production must never silently serve demo data
    explicit = os.environ.get("USE_SAMPLE_DATA", "").strip().lower() in ("1", "true", "yes")
    return explicit or _auto_sample_preview()


def _check_configured() -> None:
    """Production with no database and no Google credentials is a deploy mistake: say so (503)."""
    if _vercel_env() == "production" and not db.enabled() and not _has_google_creds():
        raise HTTPException(
            status_code=503,
            detail="Server is not configured: set DATABASE_URL or GOOGLE_CREDENTIALS_JSON.",
        )


app.router.dependencies.append(Depends(_check_configured))  # runs before every route


def _flush_alert_digest(tasks: BackgroundTasks) -> None:
    """Opportunistic: the HQ digest has no timer, so any request after the hour sends it."""
    if email_svc.digest_due():
        _deliver(tasks, (email_svc.flush_digest_if_due,))


app.router.dependencies.append(Depends(_flush_alert_digest))


def _get_google_creds() -> Credentials:
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    json_str = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if json_str:
        info = json.loads(json_str)
        return Credentials.from_service_account_info(info, scopes=scopes)
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not key_path or not Path(key_path).is_file():
        raise HTTPException(
            status_code=500,
            detail="Server missing GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS.",
        )
    return Credentials.from_service_account_file(key_path, scopes=scopes)


def _gspread_client():
    return gspread.authorize(_get_google_creds())


def _clean_header(header: list) -> list[str]:
    """Trim names, name blank columns, and de-duplicate repeats ("Qty", "Qty.1", ...)."""
    seen: dict[str, int] = {}
    out = []
    for i, col in enumerate(header):
        name = str(col).strip() or f"Unnamed_{i}"
        if name in seen:
            seen[name] += 1
            name = f"{name}.{seen[name]}"
        else:
            seen[name] = 0
        out.append(name)
    return out


@app.exception_handler(gspread.exceptions.APIError)
async def _sheets_error(_, exc: gspread.exceptions.APIError):
    # Google's error text can name our project, so it never reaches the client.
    if getattr(exc.response, "status_code", None) == 429:
        return JSONResponse(status_code=503,
                            content={"detail": "Inventory service busy, try again in a minute."})
    return JSONResponse(status_code=502, content={"detail": "Google Sheets error."})


@app.exception_handler(psycopg.Error)
async def _db_error(_, exc: psycopg.Error):
    # Never echo raw database text to clients. Input the database refuses (RAISE EXCEPTION,
    # CHECK, too-long value, ...) is the caller's fault; anything else is an outage.
    if isinstance(exc, (psycopg.errors.RaiseException, psycopg.errors.CheckViolation,
                        psycopg.errors.DataError)):
        return JSONResponse(status_code=400, content={"detail": "Request rejected."})
    if isinstance(exc, psycopg.errors.IntegrityError):
        return JSONResponse(status_code=409, content={"detail": "Request conflicts with existing data."})
    return JSONResponse(status_code=503, content={"detail": "Database unavailable."})


def require_hq(x_hq_token: Optional[str] = Header(default=None)) -> None:
    """HQ-only endpoints: send the shared secret (env HQ_API_TOKEN) in the X-HQ-Token header."""
    expected = os.environ.get("HQ_API_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=403, detail="HQ access is disabled.")
    if not hmac.compare_digest((x_hq_token or "").encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid HQ token.")


# Simple per-IP rate limit for anonymous writes (in memory, per process). To remove it,
# delete this block and the `Depends(rate_limit_post)` on POST /requests.
RATE_LIMIT = 10  # requests per IP per minute
_hits: "OrderedDict[str, list[float]]" = OrderedDict()  # least recently used first; capped in _check_rate
MAX_RATE_KEYS = 10000


_warned_xff = False


def _trust_proxy() -> bool:
    """TRUST_PROXY=1/0 forces it; otherwise on when running on Render or Vercel (their proxies
    set X-Forwarded-For to the real client IP)."""
    setting = os.environ.get("TRUST_PROXY", "").strip()
    if setting in ("0", "1"):
        return setting == "1"
    return bool(os.environ.get("RENDER") or os.environ.get("VERCEL"))


def _client_ip(request: Request) -> str:
    """X-Forwarded-For is client-controlled, so read it only behind our own proxy.

    Render's proxy appends the real client IP as the LAST hop, so we use that one.
    """
    global _warned_xff
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd and not _trust_proxy():
        if not _warned_xff and request.client and request.client.host not in ("testclient", "127.0.0.1"):
            _warned_xff = True
            logger.warning("X-Forwarded-For received but proxy trust is off, so all users may share one "
                           "rate limit. If you are behind a proxy, set TRUST_PROXY=1.")
        fwd = ""
    ip = fwd.split(",")[-1].strip() or (request.client.host if request.client else "?")
    return _ip_bucket(ip)


def _ip_bucket(ip: str) -> str:
    """One IPv6 /64 is a single customer's allocation, so share one bucket per /64."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if addr.version == 6:
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return ip


def _check_rate(key: str, limit: int) -> None:
    now = time.monotonic()
    recent = [t for t in _hits.get(key, []) if now - t < 60]
    if len(recent) >= limit:
        _hits[key] = recent
        _hits.move_to_end(key)
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")
    recent.append(now)
    _hits[key] = recent
    _hits.move_to_end(key)
    while len(_hits) > MAX_RATE_KEYS:  # bounded memory even under a flood of distinct keys
        _hits.popitem(last=False)


def rate_limit_post(request: Request) -> None:
    _check_rate(_client_ip(request), RATE_LIMIT)


# Looser separate bucket for GET /requests?email=: the address is the only access check, so
# unlimited lookups would let someone guess clinic addresses and read their history.
LOOKUP_LIMIT = 20  # per IP per minute; a page load is one lookup


def _load_inventory_records() -> list[dict]:
    if db.enabled():
        return db.get_supplies()

    if _use_sample_data():
        raw = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
        out = []
        for i, row in enumerate(raw):
            rec = dict(row)
            rec["_sheet_row"] = i + 2
            out.append(rec)
        return out

    # Live sheet: cache briefly so page loads and submits don't each cost a Sheets read (quota).
    cached = _inventory_cache.get("records")
    if cached is not None and time.monotonic() - _inventory_cache["at"] < INVENTORY_CACHE_SECONDS:
        return list(cached)
    records = _read_sheet_inventory()
    _inventory_cache.update(records=records, at=time.monotonic())
    return list(records)


PHI_RE = re.compile(r"Pt\.?\s*ID\s*[A-Z0-9-]+", re.IGNORECASE)


def _redact_phi(text: str) -> str:
    """Specimen-tube labels in the inventory carry patient IDs ("Pt. ID 0000000001-1"); never expose them."""
    return PHI_RE.sub("Pt. ID [removed]", text)


def get_inventory_records() -> list[dict]:
    """Inventory from the active source, with patient identifiers removed from every text field."""
    return [{k: _redact_phi(v) if isinstance(v, str) else v for k, v in rec.items()}
            for rec in _load_inventory_records()]


INVENTORY_CACHE_SECONDS = 60
_inventory_cache: dict = {}


def _read_sheet_inventory() -> list[dict]:
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_SHEET_ID.")

    client = _gspread_client()
    spreadsheet = client.open_by_key(sheet_id)
    title = os.environ.get("INVENTORY_WORKSHEET_TITLE", "").strip()
    if title:
        try:
            sheet = spreadsheet.worksheet(title)
        except gspread.WorksheetNotFound:
            raise HTTPException(status_code=500, detail=f"Inventory tab '{title}' not found.")
    else:
        sheet = spreadsheet.sheet1
    all_values = sheet.get_all_values()
    if not all_values:
        return []

    header = _clean_header(all_values[0])
    records = []
    for i, row in enumerate(all_values[1:]):
        rec = {name: (row[j] if j < len(row) else "") for j, name in enumerate(header)}
        rec["_sheet_row"] = i + 2
        records.append(rec)
    return records


def _open_spreadsheet():
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise HTTPException(status_code=500, detail="Missing GOOGLE_SHEET_ID.")
    client = _gspread_client()
    return client.open_by_key(sheet_id)


def _open_requests_spreadsheet():
    sheet_id = os.environ.get("REQUESTS_SHEET_ID") or os.environ.get("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise HTTPException(status_code=500, detail="Missing REQUESTS_SHEET_ID.")
    client = _gspread_client()
    return client.open_by_key(sheet_id)


def get_requests_worksheet(spreadsheet: gspread.Spreadsheet):
    title = os.environ.get("REQUESTS_WORKSHEET_TITLE", "Requests").strip()
    try:
        return spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        worksheets = spreadsheet.worksheets()
        if len(worksheets) >= 2:
            return worksheets[1]
        return spreadsheet.add_worksheet(title=title, rows=3000, cols=len(REQ_HEADERS) + 2)


def ensure_request_headers(ws: gspread.Worksheet) -> None:
    rows = ws.get_all_values()
    if not rows:
        ws.append_row(REQ_HEADERS, value_input_option="RAW")
        return
    if rows[0][0] != REQ_HEADERS[0]:
        raise HTTPException(
            status_code=500,
            detail=(
                "Requests worksheet row 1 must be the header row starting with "
                f"'{REQ_HEADERS[0]}'. Fix the sheet or point REQUESTS_WORKSHEET_TITLE "
                "to an empty/new tab."
            ),
        )


def read_request_rows(ws: gspread.Worksheet) -> list[dict]:
    rows = ws.get_all_values()
    if len(rows) <= 1:
        return []
    header = rows[0]
    out = []
    for r in rows[1:]:
        if not any(cell.strip() for cell in r):
            continue
        out.append(_row_dict(header, r))
    return out


class CartLineIn(BaseModel):
    sheet_row: int = Field(ge=2, le=500000)
    quantity: int = Field(ge=1, le=99999)


class SubmitRequestBody(BaseModel):
    nametag: str = Field(min_length=1, max_length=200)
    items: list[CartLineIn] = Field(min_length=1)
    request_notes: str = Field(default="", max_length=4000)
    client_request_id: Optional[str] = Field(default=None, max_length=80)

    @field_validator("nametag")
    @classmethod
    def nametag_strip(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("nametag cannot be empty")
        return t


def _snapshot_row(inventory: list[dict], sheet_row: int) -> Optional[dict]:
    for rec in inventory:
        if int(rec.get("_sheet_row", -1)) == sheet_row:
            return rec
    return None


@app.get("/health")
def health():
    if db.enabled():
        return {"source": "postgres", "ok": db.ping(), "email": email_svc.provider_name()}
    return {"source": "sheet", "ok": True, "email": email_svc.provider_name()}


PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300"


def _cached_json(request: Request, data) -> Response:
    """JSON with a short browser/CDN cache and a weak ETag, so repeat loads can be a 304."""
    body = json.dumps(jsonable_encoder(data), separators=(",", ":"), ensure_ascii=False).encode()
    etag = 'W/"' + hashlib.sha1(body).hexdigest() + '"'
    headers = {"Cache-Control": PUBLIC_CACHE, "ETag": etag}
    # If-None-Match may list several tags and may carry the W/ prefix; compare without it.
    sent = {t.strip().removeprefix("W/") for t in request.headers.get("if-none-match", "").split(",")}
    if "*" in sent or etag.removeprefix("W/") in sent:  # "*" matches any existing representation
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


@app.get("/api/supplies")
async def supplies(request: Request):
    # Photos are not shown anymore and can show patient labels, so they are not sent.
    rows = [{k: v for k, v in rec.items() if k.strip().lower() != "image url"}
            for rec in get_inventory_records()]
    return _cached_json(request, rows)


@app.get("/api/requests")
async def list_requests():
    if _use_sample_data():
        return []

    spreadsheet = _open_requests_spreadsheet()
    ws = get_requests_worksheet(spreadsheet)
    ensure_request_headers(ws)
    return read_request_rows(ws)


@app.post("/api/requests")
async def submit_request(body: SubmitRequestBody):
    inventory = get_inventory_records()
    valid_rows = {int(r["_sheet_row"]) for r in inventory if "_sheet_row" in r}
    for line in body.items:
        if line.sheet_row not in valid_rows:
            raise HTTPException(
                status_code=400,
                detail=f"inventory_sheet_row {line.sheet_row} is not a current inventory row.",
            )

    if _use_sample_data():
        cid = (body.client_request_id or "").strip()
        if cid:
            if cid in _sample_client_request_ids:
                raise HTTPException(status_code=409, detail="Duplicate submission.")
            _sample_client_request_ids.add(cid)
        return {
            "ok": True,
            "message": "USE_SAMPLE_DATA is on — nothing was written to Google Sheets.",
            "request_group_id": str(uuid.uuid4()),
            "lines": len(body.items),
        }

    spreadsheet = _open_requests_spreadsheet()
    ws = get_requests_worksheet(spreadsheet)
    ensure_request_headers(ws)

    if body.client_request_id:
        existing = read_request_rows(ws)
        cid = body.client_request_id.strip()
        for row in existing:
            if row.get("client_request_id", "").strip() == cid:
                raise HTTPException(status_code=409, detail="Duplicate submission.")

    group_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc).isoformat()
    batch: list[list] = []

    for line in body.items:
        snap = _snapshot_row(inventory, line.sheet_row) or {}
        name = snap.get("Name") or snap.get("name") or snap.get("Description") or ""
        mfr = snap.get("Manufacturer Name") or snap.get("Manufacturer") or ""
        cat = snap.get("Category") or ""
        batch.append([_sheet_safe(c) for c in [
            group_id, ts, body.nametag, line.sheet_row,
            str(name), str(mfr), str(cat), line.quantity,
            body.request_notes.strip(), "Pending",
            (body.client_request_id or "").strip(),
        ]])

    ws.append_rows(batch, value_input_option="RAW")

    return {"ok": True, "request_group_id": group_id, "lines": len(batch), "submitted_at_utc": ts}


ORG_REQ_HEADERS = [
    "Request ID", "Org Name", "Org Email", "Item Name",
    "Category", "Quantity Requested", "Status", "Timestamp", "Review Flag",
]


MAX_ITEMS = 100
EMAIL_RE = re.compile(r"^[^@\s<>\"]+@[^@\s<>\"]+\.[^@\s<>\"]+$")


class OrgCartItemIn(BaseModel):
    item_name: str = Field(min_length=1, max_length=500)
    category: str = Field(default="", max_length=200)
    quantity: int = Field(strict=True, ge=1, le=10000)  # the DB contract wants a JSON number
    sheet_row: Optional[int] = Field(default=None, ge=2, le=500000)

    @field_validator("item_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = _redact_phi(v.strip())  # clinics submit the display name, which may carry a patient ID
        if not v:  # a blank name would match every blank-named inventory row
            raise ValueError("cannot be empty")
        return v


class OrgRequestBody(BaseModel):
    org_name: str = Field(min_length=1, max_length=200)
    org_email: str = Field(min_length=1, max_length=254)
    items: list[OrgCartItemIn] = Field(min_length=1, max_length=MAX_ITEMS)

    @field_validator("org_name", "org_email")
    @classmethod
    def strip_nonempty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cannot be empty")
        return v

    @field_validator("org_email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email address")
        return v


class StatusUpdateBody(BaseModel):
    status: Literal["Approved", "Shipped", "Delivered", "Denied", "Cancelled"]


# Same rules the database enforces in set_request_status(): a request only moves forward, and can be
# Denied or Cancelled only while it is Under Review or Approved.
STATUS_ORDER = ["Under Review", "Approved", "Shipped", "Delivered"]


def _check_transition(current: set[str], new: str) -> None:
    """409 unless every line can move to `new` (lines already at `new` are fine)."""
    for old in current - {new}:
        if new in ("Denied", "Cancelled"):
            allowed = old in ("Under Review", "Approved")
        else:
            allowed = old in STATUS_ORDER and STATUS_ORDER.index(old) < STATUS_ORDER.index(new)
        if not allowed:
            raise HTTPException(status_code=409, detail="That status change is not allowed.")


_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _sheet_safe(v):
    """Defense in depth for user text written to the sheet (we also write with RAW).

    A leading apostrophe makes Sheets treat a cell starting with = + - @ as plain text.
    Numbers pass through untouched. _sheet_unsafe() undoes this when reading back.
    """
    if isinstance(v, str) and v[:1] in _FORMULA_START:
        return "'" + v
    return v


def _sheet_unsafe(v):
    """Remove the apostrophe _sheet_safe added, so it never shows up in the UI."""
    if isinstance(v, str) and v[:1] == "'" and v[1:2] in _FORMULA_START:
        return v[1:]
    return v


def _row_dict(header: list[str], row: list[str]) -> dict:
    return {header[j]: _sheet_unsafe(row[j] if j < len(row) else "") for j in range(len(header))}


def _make_request_id() -> str:
    ts = int(datetime.now(timezone.utc).timestamp())
    suffix = secrets.token_hex(3)  # unguessable; PATCH is keyed on this id in sheet mode
    return f"REQ-{ts}-{suffix}"


def _org_requests_worksheet(spreadsheet: gspread.Spreadsheet) -> gspread.Worksheet:
    title = os.environ.get("ORG_REQUESTS_WORKSHEET_TITLE", "Requests").strip()
    try:
        ws = spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=title, rows=3000, cols=len(ORG_REQ_HEADERS) + 2)

    rows = ws.get_all_values()
    first_row = rows[0] if rows else []
    has_header_row = bool(first_row) and any(str(cell).strip() for cell in first_row)

    if not has_header_row:
        ws.append_row(ORG_REQ_HEADERS, value_input_option="RAW")
    elif first_row[0] != ORG_REQ_HEADERS[0]:
        raise HTTPException(
            status_code=500,
            detail=f"Worksheet '{title}' has unexpected headers. Expected 'Request ID'.",
        )
    return ws


LOT_SUFFIX_RE = re.compile(r"\s*\[Lot [^\]]*\]$")


def _base_item_name(name: str) -> str:
    """Drop the trailing "[Lot X, Box Y, Pallet Z]" the UI appends so HQ knows what to pull.

    The full name is stored and emailed; only matching against inventory uses the base name.
    """
    return LOT_SUFFIX_RE.sub("", name.strip(), count=1)


def _norm_name(name: str) -> str:
    """Compare item names ignoring case, padding, inner whitespace and NBSP-style variants."""
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def _review_flag(inventory: list[dict], item_name: str) -> bool:
    needle = _norm_name(_base_item_name(item_name))
    for rec in inventory:
        if _norm_name(rec.get("Name") or rec.get("name") or "") == needle:
            review = (rec.get("Review") or "").strip()
            return review.lower() in ("review needed", "yes")
    return False


def _inventory_primary_key(record: dict) -> str:
    for key, value in record.items():
        if key == "_sheet_row":
            continue
        return str(value).strip()
    return ""


SERVERLESS_EMAIL_BUDGET = 5  # seconds in total per request on Vercel


def _deliver(tasks: BackgroundTasks, *jobs: tuple) -> None:
    """Run (function, *args) email jobs. Never raises: email must not fail a saved request.

    Normally they run after the response (BackgroundTasks). On Vercel the function may be frozen
    once the response is sent, so send now, in parallel, waiting at most a few seconds.
    """
    if _auto_sample_preview():
        return  # preview with demo data: never email anyone
    if not os.environ.get("VERCEL"):
        for fn, *args in jobs:
            tasks.add_task(fn, *args)
        return
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=max(len(jobs), 1))
    try:
        concurrent.futures.wait([pool.submit(fn, *args) for fn, *args in jobs],
                                timeout=SERVERLESS_EMAIL_BUDGET)
    except Exception:
        logger.exception("email delivery failed")
    finally:
        pool.shutdown(wait=False)


def _queue_submit_emails(tasks: BackgroundTasks, body: OrgRequestBody, request_id: str,
                         flagged: list[str], client_ip: str = "") -> None:
    """Confirmation + HQ alert run after the response, so a slow provider never blocks users."""
    if os.environ.get("EMAIL_ON_SUBMIT", "true").strip().lower() in ("false", "0", "no", "off"):
        return
    items = [{"item_name": i.item_name, "category": i.category, "quantity": i.quantity}
             for i in body.items]
    _deliver(tasks,
             (email_svc.send_org_confirmation, body.org_name, body.org_email, items, request_id, client_ip),
             (email_svc.send_hq_alert, body.org_name, body.org_email, items, request_id, flagged))


def _review_flags(body: OrgRequestBody) -> list[bool]:
    """Which requested items the inventory marks 'Review needed' (HQ must check them)."""
    try:
        inventory = get_inventory_records()
    except Exception:  # a flaky inventory read must not block saving the request
        return [False] * len(body.items)
    return [_review_flag(inventory, i.item_name) for i in body.items]


@app.post("/requests")
def submit_org_request(body: OrgRequestBody, tasks: BackgroundTasks, request: Request,
                       _rl: None = Depends(rate_limit_post)):
    client_ip = _client_ip(request)
    if db.enabled():
        flags = _review_flags(body)
        request_id = db.create_request(body.org_name, body.org_email, [
            {"item_name": i.item_name, "category": i.category, "quantity": i.quantity,
             "review_flag": flag}
            for i, flag in zip(body.items, flags)
        ])
        _queue_submit_emails(tasks, body, request_id,
                             [i.item_name for i, flag in zip(body.items, flags) if flag], client_ip)
        return {"request_id": request_id, "status": "Under Review"}

    flags = _review_flags(body)
    flagged = [i.item_name for i, f in zip(body.items, flags) if f]

    if _use_sample_data():
        request_id = _make_request_id()
        ts = datetime.now(timezone.utc).isoformat()
        for item, flag in zip(body.items, flags):
            _sample_org_request_rows.append({
                "Request ID": request_id, "Org Name": body.org_name,
                "Org Email": body.org_email, "Item Name": item.item_name,
                "Category": item.category, "Quantity Requested": str(item.quantity),
                "Status": "Under Review", "Timestamp": ts, "Review Flag": "TRUE" if flag else "FALSE",
            })
        _queue_submit_emails(tasks, body, request_id, flagged, client_ip)
        return {"request_id": request_id, "status": "Under Review", "message": "USE_SAMPLE_DATA mode."}

    request_id = _make_request_id()
    ts = datetime.now(timezone.utc).isoformat()

    items_payload = [
        {"item_name": item.item_name, "category": item.category, "quantity": item.quantity, "inventory_key": ""}
        for item in body.items
    ]

    batch: list[list] = [
        [_sheet_safe(c) for c in [request_id, body.org_name, body.org_email, item.item_name,
                                  item.category, item.quantity, "Under Review", ts, "TRUE" if flag else "FALSE"]]
        for item, flag in zip(body.items, flags)
    ]

    spreadsheet = _open_requests_spreadsheet()
    ws = _org_requests_worksheet(spreadsheet)
    ws.append_rows(batch, value_input_option="RAW")

    _queue_submit_emails(tasks, body, request_id, flagged, client_ip)
    return {"request_id": request_id, "status": "Under Review"}


@app.patch("/requests/{request_id}/status", dependencies=[Depends(require_hq)])
async def update_org_request_status(request_id: str, body: StatusUpdateBody, tasks: BackgroundTasks):
    if db.enabled():
        rows = [r for r in db.get_requests() if r["Request ID"].strip() == request_id]
        if not rows:
            raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")
        if all(r["Status"].strip() == body.status for r in rows):
            return {"request_id": request_id, "status": body.status, "changed": False}
        try:
            found = db.set_request_status(request_id, body.status)
        except psycopg.errors.NoDataFound:  # SQLSTATE P0002: unknown id
            raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")
        except psycopg.errors.RaiseException as exc:
            # "cannot change request ..." is a refused transition; anything else is bad input (400).
            if str(exc).startswith("cannot change request"):
                raise HTTPException(status_code=409, detail="That status change is not allowed.")
            raise
        except psycopg.errors.CheckViolation:
            raise HTTPException(status_code=409, detail="That status change is not allowed.")
        if not found:
            raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")
        if rows[0]["Org Email"]:
            items = [
                {"item_name": r["Item Name"], "category": r["Category"], "quantity": r["Quantity Requested"]}
                for r in rows
            ]
            _deliver(tasks, (email_svc.send_status_update, rows[0]["Org Name"], rows[0]["Org Email"],
                             body.status, items, request_id))
        _inventory_cache.clear()
        return {"request_id": request_id, "status": body.status}

    if _use_sample_data():
        rows = [r for r in _sample_org_request_rows if r.get("Request ID", "").strip() == request_id]
        if not rows:
            raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")
        current = {r["Status"].strip() for r in rows}
        if current == {body.status}:
            return {"request_id": request_id, "status": body.status, "changed": False}
        _check_transition(current, body.status)
        for row in rows:
            row["Status"] = body.status
        _inventory_cache.clear()
        if rows[0]["Org Email"]:
            items = [{"item_name": r["Item Name"], "category": r["Category"],
                      "quantity": r["Quantity Requested"]} for r in rows]
            _deliver(tasks, (email_svc.send_status_update, rows[0]["Org Name"], rows[0]["Org Email"],
                             body.status, items, request_id))
        return {"request_id": request_id, "status": body.status, "updated_rows": len(rows)}

    spreadsheet = _open_requests_spreadsheet()
    ws = _org_requests_worksheet(spreadsheet)
    all_rows = ws.get_all_values()

    if len(all_rows) <= 1:
        raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")

    header = all_rows[0]
    try:
        id_col = header.index("Request ID")
        status_col = header.index("Status")
        org_name_col = header.index("Org Name")
        org_email_col = header.index("Org Email")
        item_name_col = header.index("Item Name")
        category_col = header.index("Category")
        qty_col = header.index("Quantity Requested")
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Unexpected sheet headers: {exc}") from exc

    matching_sheet_rows: list[int] = []
    org_name = ""
    org_email = ""
    items: list[dict] = []
    current_statuses: set[str] = set()

    for i, row in enumerate(all_rows[1:], start=2):
        if len(row) > id_col and row[id_col].strip() == request_id:
            matching_sheet_rows.append(i)
            current_statuses.add(row[status_col].strip() if len(row) > status_col else "")
            if not org_name and len(row) > org_name_col:
                org_name = _sheet_unsafe(row[org_name_col])
            if not org_email and len(row) > org_email_col:
                org_email = row[org_email_col]
            items.append({
                "item_name": _sheet_unsafe(row[item_name_col]) if len(row) > item_name_col else "",
                "category": _sheet_unsafe(row[category_col]) if len(row) > category_col else "",
                "quantity": row[qty_col] if len(row) > qty_col else "",
            })

    if not matching_sheet_rows:
        raise HTTPException(status_code=404, detail=f"Request ID '{request_id}' not found.")

    if current_statuses == {body.status}:
        return {"request_id": request_id, "status": body.status, "changed": False}
    _check_transition(current_statuses, body.status)

    sheet_status_col = status_col + 1
    ws.batch_update([
        {"range": gspread.utils.rowcol_to_a1(r, sheet_status_col), "values": [[body.status]]}
        for r in matching_sheet_rows
    ])

    _inventory_cache.clear()  # HQ sees the effect on this instance at once (others: within 60s)
    if org_email:
        _deliver(tasks, (email_svc.send_status_update, org_name, org_email, body.status, items, request_id))

    return {"request_id": request_id, "status": body.status}


@app.get("/inventory/availability")
async def inventory_availability(request: Request):
    inventory = get_inventory_records()

    org_requests: list[dict] = []
    if db.enabled():
        try:
            org_requests = db.get_requests()
        except Exception:
            pass
    elif _use_sample_data():
        org_requests = list(_sample_org_request_rows)
    else:
        try:
            spreadsheet = _open_requests_spreadsheet()
            ws = _org_requests_worksheet(spreadsheet)
            all_rows = ws.get_all_values()
            if len(all_rows) > 1:
                header = all_rows[0]
                for r in all_rows[1:]:
                    if any(cell.strip() for cell in r):
                        org_requests.append(_row_dict(header, r))
        except Exception:
            pass

    # Availability = stock minus what HQ has Approved. Under Review requests are anonymous and
    # unvetted, so they must not change what other clinics see. Shipped stock is assumed to have
    # been taken out of the inventory quantity by HQ. Requests are matched by normalized item name.
    approved_by_name: dict[str, int] = {}
    for r in org_requests:
        if r.get("Status", "").strip() == "Approved":
            key = _norm_name(_base_item_name(r.get("Item Name", "")))
            try:
                qty_asked = int(str(r.get("Quantity Requested", "0")).strip())
            except ValueError:
                qty_asked = 1
            approved_by_name[key] = approved_by_name.get(key, 0) + max(qty_asked, 0)

    def _qty(rec: dict) -> Optional[int]:
        try:
            # float() first: Sheets can export whole numbers as "12.0"
            return max(int(float(str(rec.get("Quantity") or rec.get("quantity") or "").strip().replace(",", ""))), 0)
        except (ValueError, OverflowError):
            return None

    # Spread each name's approved quantity over its inventory rows in order (first lot first),
    # so a small lot reads 0 after a small approval and a big lot is not reduced by it.
    left_to_hold = dict(approved_by_name)
    result = []
    for rec in inventory:
        item_name = (rec.get("Name") or rec.get("name") or "").strip()
        category = (rec.get("Category") or rec.get("category") or "").strip()
        sheet_row = rec.get("_sheet_row")
        qty = _qty(rec)
        key = _norm_name(item_name)
        held = 0
        if qty is not None and left_to_hold.get(key):
            held = min(qty, left_to_hold[key])
            left_to_hold[key] -= held

        if qty is None:  # blank or unparseable stock: unknown, not low
            remaining = None
        else:
            remaining = qty - held
        if remaining is None:
            availability_status, tags = "Available", ["Available"]
        elif approved_by_name.get(key) and remaining <= 0:
            availability_status, tags = "Requested", ["Requested"]
        elif remaining <= 5:
            availability_status, tags = "Limited", ["Low Stock"]
        else:
            availability_status, tags = "Available", ["Available"]

        # Org names stay in the sheet for HQ; don't expose them to other clinics.
        result.append({
            "sheet_row": sheet_row, "item_name": item_name, "category": category,
            "availability_status": availability_status, "tags": tags, "remaining": remaining,
            "requesting_org": None, "request_id": None,
        })

    return _cached_json(request, result)


@app.get("/requests")
async def list_org_requests(request: Request, response: Response, email: Optional[str] = None,
                            x_hq_token: Optional[str] = Header(default=None)):
    """Org view: ?email=<exact address, case-insensitive> returns only that org's lines.

    Without a non-empty email this is the HQ view of ALL requests, which needs the
    X-HQ-Token header (disabled with 403 when HQ_API_TOKEN is not set).
    """
    response.headers["Cache-Control"] = "no-store"  # per-clinic data must never be cached
    wanted = (email or "").strip().lower()
    if not wanted:
        require_hq(x_hq_token)
    else:
        _check_rate("lookup:" + _client_ip(request), LOOKUP_LIMIT)

    def mine(rows: list[dict]) -> list[dict]:
        if not wanted:
            return rows
        return [r for r in rows if r.get("Org Email", "").strip().lower() == wanted]

    if db.enabled():
        return mine(db.get_requests())

    if _use_sample_data():
        return mine(list(_sample_org_request_rows))

    spreadsheet = _open_requests_spreadsheet()
    ws = _org_requests_worksheet(spreadsheet)
    all_rows = ws.get_all_values()

    if len(all_rows) <= 1:
        return []

    header = all_rows[0]
    return mine([
        _row_dict(header, r)
        for r in all_rows[1:]
        if any(cell.strip() for cell in r)
    ])
