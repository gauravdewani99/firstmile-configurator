# First Mile Configurator

A prototype/POC wizard that captures a client's **first-mile return configuration** — return service,
return label, first-mile destination, carrier, lane type and contract for each pickup country — and
emits a canonical JSON payload describing every lane.

It is a **single-page vanilla HTML/JS/CSS app** (no framework, no build step). All frontend code lives
in one file: [`index.html`](index.html). Two tiny **Vercel serverless functions** provide a shared
backend for saving flows and collecting feedback — there is no database or server framework.

The app hosts several UI *variants* explored during the POC. The two current focal points are
**Tabular 2** and **Manisha Tabular**; **Tabular 1** and the earlier versions remain accessible.

## Live URL

| Service  | URL                                        | Hosted on |
|----------|--------------------------------------------|-----------|
| App      | https://firstmile-myrebound.vercel.app     | Vercel — project `firstmile-myrebound` |

## Repos

The same code lives in two places (GitHub is primary / auto-deploys; Bitbucket is the company mirror):

| Remote     | URL                                                          | Role |
|------------|--------------------------------------------------------------|------|
| `origin`   | https://github.com/gauravdewani99/firstmile-configurator     | Primary — pushes here auto-deploy to Vercel |
| `bitbucket`| https://bitbucket.org/cycleon_team/fm-myrb-poc-screens       | Mirror for the Cycleon org / engineering handover |

A GitHub Action mirrors every push to `main` on GitHub over to Bitbucket, so both stay in sync
regardless of who pushes (see [`.github/workflows/mirror-to-bitbucket.yml`](.github/workflows/mirror-to-bitbucket.yml)).

## Repo layout

```
firstmile-configurator/
├─ index.html                 ← ⭐ ALL frontend code (data, state, every variant, JSON builders)
├─ rebound-icon.png           ← Favicon / brand mark
├─ api/                       ← Vercel serverless functions (Node)
│   ├─ flows.js               ← Save/load "flows" — GET/POST/DELETE over a private GitHub Gist datastore
│   └─ feedback.js            ← In-app feedback widget → files a labelled GitHub issue
├─ .claude/launch.json        ← Local dev server config (npx serve on :3456)
├─ .github/workflows/         ← GitHub Action: mirror main → Bitbucket
├─ docs/handover.md           ← Engineering handover doc
└─ .gitignore                 ← excludes .vercel/, node_modules/, .DS_Store
```

## Variants

All variants share the same design system and the same `startVariant(v)` → client-name modal → wizard flow.
They are selected from the landing page. `state.variant` holds the active one.

| Key | Name | What it is |
|-----|------|-----------|
| `G` | **Tabular 2** | Single-select return service & label → **one row per country**; a "+" adds extra configs per country. *(Current hero.)* |
| `F` | **Manisha Tabular** | Tabular with a **Postal Product** column and a **Custom Routing Rules** section. |
| `E` | **Tabular 1** | Multi-select return service & label → one row per country × service×label combo; fine-tune each lane. |
| `D` | Client Preferences (v4) | Guided preference questionnaire that derives every lane. Has its own JSON builder. |
| `C` | Inline Grid (v3) | All lanes in one table with inline dropdowns. |
| `B` | Carrier-First Bulk (v2) | Pick a carrier first, then assign lanes to it. |
| `A` | Lane-by-Lane Stepper (v1) | Configure each country one at a time. |

Variants **E / F / G** ("tabular") share one code path in `renderVariantE()` and one state object
(`tabState`), branching on `state.variant`. Variant **D** uses `prefState`; variants **A / B / C** use
`state.lanes`.

## Local development

No build step. Any static file server works. From the repo root:

```sh
npx serve -l 3456 .
# then open http://localhost:3456
```

> The `/api/*` serverless functions **do not run** under a plain static server — locally, "Save flow"
> and the feedback widget fall back to graceful empty/offline states. To exercise the backend, use the
> deployed site (or `vercel dev`).

## Deployment

Wired to the Vercel project `firstmile-myrebound`. Two ways deploys happen:

1. **Auto (preferred):** push to `main` on GitHub → Vercel's Git integration builds & deploys.
2. **Manual CLI:** from the repo root, `vercel --prod --yes` (needs `vercel login` + the gitignored
   `.vercel/project.json` linking this dir to the project).

The `api/` folder is auto-detected by Vercel as serverless functions (Node runtime) — no config needed.

### Backend env var

Both functions reuse one Vercel **Production** env var:

| Variable            | What it does |
|---------------------|--------------|
| `FEEDBACK_GH_TOKEN` | A GitHub token with **`gist`** + **`repo`** scope. `flows.js` uses the gist scope for the saved-flows datastore; `feedback.js` uses the repo scope to open issues. |

### Data stores (no database)

| Feature | Store | Where |
|---------|-------|-------|
| Saved flows | A single **private GitHub Gist** (`flows.json`), auto-created and found by description marker | `api/flows.js` |
| Feedback | **GitHub issues** labelled `feedback` on the GitHub repo | `api/feedback.js` |

Both are deliberately lightweight (POC). See [`docs/handover.md`](docs/handover.md) for schemas and how
to migrate to a real backend.

## Known caveats

- **Prototype, not production.** No auth, no versioning/audit, single-file frontend. The "backend" is two
  serverless shims over GitHub (gist + issues), chosen for zero infra.
- **Local `/api` doesn't run** under `npx serve` — test the backend against the deployed site.
- **Two active authors** push to `main`. Always `git pull` before starting work; the GitHub→Bitbucket
  mirror keeps the company copy current automatically.
- **Vercel CLI token** expires periodically — re-run `vercel login` before manual deploys.

## More context

See [`docs/handover.md`](docs/handover.md) for the full engineering handover: the variant/state model,
the `carrier-service-selector` concept, JSON schemas, backend endpoints, deployment, and out-of-scope
callouts.
