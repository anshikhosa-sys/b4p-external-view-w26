# Vish-F26: what changed and how it was verified

Branch `Vish-F26` (from `postgres-data-source`, which already contains `origin/main`).
Verified 2026-10-09 on a local stack (sample mode with a snapshot of the live
inventory; no Google Sheet writes, no email sent). Details: `docs/QA_REPORT.md`,
`docs/SECURITY_FINDINGS.md`, `docs/EMAIL.md`, `docs/REDESIGN_PLAN.md`.

## What changed

**Frontend: a modern McMaster-Carr-style catalog** (`my-dashboard/`)
- Category tree, product-type tiles with line drawings (82 original SVGs, no photos), and
  dense spec tables. Lots of the same product are merged into one row; requests are filled
  earliest-expiry-first and sent one line per sheet row, tagged `[Lot X, Box Y, Pallet Z]`
  so HQ knows which box to pull.
- Guest browsing; org name and email asked only at review. Request drawer, review,
  confirmation, My requests with a status track.
- Fast: no web fonts, no image requests, inventory cached on the device and shown
  instantly on return visits.
- 54 rows with no name, type or notes are hidden (a footnote says so).

**Backend** (`main.py`, `app/`)
- Email works on Render: Resend or Brevo over HTTPS, sent in the background, with
  abuse caps. See `docs/EMAIL.md` and `python -m app.services.email check`.
- Security fixes EXP-01..13 (formula injection, rate-limit bypass, spam relay,
  lookup enumeration, guessable IDs, error leaks, CSP, prototype-key crash, …).
- Patient identifiers found on specimen-tube rows are masked in every API response
  and email ("Pt. ID [removed]").
- gzip, `Cache-Control`, ETag/304; `Image URL` no longer returned.

## Results (final run)

| Check | Result |
|---|---|
| Backend tests (`.venv/bin/python -m pytest -q`) | 298 passed |
| Frontend tests (`CI=true npx react-scripts test --watchAll=false`) | 367 passed, 2 skipped (live-data only) |
| Production build (`CI=true npm run build`) | clean, zero warnings, no source maps |
| Size budget (`npm run budget`) | JS 72.3/75 KB, CSS 12.4/15 KB, icons 5.5/12 KB, 0 fonts |
| First table row, return visit | ~70 ms (desktop), ~170 ms (phone, 4× CPU) |
| First table row, first visit | ~170 ms on a warm API; ~3 s if Render is cold-starting |
| Layout shift | 0.000 |
| Image / font / third-party requests | 0 / 0 / 0 |
| Browser matrix (Chrome, desktop + 360 px) | all pass, no console errors |
| Security re-test (bug-hunter) | 12 fixed, 1 accepted risk, 0 open — safe to push |

## Before merging / deploying

1. Render env: `RESEND_API_KEY` **or** `BREVO_API_KEY`, `EMAIL_FROM`, `HQ_EMAIL`
   (optional: `EMAIL_DAILY_LIMIT`, `EMAIL_ON_SUBMIT`, `HQ_API_TOKEN`). `TRUST_PROXY` is
   automatic on Render.
2. Run `python -m app.services.email test you@example.org` on Render once.
3. After deploy: open the Vercel URL and check the browser console shows no CSP
   errors; check Render logs once that rate-limit keys are real client IPs.
4. The CSP in `vercel.json` hard-codes the Render API origin; change both together.

## Known gaps (accepted)

- The server does not check requested quantity against stock or item names against
  inventory (HQ reviews every request).
- Requests for rows with no sheet Name don't count toward holds (needs storing
  `sheet_row`; possible follow-up).
- JS has ~3 KB of budget headroom.
- Data for HQ: 79 rows are used specimen tubes whose labels include patient IDs (masked
  in the app, but the photos and sheet still contain them); 54 rows have no name.
