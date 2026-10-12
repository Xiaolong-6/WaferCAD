# TiO2 full-array loading performance

Branch: `feat/tio2-metalens-full-array-example-20261009`. Benchmark baseline: local `46dab94`; tested product: local `e7281d1`. Published product: `e35a8c8df268d9a58446fcd1875968a64fc0e2a8`.

Publication follow-up, 2026-10-10: the user explicitly authorized publishing this branch. Refreshed `origin/main` remained `d73a201`; the working tree was clean, and 91 focused state/import/History/CI-routing tests passed again. CLI push failed because GitHub write credentials were unavailable, so the connected GitHub API published the three local commits as one commit with an identical complete file tree. Every uploaded blob matched its local Git SHA, and the remote tree matched `4722e8863ecedb2388b465ab7fc6b7a23be29a9c`. A fetch and exact local/remote file comparison verified publication. No PR, merge, deployment or manual remote CI was performed.

## Change and correctness

The full-array Welcome example retains the exact 10,563,872-byte source, SHA-256 `71538e0b5376a7458f62b8c61eb9bdd869f481de8470b8c4158d45bbe39da88d`: 4,725 device sites, 6,400 total tiles, 60,232 matching Mask polygons, nine Recipe steps, ten restorable History nodes and six bookmarks. Neither its geometry nor storage format changes.

`site/state-equality.js` replaces repeated History/import value traversal with exact comparison of shared object pairs within one synchronous batch. Numeric XY pairs are compared directly without allocating traversal pairs or memo entries per coordinate. Own keys, missing/undefined entries, signed zero and non-finite values remain distinct. Multiple right-hand partners are tracked separately. A failed traversal discards its unfinished memo; no memo survives between calls. Unversioned live changes remain detectable.

The project controller retains private structured-clone receipts after strict whole-file worker validation. Receipts remain single-use, and changed/external/later states fall back to the strict validator. The snapshot manager uses the same comparison for process state and bookmark lists. Geometry workers, cloning/isolation, Recovery guards, rendering detail and physical model budgets are unchanged. The CI planner routes comparison-module changes to History and persistence owners.

## Controlled measurements

Linux, Node 24.19.0, Playwright 1.55.1, Chromium 140.0.7339.186, local pinned Three 0.179.1, headless software WebGL, 1400×900 viewport. Three fresh-context before/after pairs, alternating conditions, same Welcome title click and complete source. No CPU profile or concurrent test workloads during measurement.

| Three-run median          |  Before |   After | Reduction |
| ------------------------- | ------: | ------: | --------: |
| Opened status             | 7.813 s | 5.106 s |     34.6% |
| Correct-revision 3D ready | 8.502 s | 5.975 s |     29.7% |
| Strict import worker      | 1.391 s | 1.217 s |     12.5% |

Raw runs: [metalens-loading-linux-chromium.json](../tests/fixtures/project-io/metalens-loading-linux-chromium.json). Worker code is unchanged; its timing difference reflects run variation, not a worker optimization. These are local loading measurements, not universal latency or full-wafer FPS guarantees. `renderState=ready` is a renderer readiness signal; screenshot acceptance remains a separate check. Earlier 45–97 second measurements under heavy concurrent test load are not comparable to this controlled baseline.

## Validation

- Node owning suites: **189 passed, zero failures** in 24.7 seconds. Coverage includes project import/schema/IO, snapshot/History isolation, controllers, storage worker, metalens, Welcome and CI routing. Added cases cover shared-geometry mutations, unversioned historical edits, coordinate extra/inherited keys, failed batch proofs and exponentially shared/cyclic structures.
- `node scripts/tio2-metalens-ui-regression.mjs`: real four-unit Recipe Run All completed 9/9; actual Welcome opened the complete array; exported model, Mask, Recipe, bookmarks and every History restore state exactly matched the source. Section/3D rendered, zero page errors.
- `node scripts/history-regression.mjs` and `node scripts/persistence-regression.mjs`: passed, including normal History navigation and browser storage/Recovery behavior.
- Focused ESLint, changed-file Prettier, `npm run docs:check` and `git diff --check`.

No new approved visual baselines were generated. Full-array Recipe Run All and physical wafer-scale FPS remain outside this loading optimization's acceptance, as in the [reconstruction handoff](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md).

## Reproduce

Install locked dependencies with `npm ci`. Serve `site/` on port 4173 and set `WAFERCAD_THREE_DIR` to the checkout's `node_modules/three`; optionally set `WAFERCAD_URL` for another local port. Run:

```bash
node scripts/tio2-metalens-loading-benchmark.mjs test-results/metalens/loading-after.json 3
```

For the baseline, export only the two compared modules into an ignored directory while preserving their relative paths. They are byte-identical in local `46dab94` and public `d73a201`; the latter remains available in the published history:

```bash
mkdir -p test-results/metalens/perf-baseline/controllers
git show d73a201:site/workspace-snapshots.js > test-results/metalens/perf-baseline/workspace-snapshots.js
git show d73a201:site/controllers/project-state-controller.js > test-results/metalens/perf-baseline/controllers/project-state-controller.js
WAFERCAD_BASELINE_SNAPSHOTS_DIR="$PWD/test-results/metalens/perf-baseline" node scripts/tio2-metalens-loading-benchmark.mjs test-results/metalens/loading-before.json 3
```

Unset that override for the after condition. For paired runs, invoke each condition with repeat `1` three times, alternating before/after, and combine the medians. The baseline override routes only those modules; the strict import worker, complete source and other application modules are identical. Keep export and other test workloads outside the loading interval.

Node acceptance command:

```bash
node --test site/tests/state-equality.test.mjs site/tests/project*.test.mjs site/tests/snapshots.test.mjs site/tests/process-history-project.test.mjs site/tests/controllers.test.mjs site/tests/workspace-storage-worker.test.mjs site/tests/tio2-metalens-reconstruction.test.mjs site/tests/welcome-example.test.mjs site/tests/ci-test-plan.test.mjs
```
