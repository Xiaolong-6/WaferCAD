# Complete project import loading follow-up

Branch: `codex/project-io-geometry-sharing`. Baseline: `8b6b7f9`. No CI, merge or deployment.

## Behavior and safety

The strict import worker continues to expand, migrate and validate the entire project before editor replacement. The project state controller privately copies the validated History states. Its next batch import reuses validation only for the same state objects whose complete values and keys exactly match those copies. Receipts are consumed once; prepared, modified, external, restored and later states use strict validation. The comparison distinguishes NaN/null, missing/undefined keys and invalid nested snapshots. This changes no canonical geometry, History state or exported example bytes.

Autosave and Recovery checkpoint packing use a separate short-lived worker with the same lossless `prepareProjectForWorkspaceStorage` validator/packer. Posting captures a structured clone before later edits. Errors terminate the worker and reject before opening a write transaction. Autosave rechecks the current writer lease after packing and before IndexedDB commit. Metadata derives from the captured packed candidate. Recovery packing completes before creating the IndexedDB transaction. The existing synchronous fallback is retained where Worker is unavailable.

## Measurement

Windows, Node 24.19.0, Playwright 1.55.1, installed Chrome 154.0.8037.98, Three 0.179.1 from the local pinned package. Headful browser, three fresh contexts per condition, same 1,816,020-byte complete native three-tier example, 40 Steps and five bookmarks. No profiler or simultaneous browser benchmark workloads in the reported runs.

| Median                               |   Before |    After |
| ------------------------------------ | -------: | -------: |
| Opened                               | 19.936 s | 12.245 s |
| Correct-revision 3D ready            | 32.814 s | 16.002 s |
| Worker parsing and strict validation |  7.174 s |  7.344 s |

The improvement is duplicate main-thread validation and save interference, not reduced physical detail or removed History. The first-ready metric does not mean autosave has completed. Worker validation remains the main remaining import cost. Browser/OS/hardware influence these measurements.

Raw runs and source hash: `tests/fixtures/project-io/import-loading-windows-chrome.json`. A diagnostic CPU profile found 8.5 seconds in duplicate History validation and 9.4 seconds in synchronous save validation/packing; profiler times are not benchmark results.

## Validation and reproduction

Executed:

- `node --test site/tests/project*.test.mjs site/tests/snapshots.test.mjs site/tests/workspace-storage-worker.test.mjs site/tests/controllers.test.mjs`: 107 passed.
- Focused ESLint and changed-file Prettier checks.
- `node scripts/persistence-regression.mjs`: installed Chrome passed, including migration, staged opens, autosave/reload, Recovery, safe reload, independent copied tabs and writer takeover.
- `node scripts/workspace-storage-worker-regression.mjs`: installed Chrome passed; 450 animation frames during strict packing, exact whole-project SHA-256 across worker packing/autosave/rejection/lease loss/Recovery, edit-during-save isolation and successful retry.
- `node scripts/project-import-benchmark.mjs site/examples/three-tier-silicon-jlfets.wafercad test-results/native-fig3/import-next.json 3`: installed Chrome, all complete imports passed with matching Step/bookmark counts and no page errors.

Serve `site/` at 4173 or set `WAFERCAD_URL`. Set `WAFERCAD_CHROMIUM` to installed Chrome and `WAFERCAD_THREE_DIR` to the checkout's `node_modules/three`. For the before condition, export `site/app.js`, `site/controllers/project-state-controller.js` and `site/workspace-persistence.js` from baseline `8b6b7f9` into an ignored directory preserving relative paths; set `WAFERCAD_BASELINE_IMPORT_DIR` to that directory. The benchmark routes only those modules by URL pathname, preserving the application's real import worker. Unset the override for the after condition.

`node scripts/workspace-storage-worker-regression.mjs` owns the full 40-Step worker-packing responsiveness, exact round-trip, edit-during-save isolation, strict rejection, lease loss, retry and Recovery checks.
