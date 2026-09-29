# WaferCAD v2 preview

WaferCAD is a browser-only vector 2.5D geometry editor for mask-driven structure construction.

The live v2 application is in `site/` and is deployed to GitHub Pages. It uses four synchronized views:

- **Mask** — browser-side GDSII hierarchy browsing with global layer/datatype selection and a 3D-only focus region.
- **3D** — vector extrusion of the current structure, optionally clipped to the focus region.
- **Main view** — front/back vector surface map with an editable A–B section line.
- **Section A–B** — exact line/polygon cross-section from the same vector region-stack model.

The geometry kernel stores non-overlapping XY polygon regions with Z stacks. The XY model is not rasterized. Rectangle and circular bases, front/back operations, Selected / Invert / Whole-face areas, Add new layer, Grow current layer, vertical Etch/Subtract, and Direct / Conformal growth are supported. Thickness values are relative rather than tied to a physical unit.

Each structure layer has a stable internal ID plus user-editable name and color. The 3D legend is the layer-management surface; renaming or recoloring a layer updates all synchronized views without changing geometry references.

GDSII is parsed directly in the browser. Filled boundaries and width-bearing paths are operable; zero-width linework is not. Cells are shown hierarchically, while Layers is a global unique `layer/datatype` list. OASIS is not supported in this preview.

Base changes are reversible. If the current structure already contains operations, rebuilding the base requires confirmation and can be restored with Revert or Undo.

## Legacy implementation

The pre-v2 FastAPI/gdstk application and its documentation remain in the repository only as implementation/history reference. New v2 development should not preserve its API or architecture unless a concept is independently useful.

## Local preview

Serve the `site/` directory with any static HTTP server, for example:

```bash
python -m http.server 8000 --directory site
```

Run the geometry smoke tests with:

```bash
node site/selftest.mjs
```
