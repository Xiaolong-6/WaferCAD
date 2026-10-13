# Process Report Export (P1)

The native v2 Workstation offers **Project → Export report (ZIP)**. This is a
portable, read-only research narrative alongside the existing **Export**
(`.wafercad`) engineering backup. The two exports have separate purposes.

## Contents

- `index.html`: standalone, responsive, offline overview, layers, Variants,
  linked Bookmarks and Variant HEADs, and a searchable Step index with Variant
  filtering. Only a small inline local filter script is used; no CDN, external
  scripts, external fonts, or online fetch.
- `history/steps-NNNN.html`: static HTML pages containing up to **50 History
  entries** each. Details expand to show operation descriptors.
- `history/steps-NNNN.json`: the corresponding complete Process operation
  descriptors, stable node and parent IDs, replay availability, entity references,
  exact parameters, and applied Mask context where present.
- `report.md`: editable report text and a complete step index.
- `manifest.json`: report schema, project dimensions, layer inventory, Branch
  and Bookmark metadata, current History cursor, resource index and any warnings.
- `recipe.json`: saved Recipe. Recipe steps and recorded History are intentionally
  distinct; a saved descriptor does not prove deterministic replay.
- `assets/current-*.png`: only successfully captured **visible canvases**.
- `styles/report.css`: standalone light/dark, responsive stylesheet.

Open `index.html` directly after unpacking the ZIP. Do not rely on browsers
allowing `file://` fetch requests: links between static pages and JSON assets
work without a local HTTP server. The Step finder operates on the embedded
index, without loading JSON through `file://`. Every Step link points to its
specific paginated HTML anchor.

## Large-history and image policy

The complete operation ledger is exported up to the current History cap (1,000
nodes), across all Variants. Pages are segmented in chunks of 50. P1 does **not**
render a picture for each historical step, generate inferred before/after
images, or serialize physical model geometry for every historical state.

The current visible Main/Mask/Section/3D canvases are captured where available.
Views hidden or not initialized at export time are **omitted with a warning**
in the manifest. All captured figures reflect the current inspection cursor;
they are not necessarily the Variant HEAD. For documentation of the final
structure, return to the HEAD before exporting. A PNG is a presentation
capture, not a vector scientific geometry artifact.

Captured PNGs are capped at 16 MiB each; the total uncompressed ZIP payload
limit is 128 MiB. Excess content fails explicitly and leaves the workspace
unchanged. ZIP uses uncompressed (STORE) entries to avoid runtime libraries.
Heavy page generation and packaging run inside the shared abortable Process
Task worker; the live inspector is inert during the transaction. Cancelling
produces no partial download.

The archive is for reading and reviewing. **Always export a separate
`.wafercad` file** if you need History restoration, true source geometry,
Array models, or editable fabrication structures.

## Planned P2/P3

- P2: dedicated history render snapshots without mutating the live workspace,
  adaptive Keyframes, visual-difference ranking, before/after pairs, vector
  Main/Mask/Section figures, user-controlled inclusion.
- P3: Full Evidence mode, per-step imagery when requested, content-addressed
  image deduplication, progress and package-size estimates, split archives,
  and large-model performance/hardware validation.

Historical images must never be reconstructed from the current model without
a verified saved historical state. Missing historical states and rendering
failures must be explicitly disclosed.

## Acceptance owners

- `node --test site/tests/process-report.test.mjs`: 1,000-step integrity,
  offline pagination, JSON fidelity, HTML escaping, resource policy, and ZIP
  directory/CRC checks.
- `node scripts/v2/check-report-export.mjs`: real integrated v2 download,
  Photodetector History/Variants, ZIP contents, interactive offline Step search
  and Variant filtering, and no model or History mutation.
- `npm run check`: repository formatting, lint, docs and Node tests.
- `ui-v2-stage-c-m4.yml`: CI integration browser gate.

Do not claim acceptance for runs that have not been executed. P1 deliberately
excludes historical image synthesis and full-array performance guarantees.
