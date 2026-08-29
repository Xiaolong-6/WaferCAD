# WaferCAD MVP

A minimal local-first **2.5D wafer CAD editor** for building wafer/device geometry as a sequence of saved states.

This is intentionally **not** a TCAD simulator and **not** yet a process-flow engine. The current idea is closer to SketchUp's push/pull workflow, but with semiconductor-mask geometry imported from GDSII or OASIS.

## What works in this MVP

- Create a circular (with optional `Main flat` or `Notch` at `-Y` auto-sized per SEMI M1), rectangular, or coordinate-defined polygon wafer with independently selectable lateral/thickness units.
- Import GDSII or OASIS and identify **each layer/datatype pair separately** using `gdstk`; browse the full cell hierarchy and choose any cell as the active top cell.
- Viewport-cull Top View outside the current `topBounds` for smooth pan/zoom near the 20 000-polygon cap; `Mask veil` opacity is adjustable for alignment.
- Assign project-local aliases by clicking a layer name (dotted underline) and set per-layer `Invert`, `Fill pattern`, `Mirror` with live Top preview.
- For border-only closed shapes, `Use` is disabled until `Fill pattern` is enabled (filled outer contour), avoiding accidental ring masks.
- Align the active cell to the wafer with `X/Y` offset, `Rotation` and global `Scale` (default 1, about layout origin) — live preview, no lock after geometry.
- Clip every push/pull/conformal/isotropic operation to the exact wafer outline (including flat/notch and non-convex customs).
- Flip between front and back processing faces (`Face: Front/Back` in the Geometry panel); backside Pull grows below `z=-thickness` and Push etches upward.
- Geometry operation panel order: `Distance → Mode → Material → Face → Selection → Apply/Undo` at the bottom. `Selection` defaults to `Full faces` (topmost model faces, blue selectable in Top View); `Patterns` is multi-select (`Use` checkboxes, amber highlight, inverted layers hatched) and is applied as a combined mask (per-layer `S\layer` ∪ `S∩layer`).
- Operations:
  - **Pull up**: extruded solid with material.
  - **Push down / Isotropic etch**: layer-by-layer consumption of the stack in depth order via `split-by-mask`, then substrate cut; fully consumed layers and their dopings are removed.
  - **Conformal grow / Isotropic etch**: round `gdstk.offset` plus same Z distance (2.5D isotropic approximation).
- Doping, Undo (50 steps), whole-face fallback, and per-layer/global Z display (true `×1` is isotropic, `Z display` is exaggeration) remain.
- Linked views: interactive 3D (with `Show axes`), Top, and live `A–B` section (`×1` is true scale).
- `Figure legend` shows per-layer thickness (exact planar partition for substrate, `atoms` count) and allows renaming/color/Z-scale; now reliably clickable via delegation.
- `Snapshots` as a Google-Maps-style horizontal strip below `3D`: `+ Snapshot` in the header opens an in-app naming dialog and captures the current 3D perspective (`camera position/target` + thumb), new cards appear on the right, hover `×` to delete, click to restore (auto-saves the previous snapshot covering the current archive), and `New wafer` offers snapshot-save.
- Save/open the whole project as JSON (version 7).

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
```

The test suite generates and checks in a small synthetic `BASE → TOP` layout in
both GDSII and OASIS formats. It contains only two rectangles on layer/datatype
pairs `1/0` and `10/5`; no confidential layout data is used.

Three.js is pinned in `package-lock.json` and served locally by the FastAPI application, so the 3D view does not require a CDN connection.

## Basic workflow

1. Create/open a wafer (for circles optionally add a SEMI-sized `Main flat` or `Notch` at `-Y`).
2. Import a `.gds`, `.gdsii`, `.oas`, or `.oasis` file; pick a `Cell` from the hierarchy as the active top cell.
3. In `Patterns` mode check one or more `Use` layers (e.g. `1/0`, `10/5`), optionally alias by clicking the name, and set `Scale`/`X/Y`/`Rotation`/`Invert`/`Fill`/`Mirror` — all live in `Top`.
4. Choose `Face: Front/Back`, then `Full faces` (click blue top regions) or `Patterns` (checked layers).
5. Enter a distance and choose `Pull`, `Push`, `Conformal grow`, `Isotropic etch`, or `Doping` (`Face` + `Selection` decide the mask; empty selection uses the whole face).
6. Inspect `3D` (true `×1`), `Top` (with `Mask veil` opacity) and `A–B` section.
7. Click `+ Snapshot` in the header to capture the current `3D` perspective; find it in the strip below `3D`, switch by clicking cards (previous state is auto-saved).
8. New wafer prompts to snapshot-save the current state first.

## Important limitations

This is an architectural/interaction MVP, not a finished CAD kernel.

- Push/Isotropic etch consume the geometric stack in depth order, but do not yet model chemistry-dependent selectivity, etch stops, loading, redeposition or different rates per material.
- Pull-up uses a 2.5D polygon extrusion. Conformal grow/isotropic etch use a round lateral offset plus the same Z distance; a true 3D sidewall shell, sloped profile, loading effect and transport model are not implemented.
- Overlapping/stacked polygons use a centroid-based surface-height estimate for pull-up placement.
- `Invert` multi-select currently unions per-layer `S\layer` / `S∩layer` (`(S\A)∪(S\B)`), which is per-layer tone; `S\(A∪B)` would require a different grouping.
- `Top` inverted preview is hatched, not a true wafer-with-hole; precise inverted hole preview would need async Boolean preview.
- No automatic process semantics (oxidation, deposition, lithography, etc.) yet.
- At `×1` display Z is true isotropic; higher values are exaggeration for visibility.
- Per-layer and global Z scaling are visualization settings only; they never change stored physical thicknesses.
- Large layout files are capped at 20,000 flattened polygons; Top View uses viewport culling but 20k SVG paths remain heavy when fully zoomed out.

See `HANDOFF.md` before extending the project.
