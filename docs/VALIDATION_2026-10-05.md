# Local integration validation — 2026-10-05

Tested product revision: `ec5edba` on `refactor/automated-test-architecture`. Documentation and accepted reference images were added afterward without changing application behavior.

## Integrated work

- Automated-test architecture and local stabilization, including locked Playwright/Three dependencies (`e76beb7`).
- Implant ROI cut faces and shared depth gradients from `fix/3d-implant-cut-gradient-sync` (`007e565`, merged in `c116db3`).
- Photodetector directional-cap and Section partition-seam fixes from the extra `fix/photodetector-section-artifacts` commit (`57d2dd0`, merged in `ec5edba`), including its revised fixture and scientific contracts.

The collapse contract now verifies a sub-1 nm surface guard and preserves interval width. Circular-trench contracts verify no directional cap on sidewall surrogates and correct deposition on both horizontal surfaces. Fully buried Extend rejection uses conformal coverage so the target sidewall is actually covered.

## Executed gates

| Check                          | Result                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `npm run check`                | lint, format, 312/312 Node tests passed; no skips                                    |
| `npm run test:ui:fast`         | smoke, workstation, resilience passed                                                |
| `npm run test:ui:state`        | History and persistence passed                                                       |
| `npm run test:ui:geometry`     | process and interaction passed                                                       |
| `npm run test:ui:review`       | examples, layout and renderer passed                                                 |
| Layout review                  | 109 captures                                                                         |
| Renderer review                | 14 captures; Implant ROI gradient, transparency and Etch visibility contracts passed |
| Five Windows visual references | generated and compared in two subsequent runs; both passed                           |

The four UI groups ran together through `npm run test:ui:all`. Environment: Windows, Node 24.16.0, Playwright 1.55.0, Chromium 140.0.7339.16, Three 0.179.1 served from `node_modules/three`.

## Accepted visual references and limits

The user accepted the five Windows references on 2026-10-05. The Photodetector fix changed its Section image by 3.7203% against the earlier reference, including the auto-display scale moving from Z ×200 to Z ×213. That expected old-reference failure was reviewed; the new image was accepted separately. The new reference was not substituted to conceal an unexplained failure.

Approved images are committed under `tests/visual-baselines/windows-chromium/`. Use the explicit baseline directory described in [Testing](testing.md). These images establish accepted content and repeatability on the recorded Windows environment, not universal raster stability.

Linux Chromium has not been run in this local environment: WSL and Docker are unavailable. Visual comparison remains outside `test:ui:all` and CI; 3D/WebGL has structural/runtime gates and review captures rather than a pixel gate. A Linux baseline needs generation, repeated comparison and human acceptance before enabling a Linux visual CI gate.

Local logs and full galleries remain ignored artifacts: `test-combined-*.log`, `test-results/product-review/`, and `test-results/visual-review-combined-fixes/`. They are not required to reproduce the committed checks or accepted Windows references.

## Pre-publication audit

Canonical Prettier comparison found no substantive application change in the 48 product files formatted by the stabilization commit. The two requested fix branches account for subsequent intentional product changes. Literal relative module imports resolve; documented npm commands exist; no transient `npm install --no-save` setup or active self-test monolith remains. Product, browser and KLayout workflows retain distinct responsibilities. Newer code changes require their own verification.
