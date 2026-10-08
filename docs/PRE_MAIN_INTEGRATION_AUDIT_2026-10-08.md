# Pre-main integration audit — 2026-10-08

**Status: not approved for `main` until the combined integration HEAD completes its gates.**

## Branch closure and traceability

The isolated integration branch `integration/process-recipe-pre-main-20261008` contains the histories of all four non-`main` source branches:

1. `feat/process-recipe-v1` — Kernel-backed Recipe UI, Base/History semantics, safety fixes and original examples.
2. `fix/example-kernel-recipe-replay-audit` — Recipe Base capture, legacy backfill, Mask export and browser replay acceptance harness.
3. `test/m3d-full-replay-20261008` — M3D kernel history, paper-inferred masks, lossless project and Welcome catalog entry.
4. `docs/recipe-tutorial-welcome-examples-20261008` — English/Chinese Recipe tutorials and product manual catalog.

Merges #143 and #144 were conventional two-parent PR merges. The Wiki conflict was resolved in a two-parent merge commit that retained the docs branch history and created a **six-entry** catalog. These merges did **not** modify `main`.

## User-requested UI/product fixes

| Finding | Remediation | Acceptance |
| --- | --- | --- |
| M3D absent from feature Welcome | Integrated its sixth catalog entry and editable `.wafercad` project; retained its interactive mini-preview/Source DOI links | Browser open, 3D state, per-step restoration, export/reimport |
| M3D thumbnail referred to nonexistent WebP | The follow-up M3D branch now includes a real renderer-produced WebP; updated the Welcome card and six-entry checksum manifest while retaining prior five thumbnail contracts | Welcome image decode and browser project preview |
| History rows much smaller than Recipe | Main History title **10 px**, subtitle **8.5 px**; enlarged variant titles, bookmark labels and row height | Visual check at narrow/wide workstation sizes; History typography regression |
| Wiki examples described only detector | Synced all **six** Welcome families and scientific/modeling boundaries, with a dynamic catalog contract test | `node --test site/tests/wiki-manual.test.mjs`, `npm run docs:check` |

## M3D Recipe migration

The imported M3D production project had **36 History nodes** (one Base + 35 operations) and **27 bookmarks**, but **no `processRecipe`**. Twenty-nine masked steps retained actual Draw Mask context in their replay records. On this integration branch:

- Backfilled **35 typed Recipe Steps** (26 Deposit, 8 Etch, 1 Record) directly from the historical kernel replay metadata.
- Preserved independent captured masks on all **29** masked/inverted steps; no empty captured Draw masks.
- Captured the original rectangular Base (`60 × 30 × 2 µm`, SOI BOX receiver) in each appropriate branch/History/bookmark Recipe state.
- Updated both production and one-state preview project; kept **36 History nodes**, **27 bookmarks**, existing materials and stored geometry intact.
- Added the production project to Recipe backfill/check coverage.
- Kept `storage.lossless: true`: the original M3D geometry cannot be safely quantized to the 0.1 nm compact storage grid.
- **This is historical recipe metadata reconstruction, not a successful fresh kernel Run All.** Only a successful browser `Rebuild Base first → Run All` and geometry/export equivalence can establish that requirement.

## Pre-main acceptance matrix

| Gate | Current evidence | Status |
| --- | --- | --- |
| Source branch histories combined without rewriting `main` | PR merges and two-parent Wiki merge | Integrated |
| M3D Welcome project, source and genuine fallback asset exist | Catalog and assets inspected; missing WebP was corrected to labeled SVG | Real image source integrated; browser visual check pending |
| Recipe parser, all six example metadata, captured Masks | Structural inspection and added unit regression | Full integrated CI pending |
| M3D clean Run All | Kernel history rebuilt originally; new Recipe backfilled from replay | **Blocking, unverified** |
| Every other family/Variant clean Run All and mask export | Repair-branch test harness committed | **Blocking, unverified on integration HEAD** |
| Native Fig3 625-site full kernel replay | Existing dedicated pipeline; do not substitute single-site or assembled file | Blocking until same-head acceptance |
| M3D lossless export/import and scientific final geometry | Dedicated source-branch fixtures; new Recipe requires retest | Blocking until same-head acceptance |
| 3D material ownership, opaque/transparency and stop/cancel behavior | Existing renderer/Recipe gates, R7 private OAS path still unverified | Correctness and hangs blocking; private OAS limitation explicit |
| History/Recipe list readability | CSS and Node style contract updated | Visual breakpoint check pending |
| Wiki publication | Sources under `docs/wiki/` with main-push sync workflow | Publish **after** main merge, not before |

## Required checks on the exact integration SHA

From the repository root with dependencies and Chromium:

~~~sh
npm ci
npm run check:ci
npm run docs:check
node --test site/tests/wiki-manual.test.mjs site/tests/history-typography.test.mjs
node scripts/maintenance/backfill-example-recipes.mjs
node scripts/maintenance/rebuild-photodetectors.mjs
node scripts/maintenance/sync-example-recipe-previews.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
# Separate terminal with pinned Chromium/Three:
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/example-recipe-runall-acceptance.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/example-recipe-runall-acceptance.mjs --id=m3d-selfpowered-heterogeneous-ic
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/example-recipe-runall-acceptance.mjs --id=photodetector-literature --variant=ge-fig15-a
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/example-recipe-runall-acceptance.mjs --id=suspended-silica-microdisk --history=keep
~~~

Run the dedicated M3D and Native Fig3 browser/geometry pipelines and inspect their artifacts too. Do not downgrade failed structural/material assertions or treat successful schema parsing as equivalent to kernel replay. Review visual snapshots for the History UI and example cards.

**Main merge decision:** hold until the complete integration SHA is green or user explicitly accepts a documented, scoped exception. The long-standing renderer cold-frame *performance* threshold is diagnostic/nonblocking; actual hangs, wrong geometry/visibility, lost masks/history and failed Run All remain blockers.

## M3D follow-up resynchronization

The 19 follow-up commits on `test/m3d-full-replay-20261008` add fixes for History read-only Recovery checkpoint classification, 3D internal Border ownership, transparent edge ordering, and an explicit 3D Border ON/OFF indicator. The source branch handoff explicitly defers its final browser/visual verification to the desktop Agent; merging code is not equivalent to that acceptance. The project-level conflict is resolved by retaining its newer persisted History title metadata and the previously recovered 35-step Recipe with 29 captured masked operations. The six-item Welcome thumbnail manifest now refers to a committed 3D WebP, rather than the temporary SVG fallback.
