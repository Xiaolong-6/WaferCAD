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

UI orchestration that does not own geometry lives under `site/controllers/`. Keep build/update checks, welcome startup routing, tab navigation, maximize behavior, and similar DOM coordination out of the main editor module when they can be expressed through narrow callbacks.

## Deployment

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages when `main` changes. The deploy job repeats the Quality checks and Chromium/product regression before publishing, so a failing editor build is not released.

There is no application build step.

## Current design contracts

1. XY geometry remains vector.
2. GDS XY is converted to canonical µm from the file's `UNITS` record.
3. The global XYZ display/input unit converts presentation values only; it must never rescale stored geometry.
4. X, Y and Z are stored as physical micrometre coordinates; view-only Z exaggeration must never feed back into process geometry.
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

Prettier 3.9.9 and ESLint 10.11.0 are development dependencies. New code should not add multi-statement compressed handlers. Large event handlers should be moved into named functions or focused modules instead of continuing the earlier single-file compression style. Controller extraction must preserve the canonical model/view contracts; do not move geometry semantics merely to reduce file size.

The formatter ignores `legacy/` and `site/vendor/`. Vendored code must not be reformatted locally.

## CI gates

Pull requests run the fast **Quality** gate and the permanent Chromium **UI smoke**. Parser/import changes additionally trigger the pinned KLayout GDS/OASIS compatibility workflow. Keep parser-only corpus work scoped so ordinary UI changes do not pay the full corpus cost.

## Product and process regression

See [Product review](PRODUCT_REVIEW.md) for the Chromium screenshot/interaction matrix, generated review artifacts, and reproduction commands. The permanent UI smoke job also runs this suite with real WebGL using the pinned Three.js package.

See [Process benchmarks](PROCESS_BENCHMARKS.md) for analytic step/trench/island geometry, both faces, Direct/Conformal/Grow/Etch checks, and explicit approximation boundaries. These tests run under `npm test`.

## UI visual system

WaferCAD should read as a compact engineering/CAD workstation rather than a collection of independent web cards. Preserve information density and layout geometry. New UI should reuse the existing visual hierarchy:

- scientific headers use the shared compact toolbar treatment;
- use borders sparingly; prefer surface contrast, spacing and active-state emphasis;
- fields and selects share the same compact control height, radius and focus ring;
- primary actions use the steel-blue accent; secondary/quiet actions remain neutral;
- tool tabs should not introduce per-tab boxed borders;
- semantic feedback colors are reserved for success, information/progress, warning and error states.

Do not create a one-off visual language for a new panel or control when an existing workstation control pattern fits.

