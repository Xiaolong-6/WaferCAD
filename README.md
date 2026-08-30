# WaferCAD MVP

A minimal local-first **2.5D wafer CAD editor** for building wafer/device geometry as a sequence of saved states. Header-persistent dock (`Main | Pattern Editor`) shares the same `state` without page reload; `New wafer` and `+ Snapshot` are floating in the 3D view.

This is intentionally **not** a TCAD simulator and **not** yet a process-flow engine. The interaction is SketchUp's push/pull extended with semiconductor-mask geometry imported from GDSII or OASIS.

## What works in this MVP

- Create a circular (with optional `Main flat` or `Notch` at `-Y` auto-sized per SEMI M1), rectangular, or coordinate-defined polygon wafer with independently selectable lateral/thickness units. `New wafer` is a floating button in the 3D view (header stays, `view3d-float`).
- **Pattern Editor dock** (`Main` ↔ `Pattern Editor` in header, no reload, `state` shared via `core.js` + `sessionStorage` base64 for GDS file). Dedicated 2D canvas (pan/zoom, `Fit: GDS/Wafer/Both` cycling) shows wafer outline, faint unselected layers, and orange preview. Uses `polygon-clipping` (local `static/vendor/polygon-clipping.umd.js`) for client-side `union/difference` preview (scaled `nm` integer, `gdstk` remains backend truth). Features: cell hierarchy with `All cells` aggregate (solves 4-layers-in-4-cells files), per-layer `Invert` (`S\L`) vs `Global S\∪L` vs `Wafer invert` (`wafer \ union`), `Fill closed borders` (union preview), `Highlight` (`Top faces` blue / `Wafer invert` amber hatch), `Lasso` (Shift+drag rect, `Save lasso as new pattern` creates virtual `pattern:*` layer 900+), `Area guard` (line-like layers disabled until `Fill`), `Scale/Rotate/X/Y` live.
- Import GDSII or OASIS and identify **each layer/datatype pair separately** using `gdstk`; browse the full cell hierarchy and choose any cell or `All cells` aggregate. `All cells` collects `depth=0` polygons from every cell (solves per-cell-per-layer files).
- Viewport-cull Top View outside the current `topBounds` for smooth pan/zoom near the 20 000-polygon cap; `Mask veil` opacity is adjustable for alignment.
- Assign project-local aliases by clicking a layer name (dotted underline) in the old `Main` panel (now deprecated, layers live in dock) and set per-layer `Invert`, `Fill pattern`, `Mirror` with live preview (now in dock, global/per-layer invert, fill, highlight).
- For border-only closed shapes, `Use` is disabled until `Fill pattern` is enabled (filled outer contour), avoiding accidental ring masks. Line-like layers (area < 1 nm²) are similarly disabled with `line (no area)` hint.
- Align the active cell to the wafer with `X/Y` offset, `Rotation` and global `Scale` (default 1, about layout origin) — live preview in dock, persisted via `state.gds.transform` and `persistSharedState`.
- Clip every push/pull/conformal/isotropic operation to the exact wafer outline (including flat/notch and non-convex customs).
- Flip between front and back processing faces (`Face: Front/Back` in the Geometry panel); backside Pull grows below `z=-thickness` and Push etches upward.
- Geometry operation panel order: `Distance → Mode → Material → Face → Selection → Apply/Undo` at the bottom. `Selection` defaults to `Full faces` (topmost model faces, blue selectable in Top View); `Patterns` is multi-select (checked in dock, amber highlight, inverted layers hatched) and is applied as a combined mask (per-layer `S\layer` ∪ `S∩layer`, or global `S\∪layer` / `wafer`).
- Operations:
  - **Pull up**: extruded solid with material.
  - **Push down / Isotropic etch**: layer-by-layer consumption of the stack in depth order via `split-by-mask`, then substrate cut; fully consumed layers and their dopings are removed.
  - **Conformal grow / Isotropic etch**: round `gdstk.offset` plus same Z distance (2.5D isotropic approximation).
- Doping, Undo (50 steps), whole-face fallback, and per-layer/global Z display (true `×1` is isotropic, `Z display` is exaggeration) remain.
- Linked views: interactive 3D (with `Show axes`), Top (wheel zoom + drag pan on empty, `Fit wafer/layout`), and live `A–B` section (`×1` is true scale, now with `wheel zoom / drag pan / double-click reset` via `translate/scale` on `sectionContent` group, hint as overlay, tight `yMin/yMax` with 4% pad). Top always projects the current model's visible solids, substrate cuts and doping beneath any layout/selection overlays.
- `Figure legend` is ordered as a physical stack (`Front top → substrate → Back bottom`), labels material layers as Front/Back and Top/Bottom, shows per-layer thickness (exact planar partition for substrate, `atoms` count), and allows renaming/color/Z-scale. It exposes a guarded delete action only for the current physical Front top or Back bottom material layer; substrate and interior layers cannot be deleted, and deletion participates in Undo.
- `Snapshots` as a Google-Maps-style horizontal strip below `3D`: `+ Snapshot` (floating) opens an in-app naming dialog and captures the current 3D perspective (`camera position/target` + thumb), new cards appear on the right, hover `×` to delete, click to restore (auto-saves the previous snapshot covering the current archive), and `New wafer` offers snapshot-save. Snapshots store camera and are part of project JSON.
- **Persistence:** Every geometry/layout change is `persistSharedState()` to `sessionStorage` + `localStorage` (`wafercad_shared`, `wafercad_gds_blob` base64 for GDS file, `wafercad_last_save_ts`). Refresh is a **clean reset** to empty; a banner `Previous session found — Restore / Reset` appears if a prior session exists. `Restore` fully rehydrates `wafer/solids/cuts/dopings/layerVisuals/gds/imprintedFaces/slice/snapshots/topBounds/zExag` and re-fits the 3D canvas (`dispatchEvent resize` twice). `Reset` clears memory and storage without reload. `Save/open` the whole project as JSON (version 7) remains.
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
geometry/undo/snapshot/save/open workflow **via the Pattern Editor dock** (`Pattern Editor` → check `patLayerList` → `Apply to Main` → `Main` `imprinted`). Use `npm run test:ui:headed` to watch
the same test in a visible Chrome window.

Three.js is pinned in `package-lock.json` and served locally by the FastAPI application, so the 3D view does not require a CDN connection. `polygon-clipping` is vendored as `static/vendor/polygon-clipping.umd.js` for offline preview.

## Basic workflow

1. Create/open a wafer (for circles optionally add a SEMI-sized `Main flat` or `Notch` at `-Y`) — use the floating `New wafer` in 3D.
2. Import a `.gds`, `.gdsii`, `.oas`, or `.oasis` file via header `Import layout` (or dock `Import GDS/OAS`); pick a `Cell` or `All cells` from the hierarchy as the active view. Use `Pattern Editor` to check `Use` layers, set `Highlight` (`Top faces` / `Wafer invert`), `Fill`, `Lasso` → `Save as new pattern`, and `Invert → Wafer other part` if needed.
3. In `Pattern Editor` set `Scale`/`X/Y`/`Rotation` — live preview; click `Apply to Main`.
4. In `Main` choose `Face: Front/Back`, then `Full faces` (click blue top regions) or `Patterns` (layers checked in dock).
5. Enter a distance and choose `Pull`, `Push`, `Conformal grow`, `Isotropic etch`, or `Doping` (`Face` + `Selection` decide the mask; empty selection uses the whole face).
6. Inspect `3D` (true `×1`), `Top` (with `Mask veil` opacity) and `A–B` section (wheel/drag/double-click).
7. Click `+ Snapshot` (floating) to capture the current `3D` perspective; find it in the strip below `3D`, switch by clicking cards (previous state is auto-saved).
8. New wafer prompts to snapshot-save the current state first. Refresh shows an empty project but offers `Restore` for the previous session.

## Important limitations

This is an architectural/interaction MVP, not a finished CAD kernel.

- Push/Isotropic etch consume the geometric stack in depth order, but do not yet model chemistry-dependent selectivity, etch stops, loading, redeposition or different rates per material.
- Pull-up uses a 2.5D polygon extrusion. Conformal grow/isotropic etch use a round lateral offset plus the same Z distance; a true 3D sidewall shell, sloped profile, loading effect and transport model are not implemented.
- Overlapping/stacked polygons use a centroid-based surface-height estimate for pull-up placement.
- `Invert` multi-select currently offers per-layer `S\layer` / `S∩layer` (`(S\A)∪(S\B)`) and global `S\∪` as well as `Wafer invert` (`wafer \ union`); `Top` inverted preview is hatched, not a true wafer-with-hole; precise inverted hole preview would need async Boolean preview.
- `Top` inverted preview is hatched, not a true wafer-with-hole; precise inverted hole preview would need async Boolean preview.
- No automatic process semantics (oxidation, deposition, lithography, etc.) yet.
- At `×1` display Z is true isotropic; higher values are exaggeration for visibility.
- Per-layer and global Z scaling are visualization settings only; they never change stored physical thicknesses.
- Large layout files are capped at 20,000 flattened polygons; Top View uses viewport culling but 20k SVG paths remain heavy when fully zoomed out.
- Pattern Editor's `Lasso` is a rectangular `Shift+drag` on empty canvas, `Save as new pattern` creates a virtual `pattern:*` layer 900+ in `state.gds.layers` (area-guarded, `_alreadyTransformed` to avoid double `patTransform`).

See `HANDOFF.md` before extending the project.
