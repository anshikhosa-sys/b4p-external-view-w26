import os
import subprocess

# Never send real email from tests: empty values win over .env (load_dotenv does not override).
for _var in ("RESEND_API_KEY", "BREVO_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD",
             "EMAIL_FROM", "EMAIL_REPLY_TO", "HQ_EMAIL", "EMAIL_DAILY_LIMIT", "VERCEL", "VERCEL_ENV",
             "GOOGLE_CREDENTIALS_JSON"):
    os.environ[_var] = ""

import psycopg
import pytest
from fastapi.testclient import TestClient

# One database per pytest process, so concurrent runs can't drop each other's copy.
TEST_DB = os.environ.get("TEST_DATABASE_URL", f"postgresql:///b4p_test_external_{os.getpid()}")
# Local Blueprints_DB database the throwaway test DB is copied from.
TEMPLATE_DB = os.environ.get("TEST_TEMPLATE_DB", "b4p_v2")


@pytest.fixture(scope="session", autouse=True)
def test_database():
    """Create a fresh copy of the template DB for this run, drop it afterwards.

    Skipped when TEST_DATABASE_URL is set (you manage that DB yourself).
    """
    if "TEST_DATABASE_URL" in os.environ:
        yield
        return
    name = TEST_DB.rsplit("/", 1)[-1]
    subprocess.run(["dropdb", "--if-exists", name], capture_output=True)
    made = subprocess.run(["createdb", "-T", TEMPLATE_DB, name], capture_output=True)
    yield
    if made.returncode == 0:
        subprocess.run(["dropdb", "--if-exists", name], capture_output=True)


@pytest.fixture(autouse=True)
def no_email(monkeypatch):
    """Capture every outgoing email instead of sending it."""
    from app.services import email as email_svc

    import main
    main._inventory_cache.clear()  # the 60s sheet-inventory cache would leak between tests
    email_svc.reset_limits()  # the caps are in memory and would leak between tests
    sent = []  # (to, subject, html) per email

    def fake(to, subject, html, text=None):
        sent.append((to, subject, html))
        return True

    monkeypatch.setattr(email_svc, "_send", fake)
    return sent


HQ = {"X-HQ-Token": "test-hq-token"}


@pytest.fixture(autouse=True)
def hq_token_and_rate_limit(monkeypatch):
    import main
    monkeypatch.setenv("HQ_API_TOKEN", "test-hq-token")
    main._hits.clear()


@pytest.fixture(params=["sheet", "db"])
def client(request):
    """The same test body runs in sheet mode (sample inventory) and DB mode."""
    return request.getfixturevalue(request.param + "_client")


@pytest.fixture
def db_client(monkeypatch):
    try:
        psycopg.connect(TEST_DB, connect_timeout=3).close()
    except Exception:
        pytest.skip("test database not available")
    monkeypatch.setenv("DATABASE_URL", TEST_DB)
    import main
    return TestClient(main.app)


@pytest.fixture
def sheet_client(monkeypatch, tmp_path):
    """Sheet mode (DATABASE_URL unset) backed by a small sample inventory file."""
    import json
    import main

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("USE_SAMPLE_DATA", "1")
    sample = tmp_path / "sample.json"
    sample.write_text(json.dumps([
        {"Name": "Gauze", "Category": "Wound Care", "Quantity": "10", "Review": ""},
        {"Name": "Syringe", "Category": "Misc", "Quantity": "3", "Review": "Review needed"},
        {"Name": "Bandage", "Category": "Wound Care", "Quantity": "50", "Review": ""},
    ]))
    monkeypatch.setattr(main, "SAMPLE_PATH", sample)
    monkeypatch.setattr(main, "_sample_org_request_rows", [])
    return TestClient(main.app)
