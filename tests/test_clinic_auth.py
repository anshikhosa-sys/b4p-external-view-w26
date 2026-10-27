"""Clinic sign-in: email, 6-digit code, signed session. No passwords, nothing kept in server memory."""
import pytest
from fastapi.testclient import TestClient

import main
from app import clinic_auth
from app.services import email as email_svc


@pytest.fixture
def client(monkeypatch):
    for name in ("RESEND_API_KEY", "BREVO_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "VERCEL_ENV", "AUTH_SECRET"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("USE_SAMPLE_DATA", "1")
    main._hits.clear()
    clinic_auth.reset()
    return TestClient(main.app)


def ask(c, email="nurse@hillside.org"):
    return c.post("/api/auth/sign-in", json={"email": email}).json()


def test_any_email_gets_a_code_and_a_session(client):
    sent = ask(client, " Nurse@Hillside.org ")
    assert len(sent["preview_code"]) == 6 and sent["ticket"]
    v = client.post("/api/auth/verify", json={"email": "nurse@hillside.org", "code": sent["preview_code"], "ticket": sent["ticket"]})
    assert v.status_code == 200 and v.json()["email"] == "nurse@hillside.org"
    me = client.get("/api/auth/me", headers={"X-Clinic-Session": v.json()["token"]})
    assert me.json() == {"email": "nurse@hillside.org"}
    assert me.headers["cache-control"] == "no-store"


def test_a_bad_email_is_refused(client):
    assert client.post("/api/auth/sign-in", json={"email": "not-an-email"}).status_code == 422


def test_wrong_code_then_used_up(client):
    sent = ask(client)
    wrong = "000000" if sent["preview_code"] != "000000" else "111111"
    body = {"email": "nurse@hillside.org", "ticket": sent["ticket"]}
    for _ in range(clinic_auth.CODE_TRIES):
        r = client.post("/api/auth/verify", json={**body, "code": wrong})
        assert r.status_code == 400 and "isn’t right" in r.json()["detail"]
    r = client.post("/api/auth/verify", json={**body, "code": sent["preview_code"]})
    assert r.status_code == 400 and "run out" in r.json()["detail"]


def test_a_code_works_once(client):
    sent = ask(client)
    body = {"email": "nurse@hillside.org", "code": sent["preview_code"], "ticket": sent["ticket"]}
    assert client.post("/api/auth/verify", json=body).status_code == 200
    assert client.post("/api/auth/verify", json=body).status_code == 400


def test_a_ticket_only_works_for_its_own_email(client):
    sent = ask(client)
    r = client.post("/api/auth/verify", json={"email": "someone@else.org", "code": sent["preview_code"], "ticket": sent["ticket"]})
    assert r.status_code == 400


def test_forged_or_expired_tokens_get_nothing(client, monkeypatch):
    assert client.get("/api/auth/me", headers={"X-Clinic-Session": "abc.def"}).status_code == 401
    token = clinic_auth.start_session("nurse@hillside.org")
    body, mac = token.split(".")
    assert client.get("/api/auth/me", headers={"X-Clinic-Session": f"{body}.{mac[:-2]}xx"}).status_code == 401
    # a code ticket is not a session
    assert client.get("/api/auth/me", headers={"X-Clinic-Session": ask(client)["ticket"]}).status_code == 401
    monkeypatch.setattr(clinic_auth.time, "time", lambda: 10**12)
    assert clinic_auth.session_email(token) is None


def test_with_an_email_provider_the_code_is_emailed_not_returned(client, monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "x")
    sent = []
    monkeypatch.setattr(email_svc, "_send", lambda to, subject, html, text=None: sent.append((to, subject, text)) or True)
    r = client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"})
    assert r.status_code == 200 and "preview_code" not in r.json()
    (to, subject, text), = sent
    assert to == "nurse@hillside.org" and subject.split()[0] in text


def test_production_needs_a_secret_and_an_email_provider(client, monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("USE_SAMPLE_DATA")
    monkeypatch.setattr(main, "_has_google_creds", lambda: True)  # otherwise every route is a 503
    assert client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"}).status_code == 503
    monkeypatch.setenv("AUTH_SECRET", "s" * 32)
    assert client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"}).status_code == 503
    monkeypatch.setenv("BREVO_API_KEY", "x")
    monkeypatch.setattr(email_svc, "_send", lambda *a, **k: True)
    r = client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"})
    assert r.status_code == 200 and "preview_code" not in r.json()


def test_one_inbox_cannot_be_flooded(client):
    for _ in range(3):
        assert client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"}).status_code == 200
    assert client.post("/api/auth/sign-in", json={"email": "nurse@hillside.org"}).status_code == 429
