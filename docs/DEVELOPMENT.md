# Development

## Active application

The active product is entirely under `site/`.

Do not add runtime dependencies on the archived Python backend or the archived static client.

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

- `npm run lint` — ESLint over the active JavaScript only; `legacy/` and vendored code are excluded.
- `npm run format` — Prettier rewrite for the active application and current documentation.
- `npm run format:check` — CI formatting gate for new/refactored project-IO/schema code and current docs.
- `npm test` — vector/GDS/project-schema smoke tests plus focused regression tests for XY units, GDS error handling, project files, and snapshots.

The project-IO/schema path is intentionally separated from `app.js`: project files are fully validated before editor state is replaced.

## Deployment

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages when `main` changes.

There is no build step.

## Current design contracts

1. XY geometry remains vector.
2. GDS XY is converted to canonical µm from the file's `UNITS` record.
3. The global XY display unit converts only presentation/input values; it must never rescale stored geometry.
4. Z stays relative.
5. View zoom/pan must never modify geometry.
6. Mask alignment transform is explicit and defaults to identity.
7. Cells define hierarchy scope; Layers is global.
8. Zero-width linework is not an operable mask.
9. The 3D ROI is render-only.
10. All four views derive from the same region-stack model.
11. Layers are referenced by stable internal ID, not by user-visible name.
12. Structure colors come from curated or generated harmonious palettes; arbitrary color-picker input is intentionally hidden.
13. Etch has no growth mode.
14. Base rebuilds remain reversible.
15. Snapshots are independent immutable workspace state; snapshot records must not recursively contain snapshots.

## Legacy code

Everything under `legacy/` is archival reference. It is not part of the deployment or active test surface. Do not reintroduce legacy APIs merely for compatibility.

## Source style

Prettier 3.9.9 and ESLint 10.11.0 are development dependencies. New code should not add multi-statement compressed handlers. Large event handlers should be moved into named functions or focused modules instead of continuing the earlier single-file compression style.

The formatter ignores `legacy/` and `site/vendor/`. Vendored code must not be reformatted locally.

## CI gates

Pull requests run the fast **Quality** gate and the permanent Chromium **UI smoke**. Parser/import changes additionally trigger the pinned KLayout GDS/OASIS compatibility workflow. Keep parser-only corpus work scoped so ordinary UI changes do not pay the full corpus cost.
