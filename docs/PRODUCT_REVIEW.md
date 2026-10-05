# Product interaction and visual regression

## Review scope

The product regression covers Main, Mask, 3D, Section, all five tool tabs, KLayout transform/hierarchy GDS and compressed OASIS imports, snapshots, and process benchmark projects.

Primary viewports are 1440 × 900, 1000 × 800, and 390 × 844. The phone context also uses device pixel ratio 2 and real Chromium touch events. Breakpoint checks cover widths 600, 601, 900, and 901.

## Interaction contract

- A–B opens explicit coordinate controls. They stay open until manually collapsed.
- Drag A/B enters editing; Done exits it. Existing endpoints become labeled independent DOM handles, 32 CSS pixels for a mouse and 44 for a coarse pointer.
- Dragging off-center preserves the pointer offset. Pointer capture continues outside the canvas. Cancellation restores the pre-drag coordinates; Escape cancels the current drag, or exits edit mode if no drag is active.
- Arrow keys on a focused endpoint move it by one screen pixel; Shift moves ten. The active Front/Back coordinate transform applies to both keyboard and pointer input.
- Collapse ends endpoint editing. Opening a project or restoring a snapshot also locks the endpoints.
- ROI handles remain 10 CSS pixels at every zoom, with separate mouse/touch hit ranges. Resizing preserves the grab offset, and a circle can cross its fixed opposite corner.
- Reference changes preserve ROI geometry. Numeric A/B and ROI inputs retain full values when nm/µm/mm display units change.

## Layout and renderer changes

On desktop landscape widths above 900 px, the five workspace panels are arranged as **Main / Mask / Function** on the first row and **3D / Section** on the second row. Their six-column allocation is 2/2/2 on the first row and 2/4 on the second row, preserving the established panel proportions.

At widths up to 900 px, A–B coordinates dock below Main so they cannot cover the endpoints. The established three-row narrow layout remains unchanged: Tools/3D, Main/Mask, Section.

Narrow tool headers wrap deliberately; mobile base fields use full input rows, all five mobile tabs remain visible in two rows, and the legend header wraps its controls. The ROI popover has a bounded scroll area. Plan-axis tick spacing responds to the available screen width and actual label width.

Canvas ResizeObservers redraw after panel layout changes. This prevents stretched Mask/Section images when opening the mobile coordinate controls. 3D Fit uses the camera aspect ratio, field of view and bounding radius to keep the full model inside the panel.

## Main geometry interaction

Main geometry editing is intentionally tool-light: existing Slice and ROI objects remain directly editable even when their parameter popovers are closed. Slice endpoints and the whole A–B line are draggable; ROI bodies and handles remain draggable/resizable. Slice and ROI buttons start one-shot creation or expose exact numeric controls rather than acting as edit locks. Their popovers are mutually exclusive.

Mask no longer owns ROI interaction. Main and Mask both support double-click Fit. The desktop landscape order is Main / Mask / Function above 3D / Section; narrow layouts remain unchanged.

## Workstation visual hierarchy

The editor uses a compact engineering/CAD workstation visual system. Information density and panel geometry stay unchanged; hierarchy comes from surface treatment rather than added whitespace.

- scientific view headers share one compact toolbar language across Main, Mask, 3D and Section;
- panel borders are subdued and canvas surfaces remain visually dominant;
- tool tabs use a quiet background plus a single active underline instead of boxed emphasis;
- inputs, selects, segmented controls, primary actions and quiet actions use one border/radius/focus system;
- popovers and coordinate editors use the same elevated-surface treatment;
- passive status remains low weight, while success/info/warning/error states retain distinct semantic feedback;
- visual styling must not change workspace grid allocation, scientific geometry, or editor behavior.

## Post-review extensions, 2026-10-02

- **Project persistence semantics** — Project is the first/default tool tab. Save creates a browser-local Recovery checkpoint, Export owns file download, and Recovery exposes Restore plus explicit Clear. Persistence v2 separates Recovery metadata from large payloads, losslessly packs repeated snapshot assets in both current autosave and Recovery, and checkpoints the current workspace before destructive replacement including Welcome explicit starts. Autosave is triggered by persisted-state mutations rather than renderer side effects; read-only tabs cannot clear the owner autosave, and page lifecycle handling prevents a stale BFCache/pagehide writer from reclaiming current state.

The current feature branch extends the September review baseline in three areas that require additional visual attention before merge to `main`:

- **Compact Function panel** — related engineering parameters are paired into two-column rows on desktop and collapse to one column on phone widths. Rough/Pyramid controls share this grammar without horizontal overflow.
- **3D Renderer v2** — Section A–B remains the profile reference, while 3D now uses screen-space adaptive LOD instead of a fixed full-model/ROI triangle-budget split. Camera distance, projected rough-feature size, viewport resolution/DPR, ROI extent, and the camera-focus region determine tessellation. Each rough cap is triangulated once when the surface plan is built. A bounded pre-subdivision is partitioned into a small static spatial-zone set by triangle centroid, with zone boundaries derived from shared triangle ownership rather than polygon Boolean clipping. Camera updates only recompute zone priority, subdivision depth and allocation under one scene-wide triangle budget; they do not repeat triangulation or geometric clipping. Kernel v2 owns rough/smooth caps, buried material interfaces, sidewalls, and physical borders, with `renderer-geometry.js` reduced to an adapter. Shared interfaces are emitted once, buried interfaces are additionally shown only during transparent inspection, and borders no longer expose duplicate material seams or artificial LOD boundaries.
- **Experimental Implant** — the Process form no longer predefines an arbitrary color. Apply assigns from the active 20-color structure palette; Layers controls rename/color/visibility. Main uses a light overlay. Section and 3D now share one normalized surface-to-depth gradient falloff. Opaque 3D still suppresses buried volume, but an ROI that cuts a buried Implant exposes a gradient cut sidewall; transparent inspection adds the weaker full internal volume. Rough cut-side boundaries follow the same deterministic morphology profile as Section. A physical exposed/cut horizontal cap remains distinct from a render-only ROI sidewall.

The permanent UI smoke checks Pyramid control switching, removal of the Implant color input, 20-color implant palette behavior, right-aligned visibility control, project persistence, IndexedDB Recovery metadata/payload separation, 2D-only dirty-state autosave, destructive-operation Recovery checkpoints, worker-backed project/layout paths, and a fixed 21 px box model for visible view-header controls. Pure/static regressions cover projected-pixel LOD scaling, ROI/screen-priority budget allocation, partial-Z sidewall/border ownership, single-owner buried rough interfaces, global-opacity coupling/depth testing for 3D Implant overlays, morphology polarity, Pyramid profiles, and Implant clipping after Etch. The real-WebGL product pass additionally maximizes the rough 3D view, changes camera scale enough to rebuild adaptive rough meshes, verifies that static surface-plan, spatial-zone-build and base-triangulation counters remain unchanged during camera LOD updates, and asserts that subdivision triangles remain within the scene-wide budget. A multi-cap stress case repeats those checks across four independent rough patches. Buried Implant visibility also has explicit scene-ownership assertions: opaque inspection must create no internal Implant volume and no horizontal surface overlay for a fully buried fragment, but an ROI that intersects that fragment must create a depth-gradient inspection cut face; 50% transparent inspection must additionally create the internal gradient volume; and Etch-exposed Implant must retain its opaque physical surface overlay without adding the buried volume. The review treats Section A–B and the ROI perimeter as separate inspection paths, so visual comparisons must align those paths explicitly for annular/radial layouts. Human review remains the final authority for full-wafer zoom quality, ROI detail, rough-Conformal buried interfaces, cached-zone seams, and broader appearance quality that cannot be reduced to stable semantic pixel relationships.

## Reproduce the review

Install development dependencies, then the browser review dependencies:

```bash
npm ci
npm install --no-save --package-lock=false playwright@1.55.0 three@0.179.1
npx playwright install chromium
python3 -m http.server 4173 --directory site
```

In another terminal:

```bash
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/product-regression.mjs
```

The local Three.js package serves the same pinned CDN module URLs during the test; it changes no application source or import map. This makes the test repeatable while exercising actual WebGL. The separate UI smoke retains a test for the CDN-unavailable fallback.

Open `test-results/product-review/index.html` to inspect screenshots and reopen a generated `.wafercad` fixture in WaferCAD. Assertions cover actual coordinate changes, touch dragging, cancellation, Back mirroring, unit conversions, snapshot restoration, ROI dimensions, header and ROI/opacity popover containment, minimum canvas sizes, backing-buffer dimensions, and absence of page errors.

CI uploads this review with the tested static application as an artifact. Screenshots still require human inspection: DOM assertions and targeted renderer scene checks do not establish overall visual quality. This suite is not a large-layout performance benchmark.

## Completed review, 2026-09-30

The final local run passed Quality (71 tests plus the self-test), the original UI smoke including CDN failure, and the product regression with 94 captures and no page errors. All capture groups were visually inspected, with full-size inspection of the A/B, mobile controls, ROI, and scientific comparison cases.

Visual findings fixed during the review were covered endpoints, clipped header controls, cramped mobile base inputs and tabs, clipped ROI/opacity popovers, canvas stretching after layout changes, overlapping/clipped axis labels, and an undersized 3D camera fit. Process checks additionally identified rounded Z grouping in the 3D renderer; exact interval grouping now preserves distinct surfaces. A reported Section screenshot also exposed artificial vertical lines inside continuous substrate and coating. Main and Section now draw unioned visible contours; 3D builds each material boundary without internal prism faces or edges. Actual substrate pixels are checked across former seams, with geometry tests preserving true interfaces, steps, holes and disconnected islands.

Representative final captures:

- [Wide A/B editing](review/ab-wide.png)
- [Phone A/B editing](review/ab-phone.png)
- [Phone nm-scale ROI editor](review/roi-phone.png)
- [Front Conformal trench](review/trench-front.png)
- [Back Conformal island, viewed from below](review/island-back.png)

The CI artifact contains the full gallery, 12 reopenable Direct/Conformal/Etch fixtures, and `preview/`. To run the tested preview after downloading the artifact, serve that directory with `python3 -m http.server 8000 --directory preview`, then open `http://localhost:8000`. The preview footer identifies the tested commit.


The real-WebGL review also includes `wide-rough-conformal-3d-opaque-max` and `wide-rough-conformal-3d-transparent-max`, reproducing rough Etch followed by whole-face Conformal coverage so buried-interface rendering regressions are visible in the standard artifact set.
