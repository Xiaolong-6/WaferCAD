# WaferCAD MVP

A minimal local-first **2.5D wafer CAD editor** for building wafer/device geometry as a sequence of saved states. Header-persistent dock (`Main | Pattern Editor`) shares the same `state` without page reload; `New wafer` and `+ Snapshot` are floating in the 3D view.

This is intentionally **not** a TCAD simulator and **not** yet a process-flow engine. The interaction is SketchUp's push/pull extended with semiconductor-mask geometry imported from GDSII or OASIS.

## What works in this MVP

- Create a circular (with optional `Main flat` or `Notch` at `-Y` auto-sized per SEMI M1), rectangular, or coordinate-defined polygon wafer with independently selectable lateral/thickness units. `New wafer` is a floating button in the 3D view (header stays, `view3d-float`).
- **Physical Mask Composer:** every filled GDS boundary remains independently selectable, then selected boundaries are unioned before process geometry so overlaps and stitch boundaries never become model edges. Pattern Editor shows `Mask` and `Wafer Projection` side by side with linked pan/zoom: Mask exposes selection and polarity, while Wafer Projection shows only the wafer and a borderless solid-purple UV exposure. `Commit projection to Main` freezes the resolved exposure geometry, and every process operation consumes only that committed projection.
- Import GDSII or OASIS and identify **each layer/datatype pair separately** using `gdstk`; browse the full cell hierarchy and choose any cell or `All cells` aggregate. `All cells` collects `depth=0` polygons from every cell (solves per-cell-per-layer files).
- Main `Top view` renders the physical model plus the committed substrate projection only; raw GDS/mask geometry is confined to Pattern Editor's Mask view.
- Assign project-local aliases by clicking a layer name (dotted underline) in the old `Main` panel (now deprecated, layers live in the dock). Legacy project tone/fill fields remain loadable, while new mask work uses optical components and one explicit physical polarity.
- Line-like layers with no physical area remain guarded. Filled GDS boundaries and width-bearing paths are treated as physical geometry; independent components are never silently discarded by an area heuristic.
- Align the active cell to the wafer with `X/Y` offset, `Rotation` and global `Scale` (default 1, about layout origin) — live preview in dock, persisted via `state.gds.transform` and `persistSharedState`.
- Clip every push/pull/conformal/isotropic operation to the exact wafer outline (including flat/notch and non-convex customs).
- Flip between front and back processing faces (`Face: Front/Back` in the Geometry panel); backside Pull grows below `z=-thickness` and Push etches upward.
- Geometry operation panel order: `Distance → Mode → Material → Face → Selection → Apply/Undo` at the bottom. `Selection` defaults to `Full faces`; `Patterns` resolves all selected layers/components as one physical exposure field before Pull, Push, Conformal, Etch, or Doping.
- Operations:
  - **Pull up**: extruded solid with material.
  - **Push down / Isotropic etch**: layer-by-layer consumption of the stack in depth order via `split-by-mask`, then substrate cut; fully consumed layers and their dopings are removed.
  - **Conformal grow / Isotropic etch**: round `gdstk.offset` plus same Z distance (2.5D isotropic approximation).
  - **Planar top-surface partition**: every process mask is split by all current solid and cut footprints before Z assignment. Pull, Push, isotropic etch, exposed-face selection and doping therefore operate on one material and one surface height per atomic XY region.
- Doping, Undo (50 steps), whole-face fallback, and per-layer/global Z display (true `×1` is isotropic, `Z display` is exaggeration) remain.
- Linked views: interactive 3D (with `Show axes`), Top (wheel zoom + drag pan on empty, `Fit wafer/layout`), and live `A–B` section (`×1` is true scale, now with `wheel zoom / drag pan / double-click reset` via `translate/scale` on `sectionContent` group, hint as overlay, tight `yMin/yMax` with 4% pad). Top always projects the current model's visible solids, substrate cuts and doping beneath any layout/selection overlays.
- `Figure legend` is ordered as a physical stack (`Front top → substrate → Back bottom`), labels material layers as Front/Back and Top/Bottom, shows per-layer thickness (exact planar partition for substrate, `atoms` count), and allows renaming/color/Z-scale. It exposes a guarded delete action only for the current physical Front top or Back bottom material layer; substrate and interior layers cannot be deleted, and deletion participates in Undo.
- `Snapshots` as a Google-Maps-style horizontal strip below `3D`: `+ Snapshot` (floating) opens an in-app naming dialog and captures the current 3D perspective (`camera position/target` + thumb), new cards appear on the right, hover `×` to delete, click to restore (auto-saves the previous snapshot covering the current archive), and `New wafer` offers snapshot-save. Snapshots store camera and are part of project JSON.
- **Persistence:** every mutation flows through the revisioned `commitState()` transaction. Complete structured state and the original GDS/OAS `Blob` are queued to IndexedDB; Web Storage contains only a tiny recovery marker/timestamp. Failures are visible in the status bar and emit `wafercad:persistence-error` instead of being swallowed. Refresh remains a clean reset with explicit `Restore / Reset`; legacy Web Storage sessions migrate once into IndexedDB.
- **Navigation:** `Main | Pattern Editor` tabs in header keep the header persistent; content toggles via `#mainWorkspace` / `#patternsWorkspace` (`grid-row:2` shared, `hidden` toggled, `patRender` on show). `/patterns` redirects `302 → /`.

## Run

Python 3.10+ is recommended.

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
npm install
python run.py
```

Open:

```text
http://127.0.0.1:8765
```

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest
npm run test:ui
```

The test suite generates and checks in a small synthetic `BASE → TOP` layout in
both GDSII and OASIS formats. It contains only two rectangles on layer/datatype
pairs `1/0` and `10/5`; no confidential layout data is used.

The UI suite launches the installed Google Chrome in headless mode, starts the
FastAPI service when necessary, and exercises the complete create/import/
geometry/undo/snapshot/save/open workflow **via the Pattern Editor dock** (`Mask` selection → `Wafer Projection` → `Commit projection to Main` → process operation). Use `npm run test:ui:headed` to watch
the same test in a visible Chrome window.

Three.js is pinned in `package-lock.json` and served locally by the FastAPI application, so the 3D view does not require a CDN connection. `polygon-clipping` is vendored as `static/vendor/polygon-clipping.umd.js` for offline preview.

## Basic workflow

1. Create/open a wafer (for circles optionally add a SEMI-sized `Main flat` or `Notch` at `-Y`) — use the floating `New wafer` in 3D.
2. Import a `.gds`, `.gdsii`, `.oas`, or `.oasis` file; pick a `Cell` or the local-geometry aggregate, enable layers, then select filled boundaries directly or use Lasso to save complete boundaries as a named pattern. Choose whether polygons transmit or block light.
3. Use the parallel `Mask` and `Wafer Projection` panels to set `Scale`/`X/Y`/`Rotation` and verify the substrate-clipped exposure. Their pan and zoom stay synchronized, and all plan views include a live scale bar. Click `Commit projection to Main` when the purple UV area is correct.
4. In `Main` choose `Face: Front/Back`, then `Full faces` (click blue top regions) or `Patterns` (layers checked in dock).
5. Enter a distance and choose `Pull`, `Push`, `Conformal grow`, `Isotropic etch`, or `Doping` (`Face` + `Selection` decide the mask; empty selection uses the whole face).
6. Inspect `3D` (true `×1`), `Top` (with `Mask veil` opacity) and `A–B` section (wheel/drag/double-click).
7. Click `+ Snapshot` (floating) to capture the current `3D` perspective; find it in the strip below `3D`, switch by clicking cards (previous state is auto-saved).
8. New wafer prompts to snapshot-save the current state first. Refresh shows an empty project but offers `Restore` for the previous session.

## Important limitations

This is an architectural/interaction MVP, not a finished CAD kernel.

- Push/Isotropic etch consume the geometric stack in depth order, but do not yet model chemistry-dependent selectivity, etch stops, loading, redeposition or different rates per material.
- Pull-up uses a 2.5D polygon extrusion. Conformal grow/isotropic etch use a round lateral offset plus the same Z distance; a true 3D sidewall shell, sloped profile, loading effect and transport model are not implemented.
- Curved sidewalls and true 3D conformal shells remain outside the 2.5D model, but stacked planar topography is partitioned exactly in XY before every operation; no centroid surface-height estimate is used.
- The composer is a binary geometric projection model; diffraction, partial coherence, focus, aerial-image thresholds, resist chemistry, and process bias are not yet simulated.
- No automatic process semantics (oxidation, deposition, lithography, etc.) yet.
- At `×1` display Z is true isotropic; higher values are exaggeration for visibility.
- Per-layer and global Z scaling are visualization settings only; they never change stored physical thicknesses.
- Large layout files are capped at 20,000 flattened polygons; Mask view can still be heavy when many optical components are fully zoomed out.
- Pattern Editor's `Lasso` is a rectangular `Shift+drag` in Mask view; saving creates a virtual `pattern:*` layer from complete optical components rather than clipping fragments to the lasso rectangle.

See `HANDOFF.md` before extending the project.
