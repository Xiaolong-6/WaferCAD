# UI v2 Stage C / M4 acceptance — 2026-10-11

Branch: `codex/ui-v2-main-wip`; PR #177 remains Draft. This is a validation plan and evidence ledger, **not** a Stage C/M4 acceptance declaration. Do not merge to `main`, change the default entrance or approve a visual baseline based on CI alone.

## M2 visual contract

Preserve the reviewed M2 shell, light theme and four-width (1440/1024/768/390) organization. The Manual tab keeps Operation, Material / target, Thickness/depth and stepper, Layer name, Coverage, Active face, Area, Also add to Recipe, Input unit, wide Apply, form Undo/Redo, guide and footer. Material mapping remains a user decision: retain the disabled preview rather than creating a new material-to-layer mapping. Main view face and Process target face remain independent. No existing screenshot baseline was updated.

## M4 two-channel owners

| Channel | Automated owner | Coverage / evidence limit |
| --- | --- | --- |
| Legacy | Existing Browser regression and targeted process-geometry checks | Old `app.html`; existing assertions and baselines unchanged; refer to run for the exact selected suites |
| v2 views | Existing Main/Mask/Section and 3D Actions | Real M2-derived four-view controls, 1440/1024/768/390 and emulated touch |
| v2 Stage C | `scripts/v2/check-sync.mjs` | Real Mask-limited process, Main ROI, Section Detail, History/Recovery, Base, Recipe, Diagnostics, Project and full layout gate |
| v2 interactions | `scripts/v2/check-review-interactions.mjs` | Persistent Layers preference, rename, visibility and annotation controls |
| v2 real projects | `scripts/v2/check-m4-projects.mjs` | Separate real M3D/Photodetector/four-unit Metalens/full 6,400-tile Metalens array load, navigation, invariant physical model, display-unit round-trip and documented 0.1 nm Project export precision |

The dedicated `ui-v2-stage-c-m4.yml` workflow runs the Stage C and four-project owners on normal pushes and uploads reports/screenshots. It does not manually dispatch any expensive workflow. These owners deliberately report PASS/FAIL separately; a skipped or pending job is not acceptance. Full M3D heavy renderer performance, physical GPU pixel parity, genuine physical touchscreen gestures, all Recipe failure/rebuild and Variant branch editing paths remain separate explicit acceptance requirements.

## Manual visual and functional checklist

- [ ] Compare current M2 reference and integrated Manual/Project/Mask/History panels at 1440, 1024, 768, 390 pixels.
- [ ] Verify button icons, labels, panel arrangement, responsive overflow, insets and wide Apply with hands-on review.
- [ ] Confirm Polygon text-area editing across nm/µm/mm with an editor kept open and exact canonical geometry after Apply.
- [ ] Verify Base Shape rectangle/circle visual hiding, Material preview state and form stepper Undo/Redo.
- [ ] Complete three real examples through Recipe failure/recovery, Mask GDS/OAS, History Variants and Section/3D export flows.
- [ ] Review touch on a physical touchscreen (Chromium emulation alone is insufficient).
- [ ] Review on a real discrete GPU; keep SwiftShader results explicitly labeled software-only.
- [ ] Ask for approval before creating any independent UI v2 screenshot baseline.

At product revision \`b68d1c8\`, two independently triggered Stage C/M4 CI runs completed with zero failures: Main/Mask/Section real synchronization at 1440/1024/768/390 and emulated touch, History/Recovery/Recipe/Diagnostics, interaction regressions, and all three real project load/unit/export cases. GitHub Actions: [Stage C/M4 run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38160936189). Quality and small-model 3D were green at the same revision. These are **browser/software-WebGL gates**, not hardware sign-off. A visual review of the 1440px CI screenshot then found cramped Diagnostics presentation; subsequent M2-aligned CSS and a computed-layout assertion address it, pending the next CI result.

The Stage C code corrections and new gate are tracked as subsequent PR #177 commits. Record the exact green commit and run links here when tests actually finish; do not treat this document as evidence of unrun tests.
