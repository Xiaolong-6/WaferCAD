# Curated WaferCAD PR assets

**Archive only, not a runnable application checkout.** The branch contains **18 small text files**: necessary standalone source/tests, narrow original diff excerpts and this provenance index. It does NOT contain the old application tree, generated projects, GDS/masks, screenshots, npm dependencies, workflows, or anything from rejected models as a deliverable. It must not be merged as a whole.

## Frozen provenance
PR [#226](https://github.com/Xiaolong-6/WaferCAD/pull/226) `d6c2b574a5c2a80f6207092a4eda88cd6c35277f`
PR [#228](https://github.com/Xiaolong-6/WaferCAD/pull/228) `91bc6540314d1d706a4dcc840d431b23215d3fd2`
PR [#229](https://github.com/Xiaolong-6/WaferCAD/pull/229) `69bdf8d0b7f73db31342ae5cb221931121984852`
PR [#340](https://github.com/Xiaolong-6/WaferCAD/pull/340) `ae26ad84bc337a1a68a8d3793e282dadfd38f5a7` (no files retained).

## User-approved decisions
| Item | Decision | Saved files | Scope |
|---|---|---|---|
| 2 | retain | `keep/02-pvd-step/pvd-step-focused.diff` | Opt-in experimental partial PVD coverage; integrate only with parameter validation and science tests. |
| 3 | retain | `keep/03-benes/swx-benes64-network.mjs`, `keep/03-benes/swx-benes64-network.test.mjs` | 64x64 Benes logical topology; neither foundry routing nor approved optical mask. |
| 5 | reference-only | `reference/05-metal-connectivity/m3d-ml-conductive-graph.py` | Independent metal component test for rejected M3D-LIME fixture; no integration. |
| 6 | reference-only | `reference/06-wire-bond/assembly-wire-geometry.js` | Assembly wire record geometry and validator; no assembly UI or GLB feature integration. |
| 7 | retain-after-science-reproduction | `keep/07-conformal/conformal-grid-overlap-focused.diff`, `keep/07-conformal/conformal-crack-repair.test.mjs` | Numerical Conformal corner fragments; never widen global tolerances or mask genuine overlaps. |
| 8 | retain | `keep/08-section/section-preserve-focused.diff`, `keep/08-section/base-section-rebuild.test.mjs` | Preserve authored physical A-B slice through Recipe Base reset if valid. |
| 9 | retain-after-transaction-validation | `keep/09-recovery/recovery-lease-focused.diff` | Owner-only lease refresh during Recovery checkpoint; requires normal-origin multi-tab checks. |
| 11 | retain-after-Chromium-reproduction | `keep/11-renderer/scene-variant-cache-focused.diff` | Invalidate stale scene-variant aliases after in-place material state mutation. |
| 12 | retain-tool-reference | `keep/12-layout-xor/swx-mems-klayout-verify.py` | KLayout XOR verifying actual native GDS/OAS output; generalize existing local verifier. |
| 13 | retain-algorithm | `keep/13-release/swx-mems-posthf-perimeter-audit.mjs`, `keep/13-release/swx-mems-posthf-perimeter-audit.test.mjs` | BOX support/release spans against real post-HF process geometry; not FEM. |
| 14 | reference-only | `reference/14-waveguide/filletPolyline.mjs` | Only generic circular fillet routine; excluded inaccurate SWX hairpin placement. |
| 15 | reference-only | `reference/15-sem-paper/swx-mems-sem-registration.mjs` | SEM topology failure audit; dependencies on rejected SWX design are not included. |

**Development candidates (8):** #2, #3, #7, #8, #9, #11, #12, #13.

**Reference-only (4):** #5, #6, #14, #15. Do not implement without a separate decision.

**Not retained:** #1 Si microchannel interposer; #4 SWX S8 Mask; #10 M3D-LIME reconstruction. Although reference #5 mentions M3D-LIME and references #12/#15 mention SWX, no rejected Example/Mask/Recipe is included.

## Migration rules
- `*.diff` files are selected hunks of historical diffs, not patches guaranteed to apply to current `main`. Study exact current source/AGENTS.md; transplant only relevant changes.
- Algorithm/test files preserve their original interfaces/import paths and may refer to absent old fixtures. They are **not runnable from this stripped archive**. Reattach tests to the correct current test owner during implementation.
- #7 requires strict material ownership, real vs numerical overlap discrimination, Z continuity, process/serialization scientific invariants.
- #9 requires real normal-origin multi-tab History/Recovery and IndexedDB transaction tests, including takeover/lease-loss during save.
- #11 requires reproducing and inspecting actual native Chromium scenes and state before integration.
- #2 is experimental-only; #3 network topology is not manufacturable mask; #12 script still uses SWX-specific file names/layers; #13 is material-support geometry only, not a mechanics prediction.
- Integrate #12 by upgrading existing LOCAL KLayout validation; do not create redundant CI workflows. For all items, run minimum necessary local tests first, then appropriate final scientific/quality/release checks if the feature is implemented.
- Preserve commit history; do not merge this archive branch into `main`. A tracking GitHub Issue owns separate integration decisions and eventual closure.

See `SOURCE_MANIFEST.json` for machine-readable source refs and selected file paths.
