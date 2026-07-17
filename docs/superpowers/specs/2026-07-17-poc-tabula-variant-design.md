# POC Tabula (Variant H) — FM Carrier Config Phase 1

## What

New wizard variant **"POC Tabula"** (key `H`), cloned from Tabular 2 (`G`), representing Phase 1 of the FM carrier configuration UI in Hummingbird/MyRB. Destination, Lane Type and Contract are later phases and are removed entirely.

## Flow

Landing card "POC Tabula" (badge: "Phase 1") → client-name modal → wizard with 3 left-nav steps, same progressive lock as Tabular 2:

1. **Return Service** — single-select, Tabular 2 vocabulary/options unchanged.
2. **Return Label** — single-select, unchanged.
3. **Lane Review** — table, one row per pickup country.

## Lane Review table

Columns: Country · Return Service · Return Label · **Carriers (ranked)** · serviceable state.

- The existing `eCarriersFor(country, service, label)` lookup returns **all** matching carriers, rendered as ranked chips **P1, P2, P3…** in the row.
- Up/down arrows reorder; **×** removes a carrier from the row.
- Changing service/label re-runs the lookup (existing spinner + review banner behavior).
- Unserviceable countries keep the existing blur + fix/delete treatment.
- Tabular 2's "+" extra-config row per country stays; each extra row has its own ranked carrier list.

## JSON

Trimmed Tabular 2 shape via a variant-H branch in the tab JSON builder, wired into `buildActiveJson()`:

- Drop: `destination`, `clientAddresses`, `lanes[].laneType`, `lanes[].contract`.
- Replace `lanes[].carrier` with `carriers: [{name, priority}]` (priority = 1-based rank).

## Implementation notes

Standard add-a-variant recipe in `index.html`: landing card, key `H` in `variantLabels` and `VARIANT_NAMES`, branches in `renderWizard()` / `tabBuildRows()` / tabular renderer reusing `tabState` (H ≈ G minus destination/laneType/contract columns and steps, plus ranked multi-carrier). Add `H` to `api/feedback.js` `VARIANT_NAMES` (stale map). No changes to variants A–G.

## Out of scope

Backend enum vocabulary (handoverType etc.), postal product, CSC candidate-list UX, destination/lane-type/contract phases, drag-and-drop reordering (arrows suffice), any backend/API changes.
