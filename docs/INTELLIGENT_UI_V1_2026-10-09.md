# Intelligent UI v1 — implementation and review contract (2026-10-09)

Target branch: `refactor/intelligent-ui-v1`. Base: `main` at `d58b4741b2511e5ce8f18959feee58dc4c25c6b6`.

## Purpose

Make the WaferCAD workstation read as one application rather than a collection of independently styled tools. Scientific geometry, renderer algorithms, storage schema and example files are explicitly out of scope.

## Interface architecture

1. `site/intelligent-ui.css` is a scoped presentation system. It defines the shared palette, type scale, spacing, layout surfaces, responsive inspector and command interface. All new rules are guarded by `html.intelligent-ui`; Welcome project-thumbnail previews retain their original unobtrusive rendering.
2. `site/intelligent-ui.js` owns high-level discovery and presentation state only: context-aware command search, desktop inspector docking and panel overflow behavior. It sends actions to the existing `workstation-ui.js` controller rather than mutating underlying model data or manufacturing duplicate buttons.
3. `site/workstation-ui.js` retains canonical view/layout actions and the five tool sections. Sections are now exclusive: one active Project, Base, Mask, Process or History workspace at a time. Project is the initial section. The old scroll-position-as-navigation observer, synthetic scroll tail and programmatic scrolling were removed. Rail buttons are navigational modes, and the panel can be collapsed/expanded in both docked and overlay layouts.
4. `site/app.html` includes the stylesheet in the boot gate so the legacy, unstyled shell is never shown before the application is ready. `site/app.js` initializes Intelligent UI after the existing workstation controller.
5. At desktop widths >=1180 CSS px, the inspector sits alongside the scientific canvas instead of obscuring it. A Dock/Undock control allows users to choose. Below this breakpoint, the panel uses the existing dismissible flyout. The preference is session-scoped and does not enter the project file.
6. Ctrl/Command+K opens an accessible action picker. Search finds views and functions. Enter performs the **real workstation action**, Escape closes without dismissing the inspector, and the action picker is inert until explicitly invoked.

## Quality/interaction requirements

- Four scientific views preserve their native IDs, canvas hosts, ownership, Max/Fit/ROI/Border tools, Z Break and source modes.
- The Process selector and Recipe edit/run contract remain unchanged. Choosing a new tool never performs Apply, clears the Recipe, creates History or changes saved geometry.
- The first-time Project panel, History navigation, full desktop/laptop/phone responsive modes, and keyboard actions must be operable without horizontal clipping.
- Popup focus and cancellation must be safe. No duplicated legacy handlers, no duplicate DOM controls for a scientific command.
- Run `npm run check:ci`, `npm run test:ui:intelligent`, `npm run test:ui:view-ux`, `npm run test:ui:workstation`, `npm run test:ui:interaction` and Process Recipe safety checks before acceptance. Compare 1440/1024/390 screenshots to the intended visual hierarchy, not only DOM selectors.
- Verify with a real M3D or Photodetector example before promoting to production.

## PR preview infrastructure

`.github/workflows/intelligent-ui-review.yml` builds the standalone `site/` application and uploads a reviewable static bundle alongside Chromium screenshots. The GitHub Pages production workflow is restricted to `main`; deploying a PR into that environment would overwrite production. The preview workflow deliberately **does not** call `actions/deploy-pages`. A distinct live preview host is necessary to provide a web URL without affecting production. CI artifacts are not a claim of live deployment.

## Evidence boundaries

The connected GitHub write API was available during implementation, but opening a runnable DevSpace checkout failed and the local container could not resolve github.com. Source changes are committed; no local Node/Chromium pass or actual screenshot inspection is claimed. Only a passing relevant GitHub Actions run and its artifacts constitute runtime evidence. Review PR must remain unmerged until the real browser and visual acceptance are complete.

## Next consolidation

This is the first broad visual and interaction architecture migration. Remaining work before calling the **entire** product UI fully reconstructed: rationalize legacy `style.css` and `workstation.css` into non-overlapping component ownership; remove retired styles only after image-baseline parity; evaluate all Process/Recipe states and History restoration flows with real examples; update user-facing Wiki screenshots and documentation after the design is accepted.
