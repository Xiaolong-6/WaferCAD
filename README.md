# WaferCAD MVP

A minimal local-first **2.5D wafer CAD editor** for building wafer/device geometry as a sequence of saved states.

This is intentionally **not** a TCAD simulator and **not** yet a process-flow engine. The current idea is closer to SketchUp's push/pull workflow, but with semiconductor-mask geometry imported from GDSII or OASIS.

## What works in this MVP

- Create a circular, rectangular, or coordinate-defined polygon wafer with independently selectable lateral/thickness units.
- Import GDSII or OASIS and identify **each layer/datatype pair separately** using `gdstk`.
- Choose a layout top cell and align it to the wafer with X/Y offsets and rotation.
- Assign project-local aliases to layer/datatype pairs.
- Clip every imprint and push/pull operation to the physical substrate outline.
- Flip between front and back processing faces; backside additions and cuts use the wafer bottom surface.
- Invert each mask layer inside the substrate to represent opposite photoresist/mask tone.
- Optionally fill enclosed border-only mask geometry and mirror an individual layout layer left/right about the layout origin before imprinting.
- Preserve imported polygons as vector geometry; no rasterization.
- Show GDS layers independently in the Top View.
- Imprint a chosen GDS layer into selectable patterned faces.
- Select imprinted polygons and:
  - **Pull up**: create a new extruded solid with a chosen material.
  - **Push down**: consume stacked material layers from the active surface, then continue into the substrate.
  - **Conformal grow**: apply the same physical radius laterally and along Z using a round-offset 2.5D approximation.
  - **Isotropic etch**: laterally dilate the etch region and remove the substrate by the same depth.
- Add a named dopant to the upper or lower part of a selected physical layer. Doping overlaps its target, does not change the surface, and appears as a gradient in Cross Section.
- Undo geometry operations one at a time from the button beside Apply.
- With no pattern selected, operations use the entire active face: Pull creates a blanket layer, while Push consumes any covering films before continuing into the substrate.
- Linked views of the same model state:
  - interactive 3D view;
  - top view;
  - live A–B cross section.
- Switching to the back face mirrors Top View, animates the 3D camera through a continuous 180° transition to the underside, and flips the A–B section horizontally and vertically.
- Drag A/B endpoints in the top view and update the cross section + 3D slice plane.
- Enter exact A/B coordinates, zoom with the mouse wheel, and pan by dragging empty Top View space.
- Save named snapshots of the current model and restore them later.
- Save/open the whole project as JSON.
- Use the in-canvas 3D figure legend to inspect each layer's read-only physical thickness (or local minimum–maximum), rename its material, change its color, and set an independent display-only Z scale (default ×1).
- Show or hide viewport-spanning X/Y/Z axes and the model origin in 3D. The vertical global Z display slider in Cross Section scales the displayed height of the substrate and every layer.

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

Three.js is pinned in `package-lock.json` and served locally by the FastAPI application, so the 3D view does not require a CDN connection.

## Basic workflow

1. Create/open a wafer.
2. Import a `.gds`, `.gdsii`, `.oas`, or `.oasis` file.
3. Choose the top cell, then set any X/Y offset and rotation needed to align the layout origin with the wafer.
4. The left panel lists separate layout `layer/datatype` pairs, e.g. `1/0`, `10/5`; optionally give them aliases.
5. Press **Imprint** on a layer. Top-cell and alignment controls lock after imprinting to keep committed geometry consistent.
6. Click one or more imprinted polygons in Top View (or use **Select faces**).
7. Enter a distance and choose Pull, Push, Conformal grow, Isotropic etch, or Doping.
8. Inspect the 3D model and A–B section.
9. Press **Snapshot** to preserve the current fabrication state.
10. Continue editing and create the next snapshot.

## Important limitations

This is an architectural/interaction MVP, not a finished CAD kernel.

- Push/Isotropic etch consume the geometric stack in depth order, but do not yet model chemistry-dependent selectivity, etch stops, loading, redeposition or different rates per material.
- Pull-up uses a 2.5D polygon extrusion. Conformal grow/isotropic etch use a round lateral offset plus the same Z distance; a true 3D sidewall shell, sloped profile, loading effect and transport model are not implemented.
- Overlapping/stacked polygons use a centroid-based surface-height estimate for pull-up placement.
- GDSII/OASIS hierarchy is read and top cells can be selected, but the editor still displays a flattened polygon view of the selected top cell rather than a hierarchy browser.
- No automatic process semantics (oxidation, deposition, lithography, etc.) yet.
- The model uses physical dimensions internally but display Z is exaggerated for visibility.
- Per-layer and global Z scaling are visualization settings only; they never change stored physical thicknesses.
- Large layout files are capped at 20,000 flattened polygons in this MVP.

See `HANDOFF.md` before extending the project.
