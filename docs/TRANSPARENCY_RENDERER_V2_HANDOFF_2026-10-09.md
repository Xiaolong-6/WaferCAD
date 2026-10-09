# Transparency Renderer v2 — measured progress and exact-index trial (2026-10-09)

**Status: branch-only, not merge-ready.** PR #164:
https://github.com/Xiaolong-6/WaferCAD/pull/164.
Starting base: `main` `fbbb2f9f3a585574e20ed706c34653164f13440c`.
The branch must be reviewed against the newer `main` before integration.

## Baseline and completed first candidate

The canonical full-wafer array contains 625 sites and 1,885 render instances.
Historical software-WebGL reference (PR #155): Quality cold **35.50 s**,
Quality warm **34.67 s**, Fast far-field **12.24 s**, and Quality
approximately **59.96 M submitted triangles**.

The first candidate (`0fce42cf05d1b171cd5f1472b3fa1371adf09eae`)
requested Three.js transparent `DoubleSide.forceSinglePass` **only on smooth
single-Z material caps in a transparent scene**. Rough surfaces, sidewalls,
Implant and Electrical Region volumes and ROI cuts keep the original two-pass
policy. The physical material geometry, canonical topology and export remain
unchanged.

CI on that exact candidate reported:

| Scenario | Historical reference | Candidate | Context |
| --- | ---: | ---: | --- |
| Quality transparency, cold complete frame | 35.50 s | 31.13 s | Approx. 12% lower wall time |
| Quality transparency, warm complete frame | 34.67 s | 30.21 s | Approx. 13% lower wall time |
| Fast far-field transparent complete frame | 12.24 s | 11.91 s | Approx. 3% lower wall time |
| Quality scene submitted triangles | ~59.96 M | 57.04 M | Fewer back/front cap submissions |
| Fast far-field submitted triangles | 18.35 M | 16.91 M | Fewer cap submissions |

The reference and candidate come from separate CI runs, not controlled
paired trials; they demonstrate improvement *suggestively*, not a hardware-
independent speedup guarantee. The 15 s Quality / 6 s Fast goals are
**not met**. Elapsed stage timers wait for a completed WebGL frame and browser
compositor, not just `renderState=ready`.

Evidence:
- Quality PASS: https://github.com/Xiaolong-6/WaferCAD/actions/runs/37902406319
- Real Chromium targeted PASS and exact edge-on 625-site PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605619
- Full 625-site array renderer and 20-toggle resource/state stress PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605619
- Native Fig3 replay PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605618
- All Example Recipe Run All jobs PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605651

## Second candidate — lossless repeated-vertex indexing

The follow-up in the same PR adds
`site/renderer-exact-index.js` and `site/tests/renderer-exact-index.test.mjs`.
On sufficiently repeated **transparent instanced** material-interface and
Electrical Region templates, it indexes only vertices with **bit-identical
Float32 position, normal and optional annotationDepth attributes**. Both
triangle order and the original per-triangle attributes survive expansion.
No tolerance, polygon merge, approximate coordinate snap, physical topology
change, material sort change or GLB-export path is used. Ineligible templates
(e.g. rough GPU displacement, unfamiliar attributes, groups, geometry over
65535 vertices, insufficient reuse) remain non-indexed. Opaque scenes keep
their previous geometry representation.

The viewport now exposes `sceneExactIndexedArrayObjects` and
`sceneExactIndexedLogicalVerticesSaved`; these are **estimated repeated
vertex attributes avoided, not measured shader invocations or GPU frame
milliseconds**. The 625-site acceptance asserts these are populated for
transparent Quality, absent for opaque, and stable after a cached variant swap.
The pipeline benchmark exposes both counters. Existing triangle counts must
stay unchanged after indexing.

At second-candidate head `1d31da5a45ef9a433e2ecc5e449cfe00a83a9c75`:
- Quality (lint, docs and Node tests) PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37908562444
- Targeted Chromium Browser PASS:
  https://github.com/Xiaolong-6/WaferCAD/actions/runs/37908562442
- Full 625-site and edge-on acceptance **not yet rerun on this new head**
  while Draft; do not transfer the earlier candidate's performance timings
  to the indexed candidate.

## Remaining release gates

1. Once code/doc review is complete, mark PR ready for review to run existing
   dedicated 625-site array, edge-on and example/replay CI, without manually
   dispatching costly workflows. Read the **new head's** log timings.
2. Preserve exact near/edge-on/ROI surfaces, buried-material and Implant/
   Electrical visibility, smooth/rough interfaces, conformal profiles,
   transparency blending, borders, and source screenshot parity. Reviewer
   visual acceptance still requires actual side-by-side captures; a green
   structural CI alone is not proof of visual equivalence.
3. Check cold/warm complete-frame elapsed time, actual submitted triangles,
   draw calls, geometry and material counts, 20 opacity swaps, and camera
   response. An indexed template may improve vertex throughput while leaving
   triangle count unchanged; measure both separately.
4. Reconcile the upstream `main` commits before merge. The 58 commits after
   the base were checked at the previous comparison and had no overlap in
   the renderer files; check again near integration because other agents are
   active. Never force-push.
5. Keep 15 s Quality and 6 s Fast as stretch performance targets; **never
   weaken scientific geometry, visibility or input-responsiveness gates**.
   Revert the indexed candidate if it degrades total completion time or
   rendering correctness.

No local Node/Chromium workspace was accessible. Validation above is from
the exact cited GitHub-hosted CI runs. No visual baseline was replaced.
**No merge or deployment has been performed.**
