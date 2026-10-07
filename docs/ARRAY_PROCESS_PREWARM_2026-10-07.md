# 625-site array and idle process preparation — checkpoint

Repository: Xiaolong-6/WaferCAD. Branch: `codex/process-project-io-optimization`.
Baseline before this checkpoint: `77a6c9dfc438d91e1672f46b5a56c9411d235766`.
This document travels with the implementation commit; use `git log -1 -- docs/ARRAY_PROCESS_PREWARM_2026-10-07.md` to identify its exact revision.

## Current scope and status

This is an in-progress feature checkpoint, not a main/deployment acceptance.
The user authorized frequent feature-branch pushes because the current Windows computer is temporary. Do not depend on browser autosave or ignored test artifacts when continuing elsewhere.

Canonical translation arrays now preserve template geometry and exclusive tile domains through Process, History, project IO, Main, Section and 3D. The ordinary 3,000,000-point resolved-model limit remains in force. Array templates are strictly validated, and tile domains must cover the wafer without overlap. Array candidates commit only after worker validation.

The new `shared-assets-v4` format stores shared template models and instance lists. Ordinary v2/v3 files retain their existing encoding and reader behavior. Older application versions reject the new array kernel instead of silently displaying an empty root model.

`site/examples/three-tier-silicon-jlfets-full-wafer.wafercad` contains 625 device sites, 1,885 total physical tiles, 194 final templates, all 40 recorded Steps and five bookmarks. Size: 2,677,016 bytes. `node scripts/build-wafer-array-example.mjs --write` rebuilds it from the retained single-site source and strictly validates the full project and exact file round-trip. This is an assembly of the verified single-site recipe; it is not evidence that all 40 steps were recomputed by the full-wafer kernel. Outside the device field, the assembly retains the substrate and receiver oxide selected from the source corner. The Welcome catalog has NOT yet been switched to this full-wafer file.

Mask import prepares exact translation templates and a spatial instance index. Selections and transforms reuse derived indexes; original layout data remains authoritative. Conformal uses real joined neighborhoods, not horizontal proxies. Copy-on-write site edits and neighborhood identity prevent sharing across different physical contexts.

The latest addition retains a successfully validated Process worker for at most 120 seconds. After success it starts optional boundary-index preparation after 250 ms, yielding between regions and cancelling on the next foreground request. Abort/rejection/error discard the worker. Geometry indexes are bounded by 250,000 shared points and 128 entries, use exact content keys, detect in-place edits and are never serialized into projects. No speculative operation changes geometry, IDs, History or Variants. Project/mask switches discard the idle worker. This prepares geometry lookup, not an assumed future physical result or arbitrary future offset thickness.

Indexed overlap candidates now discard only polygons/holes that cannot meet the other input, with two 0.1 nm grid cells of conservative padding. Genuine overlaps still reject. Indexed Conformal boundary chains retain the original clipped band. The current native bottleneck is partition canonicalization, rather than repeat-mask discovery alone.

## Evidence actually obtained

Environment: Windows, Node 24.19.0, Playwright 1.55.1, installed Chrome 154.0.8037.98, pinned Chromium 140.0.7339.186, Three 0.179.1. This checkout uses bundled Node directly because npm is unavailable here; normal environments can use the package scripts.

- Array construction: strict complete-project validation, exact export/open comparison, 625 devices, 40 Steps, five bookmarks and unchanged single-site source bytes passed.
- New array tests cover bounded resolution, malformed references, nested/overlapping/outside/missing domains, v4 round-trip, copy-on-write and failure rollback, Conformal seam equivalence, global Transfer plane, rough profile coordinate frames and real exterior wall ownership.
- New mask-index tests cover 625 identical templates, exact translation, sub-grid/path/transform/inversion/ROI behavior, filtered spatial selection and layout replacement.
- New boundary-index tests cover exact-clone reuse, in-place invalidation, hole/disconnected/near-grid overlap equivalence, clipped Conformal bands and cancellable idle work without model mutation.
- Process task tests cover retained-worker reuse and abort eviction as well as original startup/DataClone/grouped transaction cases.
- The complete Node gate previously passed 405 tests BEFORE the latest mask/boundary/idle-worker additions. Final complete gates for this checkpoint remain required.
- Real Chrome array UI already passed Open → Directional 10 nm → L9 masked native Conformal 10 nm → export → Open → continued selective Etch, retaining the full recorded model/History and all 625 native sidewall sites. This run preceded the final boundary-index/idle-worker changes. It produced 3,666,491 bytes after Conformal and 3,713,936 bytes after continued Etch, with 43 Steps and no page errors. Conformal used nine kernel working sets, 625 changed sites; the indexed-mask run alone did not improve total time (158.75 seconds UI, 124.45 seconds worker).
- A direct Node profile with the subsequent indexed partition lookup reduced nine-workset Conformal from 104.03 seconds (97.83 in callbacks) to 65.75 seconds (58.86 in callbacks). These are single-run local diagnostics, not stable browser medians or a final performance claim.

## Required continuation and acceptance

1. Run complete lint/format/Node gates and all owning browser regressions after the latest changes. Add a permanent, reproducible 625-site browser test rather than relying on ignored `test-results/native-array/runtime.mjs`.
2. Re-run the real 625-site Apply/export/Open/continued-operation test with the idle worker and final index implementation; record worker/UI timings separately. Verify rejection preserves History/Variant and the next successful Apply still works.
3. Verify full-array Main SVG and physical GLB. GLB now uses Three instancing and `EXT_mesh_gpu_instancing`; prove translated positions, physical metres and all instances in the exported artifact. Verify rough/annotation instances, Fast/Quality, transparency and ROI.
4. Recheck full-wafer screenshots after the background fill and uniform-base batching changes. Current full-array rendering keeps shared cap/sidewall meshes and removes artificial tile interfaces. It still has potentially expensive full-wafer border expansion and per-context renderer costs after new coatings.
5. Exercise array back-face, rough, implant/electrical, planarize, isotropic/undercut and altered-neighbor cases against equivalent small ordinary models. Do not weaken strict validation or physical comparisons.
6. Only after these gates, switch the native Welcome catalog path to the full-wafer project while preserving the existing single-device preview source and cover composition. Adapt the example structure/preview contracts explicitly.
7. Update benchmark scalars and this handoff at every validated checkpoint and push normally to the feature branch. Do not push main, deploy, change approved visual baselines or dispatch costly manual CI without fresh authorization.

## Reproduction from a fresh machine

Read `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/testing.md` and this file. Check the exact branch, revision, working tree and upstream before changes.

```sh
npm ci
npx playwright install chromium
node scripts/build-wafer-array-example.mjs
npm run check
# Serve site/ at http://127.0.0.1:4173; set WAFERCAD_THREE_DIR=node_modules/three.
npm run test:ui:all
node scripts/process-transaction-ui-regression.mjs
```

The site is static and requires no build. Original UNC checkout contains unrelated work: do not overwrite it from this feature checkout. No changes from this checkpoint are deployed or merged into main.

## Validated runtime follow-up after b78d5ae

`node scripts/array-runtime-regression.mjs` is now a permanent acceptance entry point (`npm run test:ui:array`, included after IO in `test:ui:process`). It passed on installed Chrome 154 with 625 native sidewall sites / 11,875 sidewall segments; complete model and recorded History round-trip; 43 Steps after continued selective Etch; original metal, contact and HfO2-wall probes unchanged at all 625 sites; continued horizontal film removal at all sites; no page errors. The full-wafer Main SVG has all 1,885 tile uses. Physical GLB is 4,910,188 bytes, includes all 625 translated T3 gate positions and the micrometre-to-metre root matrix via `EXT_mesh_gpu_instancing`.

The scalar report is committed at `tests/fixtures/project-io/array-625-windows-chrome.json`. One local run measured initial Open/3D ready 17.068 s (import worker 3.808 s), masked Conformal UI 91.347 s / worker 61.448 s, modified Open/3D ready 45.607 s (import worker 3.661 s), Conformal project export 18.364 s and continued Etch UI 18.600 s. Compare the preceding indexed-mask-only run: Conformal UI 158.753 s / worker 124.455 s. These are single acceptance runs, not medians; browser-owner regressions were also running. Modified-model renderer and autosave/export costs still warrant further work.

The first final complete Node attempt was 416/417: one source-text ROI assertion expected an immediate return expression. The implementation now attaches a non-enumerable array query after the same ROI intersection, so the test was updated to require both the exact intersection assignment and return of that result. Additional scientific Node checks passed for back-face Conformal, planarize, isotropic/undercut, host-depth annotations and changed-neighbor contexts. A complete rerun is required after these final changes.

History fault injection previously counted Worker constructors. Retaining a validated Process worker changes that implementation detail; the test now fails the fourth Process dispatch, still after two downstream replay Steps, with the same rollback assertions. Re-run History and the real transactional rejection test before final acceptance.

## Welcome promotion in this follow-up

The native transistor card now opens `three-tier-silicon-jlfets-full-wafer.wafercad`. Its preview and thumbnail continue to use the unchanged single-device source through explicit `previewSourcePath`; all existing preview geometry/display and thumbnail hashes remain required. The native structure helper checks every recorded array Step's shared device template and requires exactly 625 device references. This follows the successful actual full-wafer SVG/GLB and Apply/IO acceptance above. Re-run Welcome/example owners and deterministic preview rebuilding before final acceptance.
