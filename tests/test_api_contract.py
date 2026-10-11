"""API contract: response shapes, validation boundaries, auth, and error paths.

Tests that take `client` run in sheet-sample mode and Postgres mode (see conftest.py).
Nothing here reaches Google, a real database server other than the local test DB, or email.
"""
import re
import uuid

import gspread
import pytest
from fastapi.testclient import TestClient

from conftest import HQ

REQ_ID = re.compile(r"^REQ-\d{10}-(\d{3}|[0-9a-f]{6})$")
STATUSES = {"Available", "Limited", "Requested"}


@pytest.fixture(autouse=True)
def fresh_email_limits():
    from app.services import email as email_svc
    if hasattr(email_svc, "reset_limits"):
        email_svc.reset_limits()


def _email():
    return f"qa.{uuid.uuid4().hex[:10]}@example.org"


def _name(c):
    """An item name that exists in the active data source."""
    if c.get("/health").json()["source"] == "sheet":
        return "Gauze"
    return next(r["Name"] for r in c.get("/api/supplies").json() if (r["Name"] or "").strip())


def _post(c, items=None, org=None, email=None):
    return c.post("/requests", json={
        "org_name": org if org is not None else "QA Clinic",
        "org_email": email if email is not None else _email(),
        "items": items if items is not None else [{"item_name": _name(c), "quantity": 1}],
    })


def test_retry_with_same_client_request_id_creates_one_request(client):
    email, cid = _email(), uuid.uuid4().hex
    items = [{"item_name": _name(client), "quantity": 1}]
    body = {"org_name": "Retry Clinic", "org_email": email, "items": items, "client_request_id": cid}
    first, second = client.post("/requests", json=body), client.post("/requests", json=body)
    assert first.status_code == second.status_code == 200
    assert first.json()["request_id"] == second.json()["request_id"]
    assert REQ_ID.match(first.json()["request_id"])
    rows = client.get("/requests", params={"email": email}).json()
    assert len({r["Request ID"] for r in rows}) == 1 and len(rows) == 1
    other = client.post("/requests", json={**body, "client_request_id": uuid.uuid4().hex})
    assert other.json()["request_id"] != first.json()["request_id"]


def test_reusing_a_client_request_id_for_a_different_request_is_a_409_that_leaks_nothing(client):
    cid, name = uuid.uuid4().hex, _name(client)
    mine = {"org_name": "Clash Clinic", "org_email": _email(), "client_request_id": cid,
            "items": [{"item_name": name, "quantity": 1}]}
    first = client.post("/requests", json=mine)
    assert first.status_code == 200
    rid = first.json()["request_id"]
    for other in (
        {**mine, "items": [{"item_name": name, "quantity": 2}]},          # different body
        {**mine, "org_name": "Someone Else", "org_email": _email()},      # different clinic
    ):
        r = client.post("/requests", json=other)
        assert r.status_code == 409
        assert rid not in r.text and "Clash Clinic" not in r.text
    assert client.post("/requests", json=mine).json()["request_id"] == rid  # the true retry still works


def test_org_name_and_category_are_redacted_like_item_names(client):
    email = _email()
    r = client.post("/requests", json={
        "org_name": "Clinic Pt 12345 jane.doe@example.org", "org_email": email,
        "items": [{"item_name": _name(client), "category": "Tubes A12-345 for Patient: Test Person", "quantity": 1}]})
    assert r.status_code == 200
    row = client.get("/requests", params={"email": email}).json()[0]
    for field in ("Org Name", "Category"):
        for secret in ("12345", "jane.doe@example.org", "A12-345", "Test Person"):
            assert secret not in row[field], (field, row[field])


@pytest.mark.parametrize("email", ["a@b,c.org", "a@b.org,evil@x.org", "a;b@c.org", "a@b.org;c@d.org", "a,b@c.org"])
def test_email_with_list_separators_is_rejected(client, email):
    r = client.post("/requests", json={"org_name": "O", "org_email": email,
                                       "items": [{"item_name": _name(client), "quantity": 1}]})
    assert r.status_code == 422


def test_request_lines_keep_the_item_id_in_postgres_mode(client):
    if client.get("/health").json()["source"] != "postgres":
        pytest.skip("item ids exist only in the database")
    supply = next(r for r in client.get("/api/supplies").json() if (r["Name"] or "").strip())
    email = _email()
    r = client.post("/requests", json={"org_name": "Item Clinic", "org_email": email, "items": [
        {"item_name": supply["Name"], "quantity": 1, "sheet_row": supply["_sheet_row"]},
        {"item_name": supply["Name"], "quantity": 1, "sheet_row": 499999},   # not an inventory row: no id, still saved
        {"item_name": supply["Name"], "quantity": 1}]})
    assert r.status_code == 200
    rows = client.get("/requests", params={"email": email}).json()
    assert len(rows) == 3
    ids = sorted(row["Item ID"] for row in rows)
    assert ids[:2] == ["", ""] and ids[2].isdigit()


def test_item_id_is_dropped_when_the_sheet_row_has_shifted(client):
    if client.get("/health").json()["source"] != "postgres":
        pytest.skip("item ids exist only in the database")
    supplies = [r for r in client.get("/api/supplies").json() if (r["Name"] or "").strip()]
    a = supplies[0]
    b = next(r for r in supplies if r["Name"].strip().casefold() != a["Name"].strip().casefold())
    email = _email()
    r = client.post("/requests", json={"org_name": "Shift Clinic", "org_email": email, "items": [
        {"item_name": a["Name"] + " [Lot X, Box 1, Pallet 2]", "quantity": 1, "sheet_row": a["_sheet_row"]},  # still the same item
        {"item_name": a["Name"].upper(), "quantity": 1, "sheet_row": a["_sheet_row"]},                      # same name, other case
        {"item_name": a["Name"], "quantity": 1, "sheet_row": b["_sheet_row"]}]})                            # row now holds another item
    assert r.status_code == 200
    ids = sorted(row["Item ID"] for row in client.get("/requests", params={"email": email}).json())
    assert ids[0] == "" and ids[1].isdigit() and ids[2].isdigit()


@pytest.mark.parametrize("cid", ["short", "has space in it", "x" * 81, "bad/chars-12345"])
def test_client_request_id_shape_is_validated(client, cid):
    r = client.post("/requests", json={"org_name": "O", "org_email": _email(),
                                       "items": [{"item_name": _name(client), "quantity": 1}],
                                       "client_request_id": cid})
    assert r.status_code == 422


# --- shapes --------------------------------------------------------------------

def test_health_shape(client):
    body = client.get("/health").json()
    assert set(body) == {"source", "ok", "email"}
    assert body["source"] in ("sheet", "postgres") and body["ok"] is True
    assert body["email"] is None  # every provider env var is blanked in tests


def test_supplies_shape(client):
    rows = client.get("/api/supplies").json()
    assert isinstance(rows, list) and rows
    assert {"Name", "Category", "Quantity", "Review", "_sheet_row"} <= set(rows[0])
    sheet_rows = [r["_sheet_row"] for r in rows]
    assert all(isinstance(n, int) and n >= 2 for n in sheet_rows)
    assert len(set(sheet_rows)) == len(sheet_rows)


def test_availability_shape_matches_supplies(client):
    supplies = client.get("/api/supplies").json()
    av = client.get("/inventory/availability").json()
    assert [a["sheet_row"] for a in av] == [s["_sheet_row"] for s in supplies]
    for a in av:
        assert set(a) == {"sheet_row", "item_name", "category", "availability_status", "tags",
                          "requesting_org", "request_id", "remaining"}
        assert a["availability_status"] in STATUSES and isinstance(a["tags"], list)
        assert a["requesting_org"] is None and a["request_id"] is None  # never leak other orgs


def test_submit_response_shape(client):
    r = _post(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert REQ_ID.match(body["request_id"]) and body["status"] == "Under Review"


def test_list_by_email_row_shape(client):
    email = _email()
    rid = _post(client, email=email).json()["request_id"]
    rows = client.get("/requests", params={"email": email}).json()
    assert len(rows) == 1
    assert set(rows[0]) >= {"Request ID", "Org Name", "Org Email", "Item Name", "Category",
                            "Quantity Requested", "Status", "Timestamp", "Review Flag"}
    assert rows[0]["Request ID"] == rid and rows[0]["Status"] == "Under Review"
    assert rows[0]["Quantity Requested"] == "1"  # string in both modes


# --- validation boundaries -------------------------------------------------------

@pytest.mark.parametrize("qty,ok", [(0, False), (-1, False), (1, True), (10000, True),
                                    (10001, False), (1.5, False), (5.5, False), (None, False), ("abc", False),
                                    ("5", False), (True, False), (False, False), ([5], False), ({"n": 5}, False)])
def test_quantity_bounds(client, qty, ok):
    r = _post(client, items=[{"item_name": _name(client), "quantity": qty}])
    assert r.status_code == (200 if ok else 422), r.text


@pytest.mark.parametrize("n,ok", [(0, False), (1, True), (100, True), (101, False)])
def test_item_count_bounds(client, n, ok):
    r = _post(client, items=[{"item_name": _name(client), "quantity": 1}] * n)
    assert r.status_code == (200 if ok else 422), r.text


@pytest.mark.parametrize("org,ok", [("", False), ("   ", False), ("\t\n", False), ("A", True),
                                    ("x" * 200, True), ("x" * 201, False), ("  padded  ", True)])
def test_org_name_bounds(client, org, ok):
    assert _post(client, org=org).status_code == (200 if ok else 422)


def test_org_name_is_stored_trimmed(client):
    email = _email()
    _post(client, org="  Trim Clinic  ", email=email)
    assert client.get("/requests", params={"email": email}).json()[0]["Org Name"] == "Trim Clinic"


@pytest.mark.parametrize("email,ok", [
    ("a@b.co", True), ("  Mixed.Case@Example.ORG  ", True),
    ("", False), ("   ", False), ("nope", False), ("a@b", False), ("@b.co", False),
    ("a@@b.co", False), ("a b@c.co", False), ("<a@b.co>", False), ('"a"@b.co', False),
    ("a@b.co\nBcc: x@y.z", False), ("a@b.co,c@d.co", False),
    ("x" * 249 + "@b.co", True), ("x" * 250 + "@b.co", False),
])
def test_email_validation(client, email, ok):
    assert _post(client, email=email).status_code == (200 if ok else 422), email


@pytest.mark.parametrize("name,ok", [("", False), ("x" * 500, True), ("x" * 501, False)])
def test_item_name_bounds(client, name, ok):
    assert _post(client, items=[{"item_name": name, "quantity": 1}]).status_code == (200 if ok else 422)


@pytest.mark.parametrize("name", ["   ", "\t", "\n"])
def test_whitespace_item_name_rejected(client, name):
    """Blank names would match every blank-named inventory row in availability (QA-03)."""
    assert _post(client, items=[{"item_name": name, "quantity": 1}]).status_code == 422


@pytest.mark.parametrize("body", [
    None, [], {}, {"org_name": "A", "org_email": "a@b.co"},
    {"org_name": "A", "org_email": "a@b.co", "items": "Gauze"},
    {"org_name": "A", "org_email": "a@b.co", "items": [{"quantity": 1}]},
    {"org_name": "A", "org_email": "a@b.co", "items": [{"item_name": "Gauze"}]},
    {"org_name": 5, "org_email": "a@b.co", "items": [{"item_name": "Gauze", "quantity": 1}]},
])
def test_malformed_bodies_are_422(client, body):
    r = client.post("/requests", json=body)
    assert r.status_code == 422


def test_non_json_body_is_422(client):
    r = client.post("/requests", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_rejected_submit_sends_no_email(client, no_email):
    _post(client, items=[{"item_name": "Gauze", "quantity": 0}])
    _post(client, email="bad")
    assert no_email == []


# --- rate limit ----------------------------------------------------------------

def test_rate_limit_eleventh_post_is_429_with_message(client, no_email):
    for _ in range(10):
        assert _post(client).status_code == 200
    sent = len(no_email)
    r = _post(client)
    assert r.status_code == 429 and "minute" in r.json()["detail"]
    assert len(no_email) == sent  # nothing queued for the rejected post


def test_rate_limit_counts_invalid_posts_too(client):
    """Invalid bodies still use up the bucket, so a spammer can't probe for free."""
    for _ in range(10):
        _post(client, items=[])
    assert _post(client).status_code == 429


# --- HQ endpoints --------------------------------------------------------------

def test_patch_requires_token(client, monkeypatch):
    rid = _post(client).json()["request_id"]
    url = f"/requests/{rid}/status"
    assert client.patch(url, json={"status": "Approved"}).status_code == 401
    assert client.patch(url, json={"status": "Approved"}, headers={"X-HQ-Token": "nope"}).status_code == 401
    monkeypatch.delenv("HQ_API_TOKEN")
    assert client.patch(url, json={"status": "Approved"}, headers=HQ).status_code == 403


@pytest.mark.parametrize("status", ["Under Review", "approved", "DENIED", "", None, "Bogus", "Pending"])
def test_patch_rejects_unknown_status(client, status):
    rid = _post(client).json()["request_id"]
    assert client.patch(f"/requests/{rid}/status", json={"status": status}, headers=HQ).status_code == 422


def test_patch_unknown_request_is_404(client):
    r = client.patch("/requests/REQ-0000000000-000/status", json={"status": "Approved"}, headers=HQ)
    assert r.status_code == 404


def test_patch_cannot_move_backwards(client):
    rid = _post(client).json()["request_id"]
    assert client.patch(f"/requests/{rid}/status", json={"status": "Shipped"}, headers=HQ).status_code == 200
    r = client.patch(f"/requests/{rid}/status", json={"status": "Approved"}, headers=HQ)
    assert r.status_code == 409


# --- CORS ------------------------------------------------------------------------

def test_cors_allows_local_dev_origin_only(sheet_client):
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    ok = sheet_client.options("/requests", headers={"Origin": "http://localhost:3000", **pre})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = sheet_client.options("/requests", headers={"Origin": "https://evil.example", **pre})
    assert bad.headers.get("access-control-allow-origin") is None


# --- Google Sheets errors (live-sheet mode with gspread faked) ----------------------

# Google's quota error (HTTP 429) must surface as 503 'busy'; any other API error as 502.
SECRET = "quota exceeded for project b4p-secret-123"


class _Resp:
    status_code = 429
    text = SECRET

    def json(self):
        return {"error": {"code": 429, "message": SECRET, "status": "RESOURCE_EXHAUSTED"}}


def _api_error():
    return gspread.exceptions.APIError(_Resp())


class FakeWorksheet:
    def __init__(self, rows, fail=()):
        self.rows, self.fail = rows, set(fail)

    def _maybe_fail(self, op):
        if op in self.fail:
            raise _api_error()

    def get_all_values(self):
        self._maybe_fail("read")
        return [list(r) for r in self.rows]

    def append_row(self, row, value_input_option=None):
        self._maybe_fail("write")
        self.rows.append(list(row))

    def append_rows(self, rows, value_input_option=None):
        self._maybe_fail("write")
        self.rows.extend([str(c) for c in r] for r in rows)

    def batch_update(self, updates):
        self._maybe_fail("write")
        for u in updates:
            row, col = gspread.utils.a1_to_rowcol(u["range"])
            self.rows[row - 1][col - 1] = u["values"][0][0]


class FakeSpreadsheet:
    def __init__(self, inventory, requests):
        self.sheet1, self.requests = inventory, requests

    def worksheet(self, title):
        return self.requests


@pytest.fixture
def live_sheet(monkeypatch):
    """Sheet mode without USE_SAMPLE_DATA, with gspread replaced by in-memory fakes."""
    import main
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("USE_SAMPLE_DATA", raising=False)
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet")
    inv = FakeWorksheet([["Name", "Category", "Quantity", "Review"], ["Gauze", "C", "10", "No"]])
    req = FakeWorksheet([main.ORG_REQ_HEADERS,
                         ["REQ-1-001", "O", "o@x.org", "Gauze", "C", "2", "Under Review", "t", "FALSE"]])

    class FakeClient:
        def open_by_key(self, key):
            return FakeSpreadsheet(inv, req)

    monkeypatch.setattr(main, "_gspread_client", lambda: FakeClient())
    return TestClient(main.app, raise_server_exceptions=False), inv, req


def _no_leak(r):
    assert SECRET not in r.text and "b4p-secret" not in r.text


def test_live_sheet_happy_path(live_sheet, no_email):
    c, _, req = live_sheet
    assert c.get("/health").json()["source"] == "sheet"
    r = c.post("/requests", json={"org_name": "O", "org_email": "q@x.org",
                                  "items": [{"item_name": "Gauze", "quantity": 1}]})
    assert r.status_code == 200 and len(req.rows) == 3 and len(no_email) == 1
    av = c.get("/inventory/availability").json()
    assert av[0]["availability_status"] == "Available"  # 10 - (2 + 1) = 7 left


def test_sheet_write_quota_error_is_503_without_leak(live_sheet, no_email):
    c, _, req = live_sheet
    req.fail = {"write"}
    r = c.post("/requests", json={"org_name": "O", "org_email": "q@x.org",
                                  "items": [{"item_name": "Gauze", "quantity": 1}]})
    assert r.status_code == 503 and r.json()["detail"] == "Inventory service busy, try again in a minute."
    _no_leak(r)
    assert no_email == []  # no confirmation for a request that was never saved


def test_sheet_status_write_quota_error_is_503_without_leak(live_sheet, no_email):
    c, _, req = live_sheet
    req.fail = {"write"}
    r = c.patch("/requests/REQ-1-001/status", json={"status": "Approved"}, headers=HQ)
    assert r.status_code == 503
    _no_leak(r)
    assert no_email == []


@pytest.mark.parametrize("method,url", [("get", "/api/supplies"), ("get", "/inventory/availability")])
def test_sheet_inventory_read_quota_error_is_503_without_leak(live_sheet, method, url):
    c, inv, _ = live_sheet
    inv.fail = {"read"}
    r = getattr(c, method)(url)
    assert r.status_code == 503, (r.status_code, r.text)
    _no_leak(r)


def test_sheet_requests_read_quota_error_is_503_without_leak(live_sheet):
    c, _, req = live_sheet
    req.fail = {"read"}
    r = c.get("/requests", params={"email": "o@x.org"})
    assert r.status_code == 503, (r.status_code, r.text)
    _no_leak(r)


def test_sheet_requests_read_error_does_not_break_availability(live_sheet):
    c, _, req = live_sheet
    req.fail = {"read"}
    r = c.get("/inventory/availability")
    assert r.status_code == 200 and r.json()[0]["availability_status"] == "Available"


def test_internal_api_requests_write_error_does_not_leak(live_sheet, monkeypatch):
    """Legacy /api/requests used to echo the gspread error text (QA-01)."""
    import main
    c, _, req = live_sheet
    req.rows[:] = [main.REQ_HEADERS]
    req.fail = {"write"}
    r = c.post("/api/requests", json={"nametag": "N", "items": [{"sheet_row": 2, "quantity": 1}]}, headers=HQ)
    assert r.status_code == 503
    _no_leak(r)


def test_missing_sheet_config_is_500_with_plain_message(live_sheet, monkeypatch):
    c, _, _ = live_sheet
    monkeypatch.delenv("GOOGLE_SHEET_ID")
    r = c.get("/api/supplies")
    assert r.status_code == 500 and r.json() == {"detail": "Missing GOOGLE_SHEET_ID."}


# --- database down -------------------------------------------------------------------

@pytest.fixture
def db_down(monkeypatch):
    import main
    monkeypatch.setenv("DATABASE_URL", "postgresql://qa_user:hunter2secret@127.0.0.1:1/nope")
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.mark.parametrize("method,url,kw", [
    ("get", "/api/supplies", {}),
    ("get", "/inventory/availability", {}),
    ("get", "/requests?email=a@b.co", {}),
    ("get", "/requests", {"headers": HQ}),
    ("post", "/requests", {"json": {"org_name": "O", "org_email": "a@b.co",
                                    "items": [{"item_name": "Gauze", "quantity": 1}]}}),
    ("patch", "/requests/REQ-1-001/status", {"json": {"status": "Approved"}, "headers": HQ}),
])
def test_db_down_is_503_without_leak(db_down, no_email, method, url, kw):
    r = getattr(db_down, method)(url, **kw)
    assert r.status_code == 503 and r.json() == {"detail": "Database unavailable."}
    assert "hunter2" not in r.text and "127.0.0.1" not in r.text
    assert no_email == []


def test_db_down_health_reports_not_ok(db_down):
    r = db_down.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is False and "hunter2" not in r.text


def test_non_quota_sheet_error_is_502_generic(live_sheet, monkeypatch):
    c, inv, _ = live_sheet
    monkeypatch.setattr(_Resp, "status_code", 500)
    inv.fail = {"read"}
    r = c.get("/api/supplies")
    assert r.status_code == 502 and r.json() == {"detail": "Google Sheets error."}
    _no_leak(r)


def test_formula_text_round_trips_clean_through_sheet(live_sheet, no_email):
    c, _, req = live_sheet
    name = "=HYPERLINK(\"https://evil.test\")"
    r = c.post("/requests", json={"org_name": name, "org_email": "f@x.org",
                                  "items": [{"item_name": "Gauze", "quantity": 1}]})
    assert r.status_code == 200
    assert req.rows[-1][1] == "'" + name  # stored defanged
    got = c.get("/requests", params={"email": "f@x.org"}).json()
    assert got[0]["Org Name"] == name  # but read back without the apostrophe
