# B4P Request System — Fall 2026 redesign plan (Vish-F26)

## What the app is for

Partner clinics browse donated medical supplies, pick quantities, and send one
request to Blueprints HQ. HQ reviews it and updates the status. The page's
primary job: **find a supply fast and get it into a request with as little
friction as possible.** Audience: clinic staff on laptops and phones, often on
slow connections, often reading English as a second language.

## What's wrong today (audit of the live site, 2026-10-09)

Data (1,137 live rows from `/api/supplies`):

- The sheet has clean `Subcategory` (12 values, e.g. "Needles & Syringes"),
  `General`, `Date of Expiration` and `Image URL` columns. The UI ignores all
  of them and invents categories from keyword rules instead.
- The top-level filter is the warehouse `Category` code (`ST/N`, `TC/RC`,
  `DME`, `ER`…) which means nothing to a clinic.
- `Review` is `Yes`/`No` in the sheet, but the UI looks for "no review", so
  1,100 of 1,137 items show a meaningless "See warehouse notes" pill.
- 1,136 items have a public Google Drive photo; none are shown.
- "Low Stock" (≤5 left) applies to 783 of 1,137 rows (69%), so the badge
  carries no signal.

Interaction:

- You must "sign in" before you can add anything to the cart.
- Items are buried three levels deep (category → keyword type → collapsed
  `<details>`), inside a 900px-min-width table that scrolls sideways on phones.
- Four metric cards ("Inventory rows", "Low stock rows") speak warehouse, not clinic.
- The cart is a floating box that covers content; the cart is lost on reload.
- Confirmation is a dismissible banner; there is no "what happens next".
- Developer copy on screen ("Items stay grouped by the existing generic label logic").

Email: submission emails were removed in `261bbaa` (they blocked the request
and Render's free tier blocks outbound SMTP), so clinics get no confirmation
and HQ gets no alert.

## Design plan

**Concept: a supply catalog with a requisition slip.** The catalog is quiet,
photo-led and scannable; the one memorable element is the cart, styled as a
requisition slip — it is the thing the user is building, so it gets the
attention.

### Color (from blueprintsforpangaea.org, shared with the b4pQuantitative dashboard)

| token | hex | role |
|---|---|---|
| `--blue` | `#0337a3` | primary actions, links, selected filter |
| `--blue-hover` | `#4269ba` | hover, secondary blue (site palette) |
| `--navy` | `#0b2f5b` | header bar, slip heading |
| `--blue-tint` | `#eaf1ff` | selected chip background, slip header |
| `--ink` | `#212121` | text |
| `--ink-muted` | `#646464` | secondary text (AA on white) |
| `--line` | `#e2e2e2` | rules, card borders |
| `--surface` | `#ffffff` / `--sunken` `#f4f4f4` | page / photo wells |
| status | ok `#3f7239` (brand green), warn `#a15c00`, hold `#646464`, danger `#df3131` (brand red, text ≥ 18px or on white bold) / `#c62828` small text | text-coloured status, light tint backgrounds |

Greys are neutral, never blue-tinted. Blue is an accent, not a background.

### Type

- **Poppins 600** for headings only — the main site's family (verified from its HTML by ui-researcher; `#116dff` there is a Wix default, not brand).
- **Inter** for everything else, 400/500/600, `font-variant-numeric: tabular-nums`
  on quantities so stock numbers line up.
- Scale: 13 / 15 (body) / 18 / 24 / 32. Sentence case everywhere, no all-caps labels.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [B4P logo]  Request supplies   My requests            [Request (3)] │  sticky, 64px
├──────────────────────────────────────────────────────────────────────┤
│ Medical supplies available to partner clinics                        │
│ [ 🔍 Search 1,137 supplies — gloves, syringes, gauze…            ]   │  big search
│ (All) (Needles & Syringes 213) (IV Supplies 152) (Wound care 108)…   │  chips, scroll-x
│ 412 results · Sort: [Most in stock ▾]  [ ] Hide expiring soon        │
├───────────────────────────────────────────────┬──────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  REQUISITION SLIP     │
│ │ photo  │ │ photo  │ │ photo  │ │ photo  │  │  Riverside Clinic     │
│ │        │ │        │ │        │ │        │  │  ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│ │Telfa   │ │BD 3mL  │ │ ...    │ │        │  │  Telfa pad      [-2+] │
│ │Cardinal│ │syringe │ │        │ │        │  │  BD syringe    [-10+] │
│ │16 left │ │Exp 2027│ │        │ │        │  │  ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│ │[ Add ] │ │[-][3][+]│ │        │ │        │  │  [ Review request ]  │
│ └────────┘ └────────┘ └────────┘ └────────┘  │  sticky                │
│                 [ Show 48 more ]              │                       │
└───────────────────────────────────────────────┴──────────────────────┘
Mobile: single column cards (photo left, text right), slip becomes a bottom
bar "3 items · Review request" that opens a full-height sheet.
```

Left-aligned everything; one column of reading text ≤ 70ch.

### Research inputs (ui-researcher)

- Baymard: 86% of carts make quantity edits/removal hard → inline stepper that
  auto-updates, quantity 0 removes, visible Remove.
- Baymard: product-list design changes find-success by up to 400% → strong
  search, chips with counts, result count, clear-filters, in-stock toggle.
- Dense SKUs scan faster as rows; since we have photos, default to a photo grid
  with a **Grid / List toggle** (list = 56px thumbnail rows) remembered in localStorage.
- Fonts load: `Inter:wght@400;500;600&family=Poppins:wght@600&display=swap`.

### Key decisions

1. **Guest checkout.** Browse and add without signing in. Org name + email are
   asked once, at "Review request", and remembered in `localStorage`.
2. **Navigate by `Subcategory`** (human words) as chips with counts. Warehouse
   `Category` code is shown small on the card, not used as navigation.
3. **Show numbers, not vague badges.** Card shows "16 in stock". Only two
   badges exist: *On hold* (others have requested all of it) and
   *Expires soon* (< 90 days). "Low stock" only when ≤ 2 left.
4. **Quantity stepper on the card** (Add → becomes `[-] n [+]`), capped at stock.
5. **Cart persists** in `localStorage`; survives reloads.
6. **Confirmation screen** with the request ID, a copy button, and three
   "what happens next" steps; then the request appears in My requests.
7. **My requests** shows each request with a status track:
   Submitted → Under review → Approved → Shipped.
8. **Item detail sheet**: click a card for the larger photo, lot, box/pallet,
   expiry, notes.
9. **Performance**: 48 cards per page with "Show more", `loading="lazy"`
   300px Drive thumbnails, search debounced.
10. **Accessibility**: AA contrast, 44px touch targets, visible focus ring,
    `prefers-reduced-motion` respected, real `<button>`/`<label>` elements.

### Code structure

Split the 1,200-line `App.js` into `api.js`, `inventory.js` (pure data
helpers), `useCart.js`, `components/*`, and a single `styles.css` with tokens.
No new runtime dependencies.

## Email plan

- One module, one `send()` with three providers picked by env var:
  `RESEND_API_KEY` → Resend, `BREVO_API_KEY` → Brevo (HTTP, work on Render),
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` → SMTP (local dev). None set → log only.
- Sent with FastAPI `BackgroundTasks` so the request returns immediately even
  if the provider is slow or down.
- Restore confirmation-to-clinic and alert-to-HQ on submit; keep status-change mail.
- Templates live in one place; a CLI `python -m app.services.email test you@x.org`
  proves the configuration works.
- Documented in `docs/EMAIL.md`.
