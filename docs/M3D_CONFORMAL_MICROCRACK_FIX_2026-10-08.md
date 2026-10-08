# M3D Conformal microcracks — branch-local repair and acceptance

Date: 2026-10-08
Working branch: `fix/m3d-conformal-microcracks-20261008`
Baseline: `main` @ `82c35a845946835451fd7da9fcbe92be47593e7f`
Merge policy: **do not merge main** before the user explicitly requests it.

## Reproduced source defect

Inspected the lossless production example `site/examples/m3d-selfpowered-full-replay.wafercad`, unpacking its shared polygon templates and History models:

| Revision | Stage                                | Regions | Covered XY area (um^2) |
| -------- | ------------------------------------ | ------: | ---------------------: |
| 19       | WSe2 anneal, before local cap        |      42 |          1800.00000000 |
| 20       | Local 20 nm WSe2 Al2O3 Conformal cap |      62 |          1799.99999979 |
| 21       | MoS2 transfer                        |      65 |          1799.99999979 |
| 22       | MoS2 pattern                         |      63 |          1800.00000000 |
| 25       | 50 nm ILD2 Conformal                 |     184 |          1799.99999897 |

There are approximately 0.032 nm-wide uncovered XY gaps in revision 20 around x=4.995 and x=12.004 um, adjacent to regions `region-748`, `region-749`, and `region-750` in the stored S15 model. Original BOX substrate is Z=-1 to +1 um and present in every region; a missing XY column therefore appears as a spurious **full-depth 2 um material sidewall** in the 3D renderer. Turning Border OFF removes the black `THREE.LineSegments`, but does not remove the fake geometric sides, matching the user's observation.

The new 20 nm Al2O3 layer itself has Z extents >= 1.18 um, and no full-depth cap column. The local two-rectangle WSe2 cap mask is not the source of the missing BOX XY coverage.

## Fix

`site/model.js` adds a post-Conformal coverage-repair pass _after_ the persistence-grid canonical partition pass.

- Newly lost XY coverage is determined by subtracting the **pre-operation void domain** from post-operation uncovered geometry. This also identifies long, thin slivers missed by the previous bounding-box `numerical-crack` classifier.
- Pre-existing physical voids are subtracted from every candidate crack; an existing real trench is never filled.
- Newly lost coverage is verified against **every existing region** before assignment, rejecting false Boolean uncovered-domain slivers between valid owners. Real missing slivers are assigned using an XY contact halo; the repair carries that region's material stack.
- Partition ownership is rechecked without another snap-to-grid pass (which previously could reopen the crack).
- Repair is bounded by lost area, and unresolved coverage fails transactionally instead of accepting damaged geometry.
- Selective Etch of upper layers also preserves the intact BOX. A second coverage check runs after final polygon cleanup.

This protects the canonical model; **the renderer and source masks are not modified**.

## Acceptance gates

1. Unit: `node --test site/tests/conformal-process.test.mjs site/tests/m3d-reconstruction-regression.test.mjs`.
2. Real full-replay generator: `node scripts/m3d-kernel-full-replay.mjs --write-repo`, with mandatory full BOX coverage after **every** process stage.
3. Stage History: 36 operations, 27 bookmarks; source masks and layer stack retained, lossless export/import exact.
4. Production `.wafercad` example and Welcome preview regenerated from corrected Kernel; no manual geometry patch.
5. Browser: M3D Border ON/OFF × opacity 100%/70%, Section and History. The same production example must retain all **35 Recipe steps** and pass `Rebuild Base → Run All`.
6. Acceptance and generated files remain on the fix branch only.

Status: [source-branch S00–S26 replay and visual acceptance](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37802726827) passed. During final integration review, the M3D Run All test found a separate regression: regenerated project files had lost the 35-Step Recipe backfill. The integration workflow now backfills and validates Recipe metadata before committing generated production files. **Combined PR #151 Run All and baseline checks remain mandatory; source-branch green is not integrated acceptance.**
