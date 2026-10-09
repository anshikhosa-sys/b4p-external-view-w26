import io
import json
import urllib.error

import pytest

from app.services import email as e

REAL_SEND = e._send  # captured at import, before the autouse no_email fixture patches it

ITEMS = [{"item_name": "Gauze", "quantity": 2}]
ENV_VARS = ("RESEND_API_KEY", "BREVO_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD",
            "EMAIL_FROM", "EMAIL_REPLY_TO")


def _submit(c, org="Clinic One", email="clinic@example.org"):
    return c.post("/requests", json={"org_name": org, "org_email": email, "items": ITEMS})


# --- submit ----------------------------------------------------------------

def test_submit_sends_one_confirmation_and_one_hq_alert(sheet_client, no_email, monkeypatch):
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    assert _submit(sheet_client).status_code == 200
    assert sorted(m[0] for m in no_email) == ["clinic@example.org", "hq@example.org"]


def test_submit_emails_can_be_disabled(sheet_client, no_email, monkeypatch):
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    monkeypatch.setenv("EMAIL_ON_SUBMIT", "false")
    assert _submit(sheet_client).status_code == 200
    assert no_email == []


def test_no_hq_email_still_confirms_org(sheet_client, no_email):
    assert _submit(sheet_client).status_code == 200
    assert [m[0] for m in no_email] == ["clinic@example.org"]


def test_org_name_is_escaped_in_both_emails(sheet_client, no_email, monkeypatch):
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    assert _submit(sheet_client, org="<script>alert(1)</script>").status_code == 200
    assert len(no_email) == 2
    for _, _, html in no_email:
        assert "<script>" not in html and "&lt;script&gt;" in html


def test_db_submit_alert_lists_flagged_items(db_client, no_email, monkeypatch):
    import main
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    flagged = [r for r in main.get_inventory_records()
               if (r.get("Review") or "").strip().lower() in ("review needed", "yes")]
    if not flagged:
        pytest.skip("no review-flagged item in test data")
    name = flagged[0]["Name"]
    r = db_client.post("/requests", json={"org_name": "Flag Org", "org_email": "f@example.org",
                                          "items": [{"item_name": name, "quantity": 1}]})
    assert r.status_code == 200
    alert = next(m for m in no_email if m[0] == "hq@example.org")
    assert "Manual review required" in alert[2]


# --- abuse caps ----------------------------------------------------------------

def test_confirmations_capped_per_address_but_request_and_alert_still_happen(sheet_client, no_email, monkeypatch):
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    for _ in range(5):
        assert _submit(sheet_client, email="Victim@Example.org").status_code == 200
    to_victim = [m for m in no_email if m[0].lower() == "victim@example.org"]
    to_hq = [m for m in no_email if m[0] == "hq@example.org"]
    assert len(to_victim) == 3  # case-insensitive, 3 per hour
    assert len(to_hq) == 5  # HQ alerts are not capped per address
    assert _submit(sheet_client, email="other@example.org").status_code == 200
    assert any(m[0] == "other@example.org" for m in no_email)  # other addresses unaffected


def test_global_daily_cap_blocks_all_mail_but_requests_succeed(sheet_client, no_email, monkeypatch, caplog):
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    monkeypatch.setenv("EMAIL_DAILY_LIMIT", "3")
    for i in range(3):
        assert _submit(sheet_client, email=f"o{i}@example.org").status_code == 200
    assert len(no_email) == 3  # 6 wanted (confirmation + alert each), capped at 3
    assert "EMAIL_DAILY_LIMIT" in caplog.text


def test_daily_cap_counts_every_send(monkeypatch):
    monkeypatch.setenv("EMAIL_DAILY_LIMIT", "2")
    e.reset_limits()
    assert [e._under_daily_limit() for _ in range(3)] == [True, True, False]


# --- provider selection ------------------------------------------------------

@pytest.fixture
def clean_env(monkeypatch):
    for v in ENV_VARS:
        monkeypatch.setenv(v, "")


@pytest.mark.parametrize("env,expected", [
    ({}, None),
    ({"GMAIL_USER": "a@gmail.com"}, None),  # needs both SMTP vars
    ({"GMAIL_USER": "a@gmail.com", "GMAIL_APP_PASSWORD": "x"}, "smtp"),
    ({"BREVO_API_KEY": "k", "GMAIL_USER": "a@gmail.com", "GMAIL_APP_PASSWORD": "x"}, "brevo"),
    ({"RESEND_API_KEY": "k", "BREVO_API_KEY": "k"}, "resend"),
])
def test_provider_selection(clean_env, monkeypatch, env, expected):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    assert e.provider_name() == expected


def test_health_reports_provider_name(sheet_client, clean_env, monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "secret-key")
    body = sheet_client.get("/health").json()
    assert body["email"] == "brevo" and "secret-key" not in json.dumps(body)


# --- provider payloads (the autouse fixture patches _send, so restore it) ------

@pytest.fixture
def real_send(monkeypatch, clean_env):
    """Undo the no_email patch and capture what would go to urlopen."""
    monkeypatch.setattr(e, "_send", REAL_SEND)
    calls = []

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=None):
        calls.append({"url": req.full_url, "headers": {k.lower(): v for k, v in req.header_items()},
                      "body": json.loads(req.data), "timeout": timeout})
        return Resp()

    monkeypatch.setattr(e.urllib.request, "urlopen", fake_urlopen)
    return calls


def test_resend_payload(real_send, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_123")
    monkeypatch.setenv("EMAIL_FROM", "B4P <requests@example.org>")
    monkeypatch.setenv("HQ_EMAIL", "hq@example.org")
    assert e.send("a@example.org", "Hi\r\nBcc: x@y.z", "<p>Hi</p>", "Hi") is True
    call = real_send[0]
    assert call["url"] == "https://api.resend.com/emails" and call["timeout"] == 10
    assert call["headers"]["authorization"] == "Bearer re_123"
    assert call["body"] == {"from": "B4P <requests@example.org>", "to": ["a@example.org"],
                            "subject": "Hi Bcc: x@y.z", "html": "<p>Hi</p>", "text": "Hi",
                            "reply_to": "hq@example.org"}


def test_brevo_payload(real_send, monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-1")
    monkeypatch.setenv("EMAIL_FROM", "B4P <requests@example.org>")
    monkeypatch.setenv("EMAIL_REPLY_TO", "help@example.org")
    assert e.send("a@example.org", "Hi", "<p>Hi</p>", "Hi") is True
    call = real_send[0]
    assert call["url"] == "https://api.brevo.com/v3/smtp/email"
    assert call["headers"]["api-key"] == "xkeysib-1"
    assert call["body"] == {"sender": {"name": "B4P", "email": "requests@example.org"},
                            "to": [{"email": "a@example.org"}], "subject": "Hi",
                            "htmlContent": "<p>Hi</p>", "textContent": "Hi",
                            "replyTo": {"email": "help@example.org"}}


def test_send_returns_false_without_provider(real_send):
    assert e.send("a@example.org", "Hi", "<p>Hi</p>") is False
    assert real_send == []


def test_send_never_raises_and_does_not_log_secrets(real_send, monkeypatch, caplog):
    monkeypatch.setenv("RESEND_API_KEY", "re_supersecret")
    monkeypatch.setenv("EMAIL_FROM", "x@example.org")

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"message":"bad domain"}'))

    monkeypatch.setattr(e.urllib.request, "urlopen", boom)
    assert e.send("a@example.org", "Hi", "<p>Hi</p>") is False
    assert "403" in caplog.text and "bad domain" in caplog.text and "re_supersecret" not in caplog.text

    def timeout(req, timeout=None):
        raise TimeoutError("timed out")

    monkeypatch.setattr(e.urllib.request, "urlopen", timeout)
    assert e.send("a@example.org", "Hi", "<p>Hi</p>") is False
