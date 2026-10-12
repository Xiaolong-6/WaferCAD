# Renderer lifecycle correctness backport — 2026-10-12

## Scope and source

Main-only surgical extraction from the R9 stacked experiments
(PR #166 and PR #174). This change intentionally retains exactly one
production renderer, `site/three-view.js`. The source of the two common
helpers and their original unit tests is the verified V3 branch at
`4e7128042fb5ef86908e4ee7e3df7084ae7ce52f`; the target baseline
is `main@560c97190c707e8cd0e20177156bac063e4acbf6`.

The following fixes do not depend on V3 Electrical planar single-pass,
quality indexing or V4 adaptive tiling / indexed smooth walls / shared
caps. None of those candidates, URL opt-ins or profiling tools is
imported into main by this backport.

## Included fixes

1. **High-resolution 3D PNG capture:** the temporary renderer now has
   transaction-scoped creation, scene preparation, actual capture,
   disposal, interactive pixel-ratio restoration, original camera-aspect
   restoration and requested frame redraw. It restores state when
   preparing detailed rough meshes, configuring the renderer or encoding
   a PNG throws. Multiple cleanup failures are aggregated without
   suppressing the primary operation failure.
2. **3D scene resource retirement:** recursively collect scene-owned
   geometries, materials and bump textures, deduplicate aliases, retire
   copy-on-write flat templates where present, and continue disposing
   other resources if one disposal throws. Report a disposal error count
   without aborting the remaining scene reset. Repeat retirement must
   not dispose already-retired objects again.
3. **Targeted contracts:** carry the independent helper tests and
   update the existing Issue #11 3D PNG source contract to assert the
   transaction rather than a brittle inline try/finally layout.

## Safety boundaries

- No Process Geometry Kernel, model storage, Mask, ROI, History,
  serialization or scientific geometry edits.
- No new renderer engine, production WebGL antialias-policy change,
  screenshot tolerance or approved image-baseline update.
- No changes to existing V3/V4 experimental branches or their
  default-off feature flags; they remain Draft for separate scientific
  review.
- CI passing a Node/lint/browser suite would validate this *lifecycle*
  patch only; it would not prove strict RTX 3060 fresh-context
  raster repeatability. R9 RTX recordings showed that standard
  multisampled rendering itself has varying pixels in same-policy fresh
  contexts, whereas a zero-MSAA diagnostic was exact but produced
  visibly different edge rasterization.

## Verification

The branch is evaluated by the repository's standard Quality,
targeted Browser regression and relevant v2 3D check owners. Commit
and actual CI-run outcomes must be recorded on the pull request.
Do not claim physical RTX verification from software-only CI.

After review, the entire original V3/V4 PRs must **not** be bulk-merged
merely because these two correctness fixes have reached main.
