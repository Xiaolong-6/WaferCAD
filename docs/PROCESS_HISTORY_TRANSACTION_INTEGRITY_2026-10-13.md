# Process, History and Variant transaction integrity — 2026-10-13

## Existing transaction contract

Recipe Run All is a **sequence of committed Process Steps**, not a single all-or-nothing Recipe transaction. Previously committed Steps survive Stop or a later failure. Each individual Process Apply is atomic: a failed, aborted, busy or no-change Step adds no History Step, and a successful Apply adds exactly one restorable Step. Run-to-Step always replays from Step 1.

History Insert and Edit are separate graph transactions. A downstream replay failure must restore the entire pre-edit state, including model, Layer/Region IDs, Mask context, branch graph, each Variant HEAD and writer-interaction ownership. Copy-on-write editing of a shared Step must never mutate dependent Variants.

## Confirmed problem and scoped fix

Previously `site/controllers/history-mutation-controller.js` restored a replay transaction only when `replayOperations()` returned `{ ok: false }`; a thrown error/rejected worker path bypassed restoration (though the interaction gate closed in `finally`). Both insertion and editing now invoke their existing transaction restoration hook on exceptions and report the exception as a failed replay. The regression drives a mutated model and two-Variant graph through a worker rejection, then checks full recovery and balanced interaction ownership.

## Follow-up acceptance matrix

<!-- prettier-ignore -->
| Scenario | Required result |
| --- | --- |
| Preflight invalid Step 2 | No mutation of Base or existing History |
| Stop after K successful Recipe Steps | K committed Steps retained, Step K+1 never partially applied |
| Process worker failure mid-Step | No partial Layer/Region, no new invalid History node |
| Edit a shared ancestor | Original and dependent Variant HEADs stable; new branch owns edits |
| Insert and replay downstream | Stable parent topology, monotonic valid Step IDs and replay remapping |
| Replay returns `ok: false` or rejects | Exact pre-edit project/Variant restoration |
| Persistence writer/checkpoint unavailable | Mutation denied or recoverable; no false saved state |
| Export/Import/Recovery after failure | Canonical geometry, refs, all branch heads, Recipe and History round-trip |

Use the existing `site/tests/history-mutation-controller.test.mjs`, `scripts/history-regression.mjs`, `scripts/process-recipe-safety-regression.mjs`, `scripts/project-io-runtime-regression.mjs` and `scripts/v2/check-sync.mjs`. Reuse their scientific fixtures and do not replace the snapshot engine with a parallel implementation.

## Verification boundary

The focused error path is a Node fault-injection regression; browser worker cancellation and persistence replay still require dedicated integration acceptance. This document does not claim entire Recipe atomicity, hardware acceleration or completed browser coverage. Do not relax existing scientific thresholds.
