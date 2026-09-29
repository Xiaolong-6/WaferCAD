# WaferCAD v2 static site

This directory is the GitHub Pages artifact. There is no application server and no build step.

- `app.js` owns UI orchestration and the synchronized Mask / 3D / Main / Section views.
- `model.js` owns the vector 2.5D region-stack geometry model and stable layer metadata IDs.
- `vector-geometry.js` owns browser-side polygon Boolean, buffer, transform and section helpers.
- `gds.js` is the browser GDSII reader and hierarchy flattener.
- `vendor/polygon-clipping.umd.js` provides polygon Boolean operations.

XY geometry remains vector throughout Add, Grow, Etch, Invert, 3D extrusion and section generation.
