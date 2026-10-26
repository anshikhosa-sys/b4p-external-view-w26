"""Blueprints team sign-in (preview): roster check, 6-digit code, team session as HQ access."""
import json

import pytest
from fastapi.testclient import TestClient

import main
from app import team


@pytest.fixture
def roster(tmp_path, monkeypatch):
    path = tmp_path / "members.json"
    path.write_text(json.dumps({"members": [
        {"name": "Rhea Chokhalingam", "email": "RChokha@umich.edu", "position": "Tech"},
        {"name": "Ben Rathi", "email": "benrathi@umich.edu"},
    ]}))
    monkeypatch.setenv("MEMBER_ROSTER_PATH", str(path))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("USE_SAMPLE_DATA", "1")
    monkeypatch.setattr(main, "_sample_org_request_rows", [])
    return TestClient(main.app)


def sign_in(c, email="rchokha@umich.edu"):
    code = c.post("/api/team/sign-in", json={"email": email}).json()["preview_code"]
    return c.post("/api/team/verify", json={"email": email, "code": code})


def test_roster_sheet_parsing_keeps_only_name_position_email():
    values = [
        ["Blueprints for Pangaea Fall 2026"],
        ["", "Name", "Position", "Phone", "Birthday", "Year", "Major", "", "", "", "", "Email"],
        ["", "Executive Board", "", "", "", "", "", "", "", "", "", ""],  # section title: no email
        ["", "Ben Rathi", "President", "555-0100", "1/1", "", "", "", "", "", "", " BenRathi@umich.edu "],
        ["", "Maya Nassif", "Member", "", "", "", "", "", "", "", "", ""],  # no email: skipped
    ]
    out = team.parse_roster_values(values, header_row=2)
    assert out == {"benrathi@umich.edu": {"name": "Ben Rathi", "email": "benrathi@umich.edu", "position": "President"}}


def test_a_member_gets_a_code_and_a_session(roster):
    r = roster.post("/api/team/sign-in", json={"email": " RCHOKHA@umich.edu "})
    assert r.status_code == 200 and len(r.json()["preview_code"]) == 6
    v = roster.post("/api/team/verify", json={"email": "rchokha@umich.edu", "code": r.json()["preview_code"]})
    assert v.status_code == 200
    body = v.json()
    assert body["role"] == "hq" and body["name"] == "Rhea Chokhalingam" and body["position"] == "Tech"
    me = roster.get("/api/team/me", headers={"X-Team-Session": body["token"]}).json()
    assert me["email"] == "rchokha@umich.edu"


def test_someone_not_on_the_roster_is_blocked(roster):
    r = roster.post("/api/team/sign-in", json={"email": "clinic@riverside.org"})
    assert r.status_code == 403
    assert r.json()["detail"] == "This email isn’t on the Blueprints member list."
    assert roster.post("/api/team/verify", json={"email": "clinic@riverside.org", "code": "123456"}).status_code == 403


def test_wrong_code_then_the_code_is_used_up(roster):
    roster.post("/api/team/sign-in", json={"email": "benrathi@umich.edu"})
    for _ in range(team.CODE_TRIES):
        assert roster.post("/api/team/verify", json={"email": "benrathi@umich.edu", "code": "000000x"}).status_code == 400
    r = roster.post("/api/team/verify", json={"email": "benrathi@umich.edu", "code": "000000"})
    assert "run out" in r.json()["detail"]


def test_a_code_works_once(roster):
    code = roster.post("/api/team/sign-in", json={"email": "benrathi@umich.edu"}).json()["preview_code"]
    assert roster.post("/api/team/verify", json={"email": "benrathi@umich.edu", "code": code}).status_code == 200
    assert roster.post("/api/team/verify", json={"email": "benrathi@umich.edu", "code": code}).status_code == 400


def test_a_team_session_opens_the_hq_request_list_and_status_changes(roster):
    roster.post("/requests", json={"org_name": "Riverside", "org_email": "c@x.org",
                                   "items": [{"item_name": "Gauze", "quantity": 1}]})
    assert roster.get("/requests").status_code in (401, 403)  # no session: no HQ view
    token = sign_in(roster).json()["token"]
    rows = roster.get("/requests", headers={"X-Team-Session": token}).json()
    assert rows and rows[0]["Org Name"] == "Riverside"
    rid = rows[0]["Request ID"]
    r = roster.patch(f"/requests/{rid}/status", json={"status": "Approved"}, headers={"X-Team-Session": token})
    assert r.status_code == 200
    roster.post("/api/team/sign-out", headers={"X-Team-Session": token})
    assert roster.get("/requests", headers={"X-Team-Session": token}).status_code in (401, 403)


def test_made_up_sessions_get_nothing(roster):
    assert roster.get("/requests", headers={"X-Team-Session": "not-a-real-session"}).status_code in (401, 403)
    assert roster.get("/api/team/me", headers={"X-Team-Session": "nope"}).status_code == 401


def test_team_sign_in_is_off_on_production(roster, monkeypatch):
    token = sign_in(roster).json()["token"]
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "")  # production would otherwise 503 for missing config
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", "{}")
    assert roster.post("/api/team/sign-in", json={"email": "rchokha@umich.edu"}).status_code == 503
    assert roster.get("/api/team/me", headers={"X-Team-Session": token}).status_code == 401
