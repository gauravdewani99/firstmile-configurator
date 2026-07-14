# First Mile Configurator — Engineering Handover

> Companion to the **First Mile Configurator** at
> [firstmile-myrebound.vercel.app](https://firstmile-myrebound.vercel.app).
> Use the live app as the source of truth for UX behaviour; this doc is the source of truth for
> *what the app captures, how it's modelled, and what gets stored*.

---

## 1. Overview

### What it is
A **single-page, framework-free** wizard (all code in [`index.html`](../index.html), ~5k lines) that
captures a client's **first-mile return configuration** and produces a canonical JSON payload per client.
It's a **POC/prototype** — the goal is to explore UX for how a Solutions/Onboarding user would configure
first-mile lanes, and to emit a clean JSON contract a real service could consume.

Unlike the HUB configurator, First Mile does **not** generate DMN rules or open PRs. It captures
configuration and outputs JSON; persistence is two thin serverless functions over GitHub (gist + issues).

### The variants
Several UI approaches were prototyped and all remain selectable from the landing page:

| Key | Name | Focus |
|-----|------|-------|
| `G` | **Tabular 2** ⭐ | Single-select service & label, **one row per country**, "+" to add extra per-country configs |
| `F` | **Manisha Tabular** ⭐ | Tabular + **Postal Product** column + **Custom Routing Rules** section |
| `E` | **Tabular 1** | Multi-select service & label → one row per country × combo |
| `D` | Client Preferences | Guided questionnaire that derives lanes (separate state + JSON builder) |
| `C` / `B` / `A` | Inline Grid / Carrier-First / Lane-by-Lane | Earlier explorations |

**Tabular 2 and Manisha Tabular are the current focus.** Tabular 1 and the earlier versions are kept
accessible but de-emphasised.

### Architecture (today)

```
┌────────────────────────┐        ┌──────────────────────────┐
│  Frontend (index.html) │──POST─▶│  /api/flows  (Vercel fn)  │──▶ private GitHub Gist (flows.json)
│  firstmile-myrebound   │◀─GET── │                           │
│      .vercel.app        │        └──────────────────────────┘
│                        │──POST─▶│  /api/feedback (Vercel fn)│──▶ GitHub issues (label: feedback)
└────────────────────────┘        └──────────────────────────┘
```

There is no application server and no database. The two serverless functions are **scaffolding** — a real
`first-mile-service` would own persistence, validation, and downstream emission of the lane config.

---

## 2. Variant & State Model

`state` (top-level) holds `{ client, variant, view, lanes }`. Each family of variants keeps its data in a
different object:

| Variants | State object | Init | JSON builder |
|----------|--------------|------|--------------|
| `E` / `F` / `G` (tabular) | `tabState` | `initTabular()` | `buildTabJson()` |
| `D` (preferences) | `prefState` | `initPrefs()` | `buildPrefJson()` |
| `A` / `B` / `C` | `state.lanes` | `initLanes()` | *(none — earlier POCs)* |

The tabular variants **share the same render + state code** (`renderVariantE`, `eCard*`, `tabState`),
branching on `state.variant`:
- `eSingle()` → `state.variant === 'G'` toggles single-select service/label and one-row-per-country.
- `state.variant === 'F'` adds the Postal Product column and the Custom Routing Rules section.

### End-to-end flow
1. **Landing** — two columns: *Create a new flow* (variant cards) on the left, *Saved flows* panel on
   the right (fetched from `/api/flows`). Clicking a variant → **Client Name** modal
   (`^[A-Za-z0-9_.\-]{2,}$`, no spaces) → wizard.
2. **Wizard** — left nav (Return Service → Label Option → First Mile Destination → Lane Review), with
   progressive lock. A **Preview JSON** button (top-right) opens the live JSON drawer. A **Save flow**
   button persists the current config.
3. **Save / reopen** — Save posts to `/api/flows` (keyed by `client|variant`, so re-saving overwrites).
   Saved flows appear in the landing's right panel; clicking one restores the exact state.

---

## 3. The Tabular Data Model (variants E / F / G)

`tabState` (see `initTabular()`):

```jsonc
{
  "returnServices": ["Drop-off", ...],   // Q1 — array (single element in G)
  "returnLabels":   ["Printed label"],   // Q2 — array (single element in G)
  "destination":    "DTW" | "DTR" | "DTP",
  "dtwType":        "local" | "ERC",     // DTW sub-choice
  "addresses":      [ /* client-facility addresses, see §5 */ ],
  "dtpPartner":     "…",                 // DTP partner selection
  "groupBy":        "country" | "region",
  "rows":           [ /* one per country × combo, see below */ ],
  "deleted":        { "<comboKey>": true },   // combos the user removed
  "carrierPhase":   "idle" | "refreshing" | "review",
  "routingRules":   [ /* variant F only */ ]
}
```

### Rows
Rows are **generated** by `tabBuildRows()`: for each country, one row per selected service × label combo
(Self-post is label-less → one row). A row:

```jsonc
{
  "id": "r12", "code": "DE", "service": "Drop-off", "label": "Printed label",
  "destType": null,          // null = inherit global destination; else per-row override (DTW/DTR/DTP)
  "dtwType": null, "partner": null, "addressId": null,
  "carrier": "DHL",          // output of the carrier lookup (see §4)
  "laneType": "managed" | "saas",
  "contract": "DHL-884420-EU",  // managed → dropdown of MANAGED_CONTRACTS[carrier]; saas → free text
  "postalProduct": null,     // variant F
  "custom": false            // true once service/label were overridden per-lane (survives rebuilds)
}
```

- **Combo key**: `code|service|label` (`eComboKey`). `deleted[key]` prevents a combo from regenerating.
- **Custom rows**: the "+" add-config (G) and the per-lane fix modal create `custom:true` rows that
  `tabBuildRows()` preserves even though they aren't in the global grid.

---

## 4. `carrier-service-selector` (the core concept)

The **Carrier is not a free input** — it's the output of a lookup keyed on `country × service × label`.
Modelled by `eCarriersFor(code, service, label)` filtering `CARRIER_CATALOG` via
`carrierServesCountry(carrier, country, service, label)` (service + label + region/country coverage).

Consequences baked into the UI:
- **Changing service/label re-runs the lookup.** `eRefreshCarriers()` simulates the backend round-trip:
  a "refreshing" state (spinner + carrier-column skeletons) → a **review** banner that highlights the
  Carrier column and asks the user to re-confirm.
- **Unserviceable geographies.** If the lookup returns nothing for a row's `(country, service, label)`,
  the row is **blurred** with a prompt to change service/label for that country (fix modal) or delete it.
  (Built-in example: Self-post is unserviceable in North America / Pacific in the mock catalog.)

`CARRIER_CATALOG` is mock data (real carrier names, per-carrier `services[]`, `labels[]`, `regions[]`, and
optional `countries[]`). A real service would replace `eCarriersFor` with a call to the actual selector.

---

## 5. Destinations & address→country mapping

Q3 "Where do you want to send the return parcel?" has three destination types:
- **DTW** — ReBound Warehouse (sub: `local` per-country warehouse, or `ERC`).
- **DTR** — Client facility / Warehouse (client-entered addresses).
- **DTP** — ReBound Partner (category → partner).

**Addresses (DTR).** Each address carries `countries: []` — the operational countries it applies to,
picked from a checklist in the add-address modal. `closestAddress(code)` resolves a country's address by:
1. explicit mapping (`countries` includes the code) → 2. same country code → 3. same region → 4. first
address. The destination cell shows a composite icon (ReBound/client warehouse) + the resolved city.

---

## 6. Canonical JSON output

### Tabular (`buildTabJson()`)

```jsonc
{
  "client": "nike_eu",
  "variant": "tabular-2" | "tabular-1" | "manisha-tabular",
  "selectionMode": "single-select" | "multi-select",
  "flowType": "B2C",
  "returnServices": ["Drop-off"],
  "returnLabels": ["Printed label"],
  "destination": { "type": "rebound_warehouse", "warehouse": "local" },
  "clientAddresses": [
    { "line1": "...", "city": "Utrecht", "country": "NL", "appliesToCountries": ["DE","FR"] }
  ],
  "lanes": [
    {
      "country": "DE", "countryName": "Germany",
      "returnService": "Drop-off", "returnLabel": "Printed label",
      "destination": { "type": "rebound_warehouse", "warehouse": "local", "location": "Nettetal" },
      "laneType": "managed", "carrier": "DHL", "contract": "DHL-884420-EU",
      "postalProduct": null,
      "serviceable": true
    }
  ],
  "summary": { "totalLanes": 40, "unserviceableLanes": 0 }
}
```

Variant **D** has its own richer builder, `buildPrefJson()` (pickup countries, destination, SaaS/Managed
carrier contract, per-lane derivation). Both feed the same **Preview JSON** drawer via `buildActiveJson()`.

---

## 7. Backend (two serverless functions)

### `api/flows.js` — saved flows
A tiny CRUD API over a **single private GitHub Gist** used as a JSON DB (`flows.json`). Auto-creates the
gist and finds it by description marker (`firstmile-configurator :: saved flows DB`). Auth: reuses
`FEEDBACK_GH_TOKEN` (needs `gist` scope).

| Method | Effect |
|--------|--------|
| `GET /api/flows` | `{ flows: [...] }` |
| `POST /api/flows` | Upsert by `client|variant`; body `{ name, client, variant, state }` |
| `DELETE /api/flows?id=<id>` | Remove one |

A flow record: `{ id, name, client, variant, state, savedAt }`. `state` is the raw variant state object
(`tabState` / `prefState` / `lanes`) captured by `captureFlowState()` and restored by `loadFlow()`.

### `api/feedback.js` — in-app feedback
The floating feedback widget POSTs `{ text, client, variant }` → the function files a **GitHub issue**
labelled `feedback` on the repo (using `FEEDBACK_GH_TOKEN`'s repo scope). "Open feedback" = open issues;
list with `gh issue list --repo gauravdewani99/firstmile-configurator --label feedback --state open`.

Both stores are POC-grade (rate/scale limited by the GitHub API). To productionise, swap for a real
datastore behind the same request/response shapes.

---

## 8. Deployment & hosting

- **Hosting:** Vercel project `firstmile-myrebound`. `index.html` served statically; `api/*.js` as Node
  serverless functions (auto-detected).
- **CI/CD:** GitHub `main` → Vercel Git integration auto-deploys. A GitHub Action mirrors `main` to the
  Bitbucket repo (`cycleon_team/fm-myrb-poc-screens`) on every push.
- **Manual deploy:** `vercel --prod --yes` (needs `vercel login` + `.vercel/project.json`).

### Migrating off Vercel/GitHub
Nothing is Vercel-specific except the `api/` function signature (`export default (req, res)`) and the
`.vercel/` link. To move:
1. Host `index.html` on any static host (S3+CloudFront, Nginx, etc.).
2. Re-implement the two endpoints (`/api/flows`, `/api/feedback`) on any backend, preserving the
   request/response shapes in §7. Point the frontend `fetch('/api/…')` calls at the new base if not
   same-origin.
3. Replace the gist / GitHub-issue stores with a real DB/queue.

---

## 9. Out of scope / known gaps

- **No auth** — anyone with the URL can configure, save, and delete flows. Add real auth before wider use.
- **No versioning / audit** — saving overwrites by `client|variant`; no history or change log.
- **Mock carrier data** — `CARRIER_CATALOG` and `MANAGED_CONTRACTS` are illustrative; wire `eCarriersFor`
  to the real carrier-service-selector.
- **POC persistence** — gist + GitHub issues are convenient, not durable/scalable stores.
- **Multiple variants** — this is exploratory; a production build would settle on one (likely Tabular 2
  or Manisha Tabular) and drop the rest.
- **No server-side validation** — the frontend validates; a real service must re-validate the JSON.
- **Routing Rules (variant F)** — captured in `tabState.routingRules`; not yet reflected in a shared JSON
  contract for downstream consumers.

---

## 10. Key code pointers (all in `index.html`)

| What | How to find |
|------|-------------|
| Country list / catalog | `const COUNTRIES`, `const CARRIER_CATALOG`, `MANAGED_CONTRACTS` |
| Top-level state | `let state = {`; tabular: `let tabState`, prefs: `let prefState` |
| Variant dispatch | `function renderWizard()` (branches on `state.variant`) |
| Tabular render | `function renderVariantE`, `eCard*`, `eCardTable`, `eRow` |
| Row generation | `function tabBuildRows`, `function eCombos`, `eComboKey` |
| Carrier lookup | `function eCarriersFor`, `carrierServesCountry`, `eRefreshCarriers` |
| Addresses | `function eAddressManager`, `openAddressModal`, `closestAddress` |
| JSON builders | `function buildTabJson`, `buildPrefJson`, `buildActiveJson` |
| Save/load | `function saveFlow`, `captureFlowState`, `loadFlow`, `loadSavedFlows` |
| Serverless | [`api/flows.js`](../api/flows.js), [`api/feedback.js`](../api/feedback.js) |
