# M3 D1 implementation checkpoint — experimental real-view bootstrap

Date: 2026-10-10. Branch: `codex/ui-v2-m3-main-audit-20261010`. Pre-domain rollback point: `0fa32a75df234ca451dff085f16a7f961744a2bb`.

> **D1 IN PROGRESS — NOT ACCEPTED.** This checkpoint records a concrete opt-in real-view implementation and a new strict browser gate. It does not claim browser, pointer, visual or full D1 acceptance. No D2 work was started. The public `app-v2.html` remains the original M2 mock preview.

## Scope of implementation

- `site/app-v2-real.html`: isolated, opt-in D1 experiment with `html[data-ui=v2]`. Loads pinned Three importmap, existing product styles and v2 shell assets, then `real-view-bridge.js`. Does **not** change default `index.html`, existing mock entry, legacy `app.html`, visual baselines or deployment.
- `site/ui-v2/real-view-bridge.js`: fetches `app.html` as an inert DOM contract source and appends the legacy DOM to a hidden staging owner **without executing its bootstrap scripts**. Moves the **original** Main, Mask, 3D and Section panels, controls and canvas/stage nodes into one v2 workstation shell; records identity and verifies the four native stage nodes before/after the single real app module import. Domain adapters deliberately remain explicitly unconnected. Navigation, Single/Overview/Split, Section dock, responsive More owned by existing view toolbar, Split exchange and Max/Restore are wired to stable native buttons/canvases. Uses only existing `app.js` science and worker services: it does not reconstruct their algorithms or silently simulate success.
- `site/app.js`: v2-only conditional at the **permitted workstation startup/self-check seam** selects the pre-created v2 workstation bridge instead of initializing legacy Workstation. V2 only routes History→Process nav to the v2 bridge and avoids a second legacy maximize handler. Legacy path continues to invoke the original workstation, existing handlers and original self-check; no science/model/worker/IO/schema implementation is changed.
- `site/ui-v2/real-view-bridge.css`: experimental-only native view presentation sizing; no changes to M1.5 approved prototype or existing CSS.
- `scripts/v2/check-d1-real-views.mjs`: executable browser regression (owns its localhost server) that checks v2 route, no mock presenter, real source canvas IDs, four stages and original button identities, mode persistence, Split, Max/Restore, boot/console errors and screenshots at 1440/1024/768/390. It records local ignored evidence under `test-results/ui-v2-d1-real/`.

## Source and boundary checks actually performed

- GitHub connected source comparison: working branch started at **exact** `0fa32a7`; all D1 edits are on the requested existing branch, no force push.
- Confirmed all **17** referenced source/style/vendor resources for `app-v2-real.html` exist on the same branch.
- New classic bridge `real-view-bridge.js` parsed successfully with the local V8 syntax parser available in the connected tooling. This is **syntax**, not functional runtime evidence.
- Source-level review: the v2 switch in `app.js` is conditional on `html[data-ui=v2]`; legacy control flow remains in the `else` branch. Historical preflight at `0fa32a7` (585 Node, 60 shell, 8 contract, legacy suites) is *prior evidence*, **not** a new test pass for this D1 commit.
- Connected commit status check had **no CI statuses and no pull-request workflow runs** for the D1 head at inspection time. No manual or costly CI tasks dispatched.

## Acceptance currently missing / why it remains open

1. **Real browser bootstrap and true WebGL canvas:** a runnable checked-out repository/browser was unavailable to this ChatGPT execution environment. `node scripts/v2/check-d1-real-views.mjs` was **not executed**, nor were `npm ci`, lint, docs:check, contract refresh, GPU fallback, real screenshot/pixel or ROI physical-coordinate measurements. We must not infer they passed from static parsing.
2. **M1.5 chrome parity:** the experimental real route currently *adopts original native view-head toolbars* inside v2 layout. Final shared-toolbar component placement, overflow/icon alignment, popover focus/Esc/aria semantics and exact four-width approved prototype comparison remain to be audited/fixed in a real browser. No baseline has been created/updated.
3. **Pointer/DOMRect correctness:** real Main/Mask ROI and Section Detail/Slice interaction need the strict original 0.25px and µm geometry scenarios. Stage identity checks alone cannot prove pointer accuracy. 3D first complete frame and software-vs-hardware WebGL must be reported separately.
4. **Route convergence:** product `app-v2.html` deliberately remains mock. Move/retarget only after the isolated experimental route truly passes D1 acceptance. `startup-controller.js` and Welcome legacy URL cleanup remain D9 ownership; launching with a staged URL may currently rewrite the experimental path, so it is not approved as production routing.
5. **Hidden legacy contract:** controllers still require their 267 legacy IDs; importing existing DOM into hidden staging is a temporary bootstrap bridge, not complete removal/migration of all domain controls. Verify that dynamic dialogs/portal ownership and persistence does not act on hidden UI unexpectedly. Domain controls/transactions remain D2–D9.
6. **Generated contract delta:** changing scanned `site/...` source may modify generated DOM inventory; deterministic `node scripts/ui-contract-extract.mjs --check` must run before D1 acceptance and any generated drift must be resolved without obscuring the 14 previously traced unresolved operations.

## Commands for the executable D1 gate

Run on the **current D1 head** (not the historical preflight):

```bash
npm ci
node scripts/ui-contract-extract.mjs --check
node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs
npm run lint
npm run docs:check
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-real-views.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-m2-shell.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:workstation
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:smoke
```

Inspect `test-results/ui-v2-d1-real/real-{1440,1024,768,390}.png` against approved M1.5 screens. Run additional real pointer/ROI/Section/3D frame/overflow/focus assertions; do not silently downgrade geometry or visual thresholds. On any failure, fix on this same branch and rerun. Do not open D2 before an explicit D1 checkpoint and user approval.

## Decision / roll-forward

**No D1 PASS claim** is warranted yet. The experimental entry remains isolated so the previously accepted M2 mock and legacy real product are not silently replaced. After runtime tests and screenshot review, either promote the single real v2 bootstrap into `app-v2.html` (keeping an explicit mock route) or revert the D1 experiment to the recorded rollback commit if its shell/DOM approach proves unsuitable. Explicit user approval is still required before D2 and before any visual-baseline change/merge to main.
