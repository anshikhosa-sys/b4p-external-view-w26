# B4P External View

React dashboard (`my-dashboard/`, Vercel) + FastAPI backend (`main.py`, Render).

## Data source

By default the backend reads inventory from the Google Sheet and stores external
org requests in the Requests tab of the sheet.

Set the `DATABASE_URL` environment variable (a Postgres connection string; on
Render use the Supabase session-pooler URL) to switch to the Postgres database
instead. Unset it to go back to the sheet. Nothing else changes.

With `DATABASE_URL` set:

- `GET /api/supplies` and `GET /inventory/availability` read the `dash_supplies` view.
- `POST /requests`, `PATCH /requests/{id}/status` and `GET /requests[?email=]` use
  `create_request()`, `set_request_status()` and the `dash_requests` view.
- Internal clinic requests (`/api/requests`) are not affected and still use the sheet.
- `GET /health` returns `{"source": "postgres"|"sheet", "ok": true|false}`.

All database access lives in `app/db.py` (views and functions are defined by the
database's dashboard contract; do not query other tables from here).

To import an old `org_requests.json` into the database (safe to re-run):

    DATABASE_URL=... python scripts/migrate_org_requests_to_db.py org_requests.json [--dry-run]

## Tests

    pip install -r requirements.txt pytest
    createdb -T b4p_v2 b4p_test_external   # throwaway copy of the database
    pytest                                  # DB tests skip if the test DB is missing

Tests never send email.
