# Development

## Active application

The active product is entirely under `site/`.

Historical implementations remain available through Git history rather than the active working tree. Do not reintroduce retired backend/client APIs merely for compatibility.

## Local run

```bash
python -m http.server 8000 --directory site
```

Open `http://localhost:8000`.

## Development checks

Install the development-only tooling:

```bash
npm ci
```

Run the full check:

```bash
npm run check
```

Available commands:

- `npm run lint` — ESLint over the active JavaScript only; vendored code is excluded.
- `npm run format` — Prettier rewrite for the active application and current documentation.
- `npm run format:check` — local formatting verification for the active application and current docs; the fast CI gate intentionally omits Prettier.
- `npm test` — vector/GDS/project-schema smoke tests plus focused regression tests for XY units, GDS error handling, project files, snapshots, surface morphology, Implant clipping, palette behavior, and material boundaries.

The project-IO/schema path is intentionally separated from `app.js`: project files are fully validated before editor state is replaced, and the quantized storage representation is expanded and validated again before export. Interactive project/layout parsing, .wafercad packing/serialization, Mask GDS/OAS serialization, and process-result geometry validation run in workers so large file transforms do not monopolize the UI thread. Process candidates must be validated before Variant/model/History commit; rejected geometry leaves the live workspace unchanged. Polygon booleans and strict model validation share one lazy robust kernel with a single 0.1 nm canonical retry, matching the persistence precision contract rather than introducing a looser fallback. Keep worker handoff transactional: Abort/error/rejection must not replace live state or leave the shared task controller busy.

Export and Recovery now use `shared-assets-v2`: a geometry dictionary shares exact boundary/region/annotation polygons across otherwise distinct History models. The reader retains unencoded and `shared-assets-v1` compatibility; older application versions cannot read v2 exports. Geometry containment/intersection results are reused only within one synchronous validation call, while dimensions, stack/layer ownership, point budgets and annotation metadata remain checked per model. History import uses a synchronous batch validator with the original per-state filtering as fallback; restored states are cloned before editing.

UI orchestration that does not own canonical geometry lives under `site/controllers/`. Process input/state and worker request assembly belong to `process-panel-controller.js`; History edit/insert strategy, branching gates, and replay transactions belong to `history-mutation-controller.js`; browser autosave/Recovery/cross-tab lease/safe-reload behavior belongs to `workspace-persistence-controller.js`; synchronized view/base summaries belong to `workspace-view-controller.js`; Project toolbar and History-tree presentation belong to `project-controller.js`; Mask/Main/Section canvas drawing lives in `site/plan-renderers.js`. Derived process/ROI selection geometry lives in `site/selection-geometry.js`. Keep build/update checks, welcome startup routing, tab navigation, maximize behavior, rendering details, process-form validation/request assembly, History transaction state, persistence workflows, and similar responsibilities out of the main editor module when they can be expressed through narrow callbacks.

## Deployment

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages when `main` changes. Full Quality/browser regression belongs to pull-request CI; superseded PR runs are cancelled. Pages performs only a lightweight release sanity check plus asset stamping/deployment, avoiding a second full browser regression after an already-validated merge. KLayout compatibility is path-scoped to layout parser/export changes and remains manually runnable for broader corpus checks.

There is no application build step.

## Current design contracts

1. XY geometry remains vector.
2. GDS XY is converted to canonical µm from the file's `UNITS` record.
3. The global XYZ display/input unit converts presentation values only; it must never rescale stored geometry.
4. X, Y and Z are stored as physical micrometre coordinates; view-only Z exaggeration must never feed back into process geometry.
5. View zoom/pan must never modify geometry or trigger full-project autosave packing; view/inspection state uses the lightweight workspace-view persistence domain.
6. Mask alignment transform is explicit and defaults to identity. It is working state until a process/export consumes it, so browser autosave persists alignment through the lightweight view record rather than rewriting a large project on every input change.
7. Cells define hierarchy scope; Layers is global.
8. Zero-width linework is not an operable mask.
9. The 3D ROI is render-only. Its perimeter defines 3D inspection cut faces and remains independent from the Section A–B line; neither view may silently move the other.
10. All four views derive from the same region-stack model.
11. Layers are referenced by stable internal ID, not by user-visible name.
12. Structure and Implant colors come from curated or generated harmonious 20-color palettes; arbitrary color-picker input is intentionally hidden from Process.
13. Etch has no growth mode.
14. Rough/Pyramid morphology is deterministic appearance metadata; Section and 3D must consume the same profile field and canonical material geometry remains ideal. Section materials, conformal films and following annotations must stay registered in Detail insets; concentration depth follows the local source surface. Widening a subpixel sidewall for visibility must preserve its rough floor.
15. Implant is a non-material annotation volume. Rendering must clip it against current material geometry; later Etch removes the corresponding surviving volume rather than regenerating it from the new surface. Section and 3D must consume the shared Implant depth-gradient contract; opaque 3D may expose only the ROI-cut face of a buried Implant, never the full buried volume.
16. Main/Mask morphology cues must remain subtle overlays that do not replace the underlying material/mask color language.
17. Base rebuilds remain reversible.
18. Every successful Process Apply must append exactly one restorable **Step** node. Failed, aborted, busy, and no-change operations must append none.
19. Snapshot-branch format v3 requires a valid non-nested workspace state on every new Step. v1/v2 remain readable as legacy formats but must not gain invented intermediate states.
20. Variant topology is Step-first: `parentBranchId` + `rootNodeId` define ancestry. New Variant creation must not require or synthesize a snapshot/bookmark record.
21. Bookmarks are annotations on Steps. Adding, renaming, or deleting a modern bookmark must not add/remove a Step or change Variant ancestry.
22. Variant HEAD is independent per Variant. Restoring a Step or Undo may move the cursor behind HEAD but must never rewrite HEAD; the next successful Apply must fork first.
23. Process position and exact workspace HEAD are distinct. A same-revision historical state must not overwrite HEAD display/ROI/project edits.
24. Any Step presented as restorable must remain restorable after autosave/reload and file export/open. Packed storage must preserve Step and Variant HEAD states through the shared asset layer.
25. Replacing live workspace state must synchronize transient Undo/Redo controls so enabled buttons never point at cleared history.
26. History UI must render Variant ancestry as a tree at the actual origin Step. A flat “Other variants” list is not an acceptable substitute.
27. Existing projects without branch metadata must normalize into one linear Main Variant without changing saved workspace state.
28. History labels that reference material/Implant/Electrical Region entities must resolve through stable IDs; renaming an entity must not leave stale labels or stale replay names on the same entity lineage.
29. History **Insert before…** must be transactional: failed/no-change inserted operations leave the original process tree untouched; current-Variant insertion may rewrite a tail only when dependency checks pass; child-Variant insertion must leave the source Variant unchanged.
30. When insertion causes replayed Deposit Steps to receive new layer IDs, all downstream replayable layer references must be remapped before the worker request is issued.
31. Project schema migrations must preserve morphology/polarity semantics across v12→v13 and older supported formats.
32. Editing a Step shared by dependent Variants must use copy-on-write rather than becoming a dead end: preserve the source/dependent histories, commit the edited Step on a new active Variant, and carry replayable downstream Steps when requested. Failed carry/replay restores the original graph transactionally.

## Source style

Prettier 3.9.9 and ESLint 10.11.0 are development dependencies. New code should not add multi-statement compressed handlers. Large event handlers should be moved into named functions or focused modules instead of continuing the earlier single-file compression style. Controller extraction must preserve the canonical model/view contracts; do not move geometry semantics merely to reduce file size.

The formatter ignores `site/vendor/`. Vendored code must not be reformatted locally.

## CI gates

Pull requests run the fast **Quality** gate (`npm run check:ci`, ESLint plus Node tests) and the **Browser regression** workflow, which runs the ten focused Chromium suites sequentially, including product layout and real-WebGL renderer review. The complete local `npm run check` additionally runs `format:check`; formatting is intentionally not duplicated in the fast CI gate. Parser/import/export changes additionally trigger the pinned KLayout GDS/OASIS compatibility workflow. Keep parser-only corpus work scoped so ordinary UI changes do not pay the full corpus cost.

Surface/Implant changes should add both pure geometry/profile assertions and at least one real UI-path assertion. Changes to adaptive 3D must preserve the scene-wide subdivision budget and prove that camera-only LOD updates do not rebuild the static surface plan, spatial rough zones, or cached base triangulation. Rough triangulation belongs in `rough-mesh-geometry.js`; physical cap/sidewall/border ownership belongs in `process-topology.js`; `three-view.js` should remain scene/camera/material orchestration. A browser pass is required when changing 3D displacement, transparency, cached LOD-zone boundaries, compact Process layout, or legend interaction because syntax/unit tests alone cannot establish visual correctness.

## Product and process regression

See [Product review](PRODUCT_REVIEW.md) for the Chromium screenshot/interaction matrix, generated review artifacts, and reproduction commands. The Browser regression workflow runs this suite with real WebGL using the pinned Three.js package. See [Testing](testing.md) for suite ownership and [Development handoff](COLLABORATION.md) for ChatGPT/Codex coordination.

See [Process benchmarks](PROCESS_BENCHMARKS.md) for analytic step/trench/island geometry, both faces, Direct/Conformal/Grow/Etch checks, and explicit approximation boundaries. These tests run under `npm test`.

## UI visual system

WaferCAD should read as a compact engineering/CAD workstation rather than a collection of independent web cards. Preserve information density and layout geometry. New UI should reuse the existing visual hierarchy:

- scientific headers use the shared compact toolbar treatment;
- use borders sparingly; prefer surface contrast, spacing and active-state emphasis;
- fields and selects share the same compact control height, radius and focus ring;
- primary actions use the steel-blue accent; secondary/quiet actions remain neutral;
- tool tabs should not introduce per-tab boxed borders;
- runtime feedback is centralized in the bottom status bar; semantic colors are reserved for success, information/progress, warning and error states. Do not duplicate the same message in panel hints or toast overlays.

Do not create a one-off visual language for a new panel or control when an existing workstation control pattern fits.
