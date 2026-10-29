# Process Report: bounded historical Section keyframes (P2)

P2 selects deterministic, capped keyframes and attempts a **genuine physical
Section SVG** from each selected restorable Process node in an isolated Worker.
Rendering never restores the live Workstation. Unrenderable nodes remain
reported failures rather than receiving synthesized figures.

A Process Report ZIP includes `keyframe-plan.json`, plus a summary of its
state in the offline HTML and Markdown. Every candidate is resolved against
the actual Process History ledger and can be selected only if its source
History node reports a restorable state. A plan is an output checklist, **not**
a claim that the corresponding image or scientific geometry exists.

## Presets

| Preset            | Candidate views  | Maximum planned images | Maximum keyframes |
| ----------------- | ---------------- | ---------------------: | ----------------: |
| Compact (default) | Section          |                     24 |                24 |
| Standard (planner API) | Main and Section |                     96 |                48 |

The Standard row documents the **planner API budget**, not an additional
published report mode: Main historical SVG generation is not shipped. The
user-facing Compact ZIP attempts up to 24 Section figures and never promises
an image for every selected node.

Each selected node consumes one slot per requested view. Deduplication is
per stable History node ID; a Process operation with Both faces is still one
History node. A node selected by multiple reasons consumes one keyframe, not
multiple slots.

Planner configuration validates requested view names and enforces a hard
integer image budget. It will never expand the budget automatically to
satisfy extra Bookmarks or Variants.

## Selection and evidence

1. Identify actual saved/restorable History states. Missing node states
   cannot be inferred from the current model or adjacent steps.
2. Reserve branch HEADs and History endpoints.
3. Reserve user Bookmarks; if this tier exceeds the budget, spread selected
   Bookmarks across the timeline instead of selecting only the earliest ones.
4. Reserve Variant roots and the first recorded node in each Variant.
5. Fill remaining slots from restorable, structurally relevant operations,
   using timeline spacing. Unknown operation kinds are eligible at lower
   priority; `Record` steps are excluded from automatic filler sampling.
6. Record every unavailable anchor, every anchor omitted by the budget, and
   every unknown/deleted History reference, with its stable node ID and reason.

Operation type provides a cheap sampling hint. It is **not** a measure of
actual structural or visual difference. The *current* saved-state reader and independent physical Section SVG
renderer described below establish bounded, validated state provenance.
Future **visual-difference ranking**, multi-view historical presentation,
and before/after comparisons would require additional reference-frame,
ROI and camera policies; selection priority alone is not image evidence.

The report records `plannedImages`, the actual `generatedImages`,
selected nodes and reasons, plus `unavailableAnchors`, `omittedAnchors`,
`unresolvedReferences` and `renderFailures`. Successfully rendered
keyframes carry a source revision, SVG resource path, physical X/Z scale and
layer IDs. Failed nodes remain visible in JSON and receive no image.

## Read-only historical-state reader

The Snapshot Manager now exposes `readProcessNodeState(nodeId)`. It returns a
deep-cloned, independently owned snapshot for an existing restorable Process
node, applying the operation's original Mask Context (Cell, selected Layers,
transform and ROI). It returns `null` if the node/state is unavailable. It does not restore a
checkpoint, move the History cursor, call the Workstation restore callback,
or mutate the current project. Tests verify that mutations of the returned
model and Recipe cannot alter stored checkpoints.

Read **one selected state at a time** to keep allocation bounded for large
Mask/Array projects. The API alone performs no rendering and deliberately
does not expose internal mutable model references.

## Independent physical Section SVG (integrated, bounded)

`renderHistoricalSectionSvg({ state, nodeId })` in
`site/report-section-svg.js` uses the canonical Kernel
`sectionSlices(model, section.a, section.b)` and emits standalone SVG plus
physical coordinate metadata. A single pixels-per-micrometre scale applies
to both X and Z, with no Z collapse, camera dependence or synthetic steps.
Layer IDs remain distinct for a Both-face operation, even if material names
match. Missing A–B lines, no visible solids, unknown Layers and resource
limits fail explicitly.

The dedicated `site/report-history-section-worker.js` loads Kernel geometry
inside an isolated classic Worker, one state per invocation, using the
same versioned polygon-clipping runtime as the process worker. The integrated
Chromium export test exercises a synthetic physical Section through this
worker and checks that the live project remains unchanged. Aborting a task
terminates the Worker; it cannot mutate any Workstation state.

The SVG renderer returns `provenanceVerified: false` on its own because
it cannot authenticate the caller-supplied state. The
`captureHistorySections` orchestrator uses `readProcessNodeState` for the
exact node, verifies process revision, A–B coordinates, physical scale,
layer IDs and SVG safety, then sets `provenanceVerified: true` on the
verified figure evidence. Only these verified figures can enter the ZIP.

## Resource and failure policy

The default Compact export selects at most 24 Section images. Each SVG may
occupy at most 2 MiB; all selected historical SVGs together may occupy at
most 24 MiB; the total report ZIP retains its 128 MiB maximum.
Snapshots are read sequentially, rendered by dedicated Worker and checked
against the recorded node ID. Rendering errors are listed by node in
`keyframe-plan.json`; no partial figure is included. Aborting the task
discards the entire pending archive, with no download.

The next scientific enhancements are state fingerprints, visual-difference
ranking, content-addressed deduplication, historical Main/Mask and full
before/after comparison. These require separate tests.

Avoid restoring old states into the live Workstation, because doing so could
overwrite the active Recipe, selection or unsaved edits. Offline rendering is
a separate component with its own lifecycle, bounded concurrency and Abort.

## Tests

- `node --test site/tests/report-keyframe-plan.test.mjs`: budgets,
  determinism, missing-state cases, 1,000 nodes, Both-face-sized records,
  oversubscribed Bookmarks, and view validation.
- `node --test site/tests/process-report.test.mjs`: ZIP resource reference
  and explicit distinction between planned and generated historical images.
- `node --test site/tests/report-history-captures.test.mjs`: verified
  provenance, bounded SVG payload, failure disclosure and atomic Abort.
- Real v2 ZIP export with real saved-node SVG evidence and an isolated
  historical SVG Worker via `scripts/v2/check-report-export.mjs`.
- Snapshot Manager isolation and cursor invariance in `site/tests/snapshots.test.mjs`.
- `node --test site/tests/report-section-svg.test.mjs`: real Kernel
  Section slices, true XY/Z aspect ratio, distinct Both-face Layer IDs,
  deterministic SVG, invalid-state handling and safe SVG attributes.

Current P1 engineering/project backup remains independent. Do not substitute
a report for a restorable `.wafercad` artifact.
