import psycopg
import pytest


def test_sheet_mode_health(sheet_client):
    assert sheet_client.get("/health").json() == {"source": "sheet", "ok": True}


def test_sheet_mode_unchanged_lifecycle(sheet_client):
    inv = sheet_client.get("/api/supplies").json()
    assert [r["_sheet_row"] for r in inv] == [2, 3]
    r = sheet_client.post("/requests", json={"org_name": "O", "org_email": "o@x.org",
                                             "items": [{"item_name": "Gauze", "quantity": 1}]})
    rid = r.json()["request_id"]
    assert sheet_client.get("/requests", params={"email": "O@X.ORG"}).json()[0]["Request ID"] == rid
    av = {a["item_name"]: a for a in sheet_client.get("/inventory/availability").json()}
    assert av["Gauze"]["availability_status"] == "Available"  # sample mode ignores requests (pre-existing)
    assert av["Syringe"]["availability_status"] == "Limited"


def test_db_health(db_client):
    assert db_client.get("/health").json() == {"source": "postgres", "ok": True}


def test_db_health_down(monkeypatch):
    import main
    from fastapi.testclient import TestClient
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/nope")
    c = TestClient(main.app)
    assert c.get("/health").json() == {"source": "postgres", "ok": False}
    assert c.get("/api/supplies").status_code == 503


def test_db_supplies_shape(db_client):
    rows = db_client.get("/api/supplies").json()
    assert rows and {"Name", "Category", "Quantity", "Review", "_sheet_row"} <= set(rows[0])
    assert all(isinstance(r["_sheet_row"], int) for r in rows)


def test_db_request_lifecycle(db_client, no_email):
    inv = db_client.get("/api/supplies").json()
    used = {r["Item Name"].strip().lower() for r in db_client.get("/requests").json()}
    name = next(r["Name"] for r in inv if r["Name"] and r["Quantity"].isdigit() and int(r["Quantity"]) > 5
                and r["Name"].strip().lower() not in used)  # availability matches by item name
    email = f"Lifecycle.{__import__('uuid').uuid4().hex[:8]}@Example.org"
    r = db_client.post("/requests", json={"org_name": "Lifecycle " + email, "org_email": email,
                                          "items": [{"item_name": name, "category": "X", "quantity": 2}]})
    assert r.status_code == 200 and r.json()["status"] == "Under Review"
    rid = r.json()["request_id"]
    assert rid.startswith("REQ-")

    assert any(x["Request ID"] == rid for x in db_client.get("/requests").json())
    mine = db_client.get("/requests", params={"email": email.lower()}).json()
    assert [x["Request ID"] for x in mine] == [rid] and mine[0]["Quantity Requested"] == "2"
    assert db_client.get("/requests", params={"email": "nobody@x.org"}).json() == []

    def status_of(n):
        return next(a for a in db_client.get("/inventory/availability").json() if a["item_name"] == n)["availability_status"]

    assert status_of(name) == "Requested"
    assert not no_email  # submission sends no email, as before

    assert db_client.patch(f"/requests/{rid}/status", json={"status": "Approved"}).status_code == 200
    assert db_client.get("/requests", params={"email": email}).json()[0]["Status"] == "Approved"
    assert status_of(name) in ("Available", "Limited")  # Approved is neither pending nor shipped (unchanged logic)

    assert db_client.patch(f"/requests/{rid}/status", json={"status": "Shipped"}).status_code == 200
    assert status_of(name) == "Shipped"
    assert len(no_email) == 2  # one status email per PATCH, same as before

    assert db_client.patch("/requests/REQ-nope/status", json={"status": "Shipped"}).status_code == 404
    assert db_client.patch(f"/requests/{rid}/status", json={"status": "Bogus"}).status_code == 422


def test_db_review_flag(db_client):
    inv = db_client.get("/api/supplies").json()
    flagged = next((r["Name"] for r in inv if r["Review"].strip().lower() in ("review needed", "yes")), None)
    if not flagged:
        pytest.skip("no 'Review needed' rows in test DB")
    rid = db_client.post("/requests", json={"org_name": "Flag Org", "org_email": "f@x.org",
                                            "items": [{"item_name": flagged, "quantity": 1}]}).json()["request_id"]
    row = next(x for x in db_client.get("/requests").json() if x["Request ID"] == rid)
    assert row["Review Flag"] == "TRUE"


def test_db_validation(db_client):
    assert db_client.post("/requests", json={"org_name": "", "org_email": "a@b.c", "items": []}).status_code == 422


def test_migration_script_idempotent(db_client, tmp_path):
    import json
    import subprocess
    import sys
    rid = "REQ-1700000000-001"
    f = tmp_path / "o.json"
    base = {"Request ID": rid, "Org Name": "Migrated Org", "Org Email": "m@x.org", "Category": "C",
            "Quantity Requested": "4", "Status": "Shipped", "Timestamp": "2026-04-15T17:01:05+00:00",
            "Review Flag": "TRUE"}
    f.write_text(json.dumps([{**base, "Item Name": "A"}, {**base, "Item Name": "B"}]))
    for _ in range(2):  # second run must be a no-op
        subprocess.run([sys.executable, "scripts/migrate_org_requests_to_db.py", str(f)], check=True,
                       env={**__import__("os").environ})
    rows = [r for r in db_client.get("/requests").json() if r["Request ID"] == rid]
    assert [r["Item Name"] for r in rows] == ["A", "B"]
    assert rows[0]["Status"] == "Shipped" and rows[0]["Review Flag"] == "TRUE"
    assert rows[0]["Timestamp"].startswith("2026-04-15T17:01:05")
