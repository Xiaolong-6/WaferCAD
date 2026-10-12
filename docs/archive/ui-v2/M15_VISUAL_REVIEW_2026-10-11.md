# M1.5 visual comparison — Windows, 2026-10-11

## User review: FAIL against approved M2 layout

The user rejected the real D1 layout on 2026-10-11: it differs substantially from the M2 layout they approved. This supersedes any favorable interpretation of the initial findings below. The comparison target must include the later accepted M2 presentation and repairs in [UI acceptance](UI_ACCEPTANCE_2026-10-10.md) and the current `app-v2.html` shell, rather than using the early M1.5 prototype alone.

Confirmed discrepancies: M2 requires icon-only Fit/Pan/Zoom in all four view headers, while real D1 desktop headers restore visible labels; M2 narrow Section places the legend below the plot, while real D1 retains a right-hand legend that squeezes the plot; real D1 substitutes unconnected domain placeholders for the approved editor panels. The last item is an integration boundary, but still prevents full layout/user-journey acceptance. Green canvas containment and browser assertions do not close these discrepancies.

The local service exposes `app-v2.html` for the M2 shell comparison and `app-v2-real.html` for the real candidate. Neither this review nor the user's rejection authorizes baseline replacement, route promotion or merging. No product repair has yet been made at this checkpoint.

Product revision: `da37fe4d217d26f23941144908f5abe9d4dc784c`, branch `codex/ui-v2-m3-main-audit-20261010`, Draft PR #175. This is a review checkpoint, not final human sign-off. No product source or approved baseline changed.

## Reproduction and evidence

Windows, Node v24.16.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186 / Three 0.179.1. `npm ci`: exit 0, 81 packages, zero reported vulnerabilities.

Set `WAFERCAD_THREE_DIR` to `node_modules/three`. Run `node scripts/v2/check-d1-real-views.mjs` with `WAFERCAD_D1_FIXTURE` unset, `photodetector`, and `m3d`, sequentially. All three commands exited 0: 12 fixture/width cases at 1440/1024/768/390, original canvas ownership, pointer ROI, layout and reload assertions, no captured page/console errors. This repeats the real-view runner only, not the extended or camera suites. Headless WebGL evidence does not establish hardware acceptance.

Real screenshots and JSON are under ignored `test-results/ui-v2-d1-real`, `ui-v2-d1-real-photodetector`, and `ui-v2-d1-real-m3d`. Existing reference captures show the prototype's initial Overview/editor state; they must not be treated as matched Single/results comparisons.

Run `node scripts/v2/capture-m15-review.mjs` for 24 additional prototype screenshots (two imported families × four widths × Main/3D/Section), exit 0. This selects Project and Single/results states through prototype controls and captures only the workbench, excluding the font comparison appendix. Output is ignored `test-results/m15-visual-review`. Prototype data and scientific drawing remain unchanged. Screenshot success alone is not interaction acceptance.

For concurrent human review: `node scripts/v2/serve-v2.mjs`; real route `http://127.0.0.1:4182/app-v2-real.html`, approved prototype `http://127.0.0.1:4182/ui-v2/prototypes/a-full/index.html`. The default `/app-v2.html` route is the mock shell, not this real-view candidate.

## Initial visual findings

Directly inspected: Base Main/Section at 1440/390; Photodetector Main at 390, 3D at 1440 and Section at 768; M3D Main at 1024 and Section at 390; matching prototype Main at 1440/390 and Section at 768. Other generated screenshots remain available for human review; this checkpoint does not claim every screenshot has been inspected.

| Finding                                                                                                       | Assessment                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light chrome, blue selected controls, outlined panels and four primary workspaces                             | Recognizably follows A. Actual navigation uses one row with quieter text controls and icon-only Hide, unlike the earlier prototype. This is recorded M2 visual polish, not a new regression.                              |
| Real Main toolbar adds Slice and explicitly names 3D ROI                                                      | Necessary original workflow semantics differ from simulated ROI. Narrow Pan/ROI actions are collapsed into More; confirm discoverability during human review.                                                             |
| Real Section toolbar includes Auto/physical scale and Display, with abbreviated title/icon buttons at 768/390 | Real scientific controls increase density. The 390px screenshot leaves a narrow plot beside the layer list; M3D labels are heavily truncated. Usability/readability needs human judgment, even though containment passes. |
| Real scientific axes, A–B handles, rough boundaries, annotation gradients and layer legends                   | Expected differences from the prototype's schematic bands and fixed 3D thumbnail. Do not seek pixel equality by altering physical geometry or renderer scaling.                                                           |
| Project dock says “This domain is not wired in D1”                                                            | Full prototype editor/user-journey parity cannot be signed off on this route. This is the documented D1 integration boundary; later domain wiring is separate work.                                                       |
| Tiny pale header status mark, truncated phone project title                                                   | Visible in current captures; inspect intended status semantics and title access on device. No cosmetic repair made during this review.                                                                                    |

## Acceptance boundary

Capture and initial visual comparison complete; final M1.5 acceptance remains pending concurrent user review, including More discoverability, narrow Section legibility, and original Slice/Mask/ROI/Detail/Z Break workflows. No claim of full editor parity, independent frame pixel repeatability, Windows actual hardware GPU acceptance, or production route readiness. Keep PR Draft and preserve approved baselines.
