# WaferCAD v2 preview

WaferCAD is being rebuilt as a browser-only 2.5D geometry editor for mask-driven structure construction.

The live v2 application is in `site/` and is deployed to GitHub Pages. It uses four synchronized views:

- **Mask** — GDSII hierarchy/layer selection plus a 3D-only focus region.
- **3D** — interactive rendering of the current structure, optionally clipped to the focus region.
- **Main view** — front/back surface map with emphasized step edges and an editable A–B section line.
- **Section A–B** — live cross-section generated from the same structure model as the 3D view.

The first preview supports rectangle/circle bases, front/back processing, mask or whole-face operations, Add new layer, Grow current layer, vertical Etch/Subtract, Direct growth and a grid-based Conformal approximation that includes sidewall footprint expansion. Thickness values are deliberately relative rather than tied to a physical unit.

GDSII is parsed directly in the browser. Filled boundaries and width-bearing paths are operable; zero-width linework is not. OASIS is not supported in this first preview.

## Legacy implementation

The pre-v2 FastAPI/gdstk application and its documentation remain in the repository only as implementation/history reference. New v2 development should not preserve its API or architecture unless a concept is independently useful.

## Local preview

Serve the `site/` directory with any static HTTP server, for example:

```bash
python -m http.server 8000 --directory site
```

Run the dependency-free geometry smoke tests with:

```bash
node site/selftest.mjs
```
