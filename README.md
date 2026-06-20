# Facility Assessment Report Generator

**INFINITE — managed by Medelite**

A lightweight web app that turns a nursing-home **CCN** into a polished, branded
facility snapshot. It pulls live data from the public **CMS Provider Data
Catalog**, lets you layer in operational inputs that don't live in any public
database, and exports a print-ready **PDF** or an editable **Word** document.

> Test case: enter CCN **`686123`** (Kendall Lakes Healthcare and Rehab Center, FL).

---

## Feature checklist

### Required MVP
- [x] **Dynamic CCN lookup** — enter any valid 6-character CCN.
- [x] **Data engine** — queries the CMS Provider Data Catalog API for location, star ratings, and metadata.
- [x] **Facility name override** — defaults to the official CMS name; an optional field overrides it on the output only.
- [x] **Manual operational inputs** — EMR, Current Census, Type of Patient, Previous Coverage, Previous Performance, Medical Coverage.
- [x] **One polished PDF export** — single button, direct browser download, true vector / print-ready.
- [x] **Medicare source hyperlink** — clickable link in the PDF using the dynamic CCN.
- [x] **Deployment** — one-command deploy to Vercel (see below).

### Bonus features (all implemented)
- [x] **All 12 hospitalization / ED metrics** — STR (short-stay) + LT (long-stay) hospitalization and ED rates, each with state and national averages.
- [x] **Word (.docx) export** — editable document with the same layout and a working hyperlink.
- [x] **Charts + data cards** — benchmark-aware metric cards (facility vs national vs state, colored by who's ahead) plus Recharts comparison charts.
- [x] **Advanced error handling** — invalid-CCN validation, 404 for unknown facilities, graceful degradation when a CMS sub-dataset is unreachable (the report still renders with a clear warning).

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
# or a production build:
npm run build && npm run start
```

No API keys or `.env` values are required — the CMS Provider Data Catalog is fully public.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel            # follow the prompts; framework auto-detected as Next.js
vercel --prod     # promote to a live URL
```

Nothing else to configure. The CMS calls run inside the Next.js route handler,
so there are no client-side CORS issues and no secrets to set.

---

## Architecture

```
Browser ──► /api/facility/[ccn]  (Next.js route handler, server-side)
                 │
                 ├─ 4pq5-n9py  Provider Information  → name, address, beds, star ratings
                 ├─ ijh5-nb2v  Medicare Claims QMs   → facility hospitalization / ED rates
                 └─ xcdc-v8bm  State & US Averages    → state + national benchmarks
                 │
                 ▼
        normalized FacilityReport (JSON)
                 │
   ┌─────────────┼──────────────┐
   ▼             ▼              ▼
 live preview   PDF export    Word export
 (Recharts)   (@react-pdf)     (docx)
```

- `lib/cms.ts` — the data engine: dataset IDs, fetch + normalize, measure mapping.
- `app/api/facility/[ccn]/route.ts` — proxies CMS server-side, validates the CCN, returns clean JSON or a structured error.
- `lib/pdf.tsx` — `@react-pdf/renderer` document (true vector PDF, **clickable** Medicare link).
- `lib/docx.ts` — `docx` document (editable Word, same layout + hyperlink).
- `components/*` — branding banner, star ratings, metric cards, charts, live preview.

Calls run server-side, so the browser never touches `data.cms.gov` directly.

---

## Data mapping

| Report field | Source | CMS field / measure |
|---|---|---|
| Name of Facility | CMS + override | `provider_name` (overridable) |
| Location | CMS | `provider_address`, `citytown`, `state`, `zip_code` |
| Census Capacity | CMS | `number_of_certified_beds` |
| Current Census | Manual | prefilled from `average_number_of_residents_per_day`, editable |
| EMR / Type of Patient / Medelite history / Medical Coverage | Manual | — |
| Overall / Health Inspection / Staffing / Quality of Resident Care | CMS | `overall_rating`, `health_inspection_rating`, `staffing_rating`, `qm_rating` |
| STR Hospitalization | CMS claims | short-stay *"rehospitalized after a nursing home admission"* |
| STR ED Visit | CMS claims | short-stay *"outpatient emergency department visit"* |
| LT Hospitalization | CMS claims | *"hospitalizations per 1000 long-stay resident days"* |
| LT ED Visit | CMS claims | *"outpatient emergency department visits per 1000 long-stay resident days"* |
| STR/LT national & state averages | CMS State & US Averages | matching columns on the `NATION` row and the facility's state row |

Per the brief: **STR → Short-Stay**, **LT → Long-Stay**. The verbose government
measure names are programmatically renamed to Medelite's clean labels.

---

## Engineering assumptions

Documented here per the brief ("make a reasonable assumption and document it").

1. **CCN format** — accepted as 6 alphanumeric characters (CCNs are almost always
   numeric but the 3rd position can be a letter), normalized to upper-case.
2. **Facility metric value** — for the claims measures we display the
   risk-**adjusted** score when present, falling back to the observed score. This
   matches what Care Compare surfaces and keeps the facility comparable to the
   risk-standardized state/national averages.
3. **State & national averages** — the averages dataset has very long column names
   that the CMS API truncates and hashes unpredictably. Rather than hard-code
   fragile field names, the engine reads the response **schema** and resolves each
   column by matching its human-readable description (keyword + stay type). This
   survives upstream column renames and measure-code bumps.
4. **Current Census** — true current census is an operational figure, not public
   data, so it is a manual field, prefilled with the CMS average residents/day as
   a convenient starting point.
5. **Medicare link** — built as
   `https://www.medicare.gov/care-compare/details/nursing-home/{CCN}/view-all?state={STATE}`
   to match the sample target exactly.
6. **Graceful degradation** — if the claims or averages sub-dataset is
   unavailable, the report still renders (Provider Info is the only hard
   dependency) and surfaces a non-blocking warning rather than failing.

---

## Branding guardrail

`INFINITE` is the static platform brand. It is **never** replaced by the CMS name
or the manual override — the facility name appears only inside the report body
under *Name of Facility*. See the comment in `components/BrandingBanner.tsx`.

---

## Tech stack

Next.js 14 (App Router) · TypeScript · `@react-pdf/renderer` · `docx` · Recharts.
No database, no auth, no secrets.
