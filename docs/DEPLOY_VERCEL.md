# Deploy on Vercel (frontend and backend together)

One Vercel project serves the React app and the API from this repo. Every `git push` deploys both,
and the API is same-origin (no CORS, no separate server).

## How it fits together

    browser  ->  https://<project>.vercel.app/            static React build (my-dashboard/build)
             ->  https://<project>.vercel.app/api/...     api/index.py  (FastAPI from main.py)

- `vercel.json` builds the frontend with `REACT_APP_API_URL=/api` and rewrites `/api/*` to the
  function in `api/index.py`.
- `api/index.py` mounts the app from `main.py` under `/api`. So the frontend's `/api/supplies` is
  served at `/api/api/supplies`, `/requests` at `/api/requests`, `/health` at `/api/health`.
- `main.py` still runs on its own (`uvicorn main:app`) for local development.

## Environment variables

Add these in Vercel -> Project -> Settings -> Environment Variables. Scope: P = Production,
Pv = Preview, both = P and Pv.

| Name | Scope | What it is |
|---|---|---|
| `GOOGLE_CREDENTIALS_JSON` | P (Pv optional) | The whole service-account key JSON as one value. Sheet mode only. Leave it out of Preview to get demo data. |
| `GOOGLE_SHEET_ID` | P (Pv optional) | Inventory spreadsheet ID. Sheet mode only. |
| `REQUESTS_SHEET_ID` | P, optional | Separate spreadsheet for requests. Defaults to `GOOGLE_SHEET_ID`. |
| `DATABASE_URL` | P (Pv optional) | Postgres connection string (Supabase session-pooler URL). If set, the database is used instead of the sheet. |
| `HQ_API_TOKEN` | both | Secret for HQ-only endpoints (`X-HQ-Token` header). Unset means those endpoints return 403. |
| `BREVO_API_KEY` or `RESEND_API_KEY` | P | Email provider. See [EMAIL.md](EMAIL.md). Leave out of Preview. |
| `EMAIL_FROM` | P | Verified sender, e.g. `Blueprints for Pangaea <requests@example.org>`. |
| `HQ_EMAIL` | P | Receives new-request alerts. |
| `EMAIL_REPLY_TO`, `EMAIL_ON_SUBMIT`, `EMAIL_DAILY_LIMIT` | P, optional | See [EMAIL.md](EMAIL.md). |

Vercel sets `VERCEL`, `VERCEL_ENV` (`production`, `preview`, `development`) by itself. Do not set
`USE_SAMPLE_DATA` or `TRUST_PROXY` in Vercel: proxy trust is already on there so the rate limit sees
the real client IP.

You need either `DATABASE_URL` or `GOOGLE_CREDENTIALS_JSON` + `GOOGLE_SHEET_ID` in Production.

## Safety behaviour

- **Preview with no secrets:** if neither `DATABASE_URL` nor `GOOGLE_CREDENTIALS_JSON` is set, the
  deploy runs on `sample_inventory.json` with email turned off, so previews work without secrets.
  Requests made on a preview are kept in memory only.
- **Production never uses demo data:** with no `DATABASE_URL` and no credentials, every endpoint
  (including `/api/health`) returns `503 Server is not configured`. `USE_SAMPLE_DATA` is ignored in
  production.
- **Email:** the function can be frozen as soon as the response is sent, so email is sent before
  responding, in parallel, waiting at most 5 seconds in total. A failing or slow provider never
  fails the request.

## Known limitations

- The rate limits and email caps are in memory, so they are per serverless instance and reset when
  an instance is recycled. Under heavy abuse the effective limits are higher than configured. A
  possible follow-up is keeping the counters in Postgres.
- The inventory cache (60 seconds) is per instance too. That only costs extra Sheets reads.
- Function limit: `maxDuration` is 15 seconds (set in `vercel.json`).

## Deploy and verify

1. Import the repo in Vercel (root directory = repo root; the build settings come from `vercel.json`).
2. Add the variables above and redeploy.
3. Open `https://<project>.vercel.app/api/health`. Expect
   `{"source": "...", "ok": true, "email": "brevo"}`. A `503` means the production variables are
   missing. `"email": null` means no email provider key is set.
4. Open the site, check the inventory loads, and submit a test request with your own address.
5. Check the function logs (Vercel -> Deployments -> Functions) for `Email via ... failed` lines.

The old Render service can stay up until you have checked this; the frontend no longer calls it
once `REACT_APP_API_URL=/api` is built in. The CSP in `vercel.json` still allows the Render origin
until you remove it.
