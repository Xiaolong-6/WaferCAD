# Development

## Active application

The active product is entirely under `site/`.

Do not add runtime dependencies on the archived Python backend or the archived static client.

## Local run

```bash
python -m http.server 8000 --directory site
```

Open `http://localhost:8000`.

## Geometry smoke test

```bash
node site/selftest.mjs
```

The smoke test covers the vector geometry contracts for Add, Grow, Etch, Conformal growth, Invert geometry, layer metadata editing, circular boundaries, and mask linework filtering.

## Deployment

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages when `main` changes.

There is no build step.

## Current design contracts

1. XY geometry remains vector.
2. GDS XY is converted to µm from the file's `UNITS` record.
3. Z stays relative.
4. View zoom/pan must never modify geometry.
5. Mask alignment transform is explicit and defaults to identity.
6. Cells define hierarchy scope; Layers is global.
7. Zero-width linework is not an operable mask.
8. The 3D focus region is render-only.
9. All four views derive from the same region-stack model.
10. Layers are referenced by stable internal ID, not by user-visible name.
11. Etch has no growth mode.
12. Base rebuilds remain reversible.

## Legacy code

Everything under `legacy/` is archival reference. It is not part of the deployment or active test surface. Do not reintroduce legacy APIs merely for compatibility.
