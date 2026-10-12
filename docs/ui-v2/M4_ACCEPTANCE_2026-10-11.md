# UI v2 Stage C / M4 acceptance — 2026-10-11

Branch: `codex/ui-v2-main-wip`; PR #177 remains Draft. This is a validation plan and evidence ledger, **not** a Stage C/M4 acceptance declaration. Do not merge to `main`, change the default entrance or approve a visual baseline based on CI alone.

## M2 visual contract

Preserve the reviewed M2 shell, light theme and four-width (1440/1024/768/390) organization. The Manual tab keeps Operation, Material / target, Thickness/depth and stepper, Layer name, Coverage, Active face, Area, Also add to Recipe, Input unit, wide Apply, form Undo/Redo, guide and footer. Material mapping remains a user decision: retain the disabled preview rather than creating a new material-to-layer mapping. Main view face and Process target face remain independent. No existing screenshot baseline was updated.

## M4 two-channel owners

| Channel          | Automated owner                                                  | Coverage / evidence limit                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy           | Existing Browser regression and targeted process-geometry checks | Old `app.html`; existing assertions and baselines unchanged; refer to run for the exact selected suites                                                                                              |
| v2 views         | Existing Main/Mask/Section and 3D Actions                        | Real M2-derived four-view controls, 1440/1024/768/390 and emulated touch                                                                                                                             |
| v2 Stage C       | `scripts/v2/check-sync.mjs`                                      | Real Mask-limited process, Main ROI, Section Detail, History/Recovery, Base, Recipe, Diagnostics, Project and full layout gate                                                                       |
| v2 interactions  | `scripts/v2/check-review-interactions.mjs`                       | Persistent Layers preference, rename, visibility and annotation controls                                                                                                                             |
| v2 real projects | `scripts/v2/check-m4-projects.mjs`                               | Separate real M3D/Photodetector/four-unit Metalens/full 6,400-tile Metalens array load, navigation, invariant physical model, display-unit round-trip and documented 0.1 nm Project export precision |

The dedicated `ui-v2-stage-c-m4.yml` workflow runs the Stage C and four-project owners on normal pushes and uploads reports/screenshots. It does not manually dispatch any expensive workflow. These owners deliberately report PASS/FAIL separately; a skipped or pending job is not acceptance. Full M3D heavy renderer performance, physical GPU pixel parity, genuine physical touchscreen gestures, all Recipe failure/rebuild and Variant branch editing paths remain separate explicit acceptance requirements.

## Manual visual and functional checklist

- [ ] Compare current M2 reference and integrated Manual/Project/Mask/History panels at 1440, 1024, 768, 390 pixels.
- [ ] Verify button icons, labels, panel arrangement, responsive overflow, insets and wide Apply with hands-on review.
- [ ] Confirm Polygon text-area editing across nm/µm/mm with an editor kept open and exact canonical geometry after Apply.
- [ ] Verify Base Shape rectangle/circle visual hiding, Material preview state and form stepper Undo/Redo.
- [ ] Complete all four real examples through Recipe failure/recovery, Mask GDS/OAS, History Variants and Section/3D export flows.
- [ ] Review touch on a physical touchscreen (Chromium emulation alone is insufficient).
- [ ] Review on a real discrete GPU; keep SwiftShader results explicitly labeled software-only.
- [ ] Ask for approval before creating any independent UI v2 screenshot baseline.

## Verified automation and acceptance boundary

The latest tested product revision is [`b127ce8`](https://github.com/Xiaolong-6/WaferCAD/commit/b127ce8d3976f47d74e5401f804f9b37d28a703a), on `codex/ui-v2-main-wip`, Draft PR #177. The [push run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38161658430) and [PR integration run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38161661083) both reported **Stage C/M4 PASS, zero failures**. Quality, 3D Phase B and preview were also green at this revision. These checks do not substitute for M4 user sign-off.

Automated coverage actually completed:

- 1440/1024/768/390 px plus 1024 px emulated touch: one shared model, three ROI domains, physical Mask-limited 0.125 µm Deposit, independent front/back Process face, History Undo/Redo/restore and full Project/Recovery/Recipe/Diagnostics sequence.
- Review-interaction owner: all responsive cases plus real Electrical controls and persistent display preferences.
- Four real projects: M3D (27 layers / 551 regions), Photodetector, TiO₂ four-unit Metalens and full 6,400-instance / 49-template Metalens array; import into integrated v2, Mask/Main navigation, display-unit cycling, model invariance and exact structure/identity with up to the documented 0.1 nm persistence quantum for numeric coordinates.
- M2 visual defect caught by inspection of the earlier CI screenshot: Diagnostics metrics/materials ran together. The `0440908` revision added M2-consistent metric rows, material card spacing and browser-computed layout checks. Its [passing Stage C run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38161396910) and screenshots verify that targeted repair.

The browser environment used by these reports is Linux Chromium 140.0.7339.186 / Playwright 1.55.1, Node 24; the WebGL renderer is software SwiftShader. No actual NVIDIA hardware frame/pixel parity is asserted. The 625-site edge-on and 625-site array stress jobs were **skipped by their Draft/CI routing policy**, and are not represented as green execution. Other pending manual checklist items above are explicitly excluded from complete M4 product acceptance. M2 visual baselines are unchanged, no default entry was promoted, and PR #177 must stay Draft until the user reviews the integrated workstation.

## M2 source-to-live chrome comparison (pending CI)

`scripts/v2/check-m2-live-parity.mjs` captures isolated M2 mock and integrated Manual panels at 1440/1024/768/390, and compares navigation order, font, workbench and inspector widths, desktop canvas-column origin and the M2 Manual field sequence. It records two screenshots per width under `test-results/ui-v2-m2-parity/` for reviewer comparison. It is a **structural and visual-review gate**, with no claim that live scientific canvas pixels should equal the prototype's schematic drawings. This paragraph records the test being added; its execution outcome must be checked on the next CI revision.

### M2 Manual thickness stepper visual defect — corrected in next code revision

A direct inspection of the 1440 and 390 px prototype-versus-real screenshots from `caf19b1` caught a discrepancy missed by the initial structure-only test: the real stepper applied the M2 two-column grid to the input `label` rather than its enclosing wrapper. That forced the label into a narrow column and stacked the decrement/increment buttons vertically. The following repair moves the unmodified labelled input and step buttons into an explicit `.p-stepper` wrapper, preserves Record/Lift-off hidden semantics and extends the browser parity gate to compare label-above-input and horizontally aligned +/- controls at all four widths. The new revision's CI outcome is pending and is not represented as a passing gate here.

### Project autosave ownership presentation — new targeted repair (pending CI)

M4 1440 px screenshots also showed the `Take over storage` warning in a freshly initialized ownable Project inspector. The workspace persistence controller correctly sets the conflict node's `hidden` property when this tab is writable, but the generic `.p-form { display: grid }` rule could override that attribute. The fix adds a scoped `#workspaceConflictDialog[hidden]` CSS hiding rule, and the M4 real-project browser owner now verifies that a fresh independent tab owns its autosave lease, sees no false conflict warning, and still renders the warning when the hidden flag is explicitly cleared. Multi-tab lease acquisition/reconciliation semantics and workers are unchanged.

### M2 Manual vertical rhythm / Area labels — new final layout gate (pending CI)

The manual screenshot comparison also identifies an approximately one-token gap missing between the real Process modes bar and the first Manual field. The integrated form now uses the existing `--wc-space-3` top gap, while `Selected Mask` and `Invert Mask` exactly match the approved M2 choice text. The browser comparison now checks the actual tab-to-first-label distance (2 px tolerance) and the Area choices; it does not introduce or rebaseline any screenshot. The preceding `003f9aa` functional Stage C/M4 run passed; this last spacing change must be assessed at its own revision.
