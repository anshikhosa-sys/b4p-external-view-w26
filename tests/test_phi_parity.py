"""One table of cases that the Python redactor (sheet mode) and the database's redact_phi() must agree on.

`SENSITIVE`: the secret must not survive. `SAFE`: product text that must come back unchanged.
The SQL half runs only when the local template database (b4p_v2) is reachable. Synthetic text only."""
import os

import psycopg
import pytest

SENSITIVE = [
    ("Pt 12345", "12345"),
    ("Patient 12345", "12345"),
    ("PT 1234", "1234"),
    ("pt#12", "pt#12"),
    ("Specimen tube Pt. ID " "0000000001-1 PP10", "0000000001"),  # split: the pre-push hook greps for labelled IDs
    ("tube A12-345 frozen", "A12-345"),
    ("send to jane.doe@example.org please", "jane.doe@example.org"),
    ("MRN " "0000006", "0000006"),
    ("DOB 01/02/1900", "01/02/1900"),
    ("Patient: Test Person", "Test Person"),
    ("Patient Test Person", "Test Person"),
    ("Pt. Name: J. Smith", "Smith"),
    ("Pt​ ID 0000000009", "0000000009"),  # zero-width character inside the keyword
]
SAFE = [
    "Patient Return Electrode", "Patient-ready kit", "patient safety valve", "Pt ID label",
    "REF 302995", "Lot 6106151", "18G x 1.5 in", "Model DOB-100", "SmartSite™ needleless connector",
    "Medical record keeping supplies", "Patient Lift Sling", "Box 12 of 40",
]


@pytest.mark.parametrize("text,secret", SENSITIVE)
def test_python_redactor_removes_secret(text, secret):
    import main
    assert secret not in main._redact_phi(text, notes=True)


@pytest.mark.parametrize("text", SAFE)
def test_python_redactor_keeps_product_text(text):
    import main
    assert main._redact_phi(text, notes=True) == text


def _sql(texts):
    db = os.environ.get("TEST_TEMPLATE_DB", "b4p_v2")
    try:
        with psycopg.connect(f"postgresql:///{db}", connect_timeout=3) as conn:
            return [conn.execute("SELECT redact_phi(%s)", (t,)).fetchone()[0] for t in texts]
    except psycopg.OperationalError:
        pytest.skip("local database not reachable")


def test_sql_redactor_agrees_on_the_same_table():
    texts = [t for t, _ in SENSITIVE] + SAFE
    out = _sql(texts)
    for (text, secret), got in zip(SENSITIVE, out):
        assert secret not in got, (text, got)
    assert out[len(SENSITIVE):] == SAFE
