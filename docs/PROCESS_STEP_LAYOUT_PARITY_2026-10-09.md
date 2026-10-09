# Process Step layout parity — 2026-10-09

> Branch-local UI follow-up. This document records implementation scope and outstanding tests; it is not an accepted visual baseline.

Repository: `Xiaolong-6/WaferCAD`  
Branch: `fix/process-step-layout-parity-20261009`  
Base: `main` at `cfc624b9b1b99d25ef504a1b5d692cda9484b937`  
Publication: **feature branch only; main unchanged by this work**.

## Context / root cause

The earlier Process workflow v2 implementation replaced the six-button Operation mode control with a select, collapsed the diagram, and introduced the safe Recipe template flow. It did not implement the approved Step layout mock-up: Surface remained in a separate context row, the fields inherited old compact grid ordering, and no operation-specific parameter heading existed. This follow-up repairs the actual markup and layout.

## Changes

- Operation and Front/Back **Surface** are native selects side by side, using the existing `activeFace` state, now synchronized by `onchange`.
- `#processParametersHeading` changes to Deposit/Extend/Etch/Implant/Electrical/Record parameters, or Transfer parameters when that submode applies.
- Area and active material/name/target take the full row; Coverage and Thickness occupy the same row for deposition/extension. Thickness spans the row in operations without Coverage; other Process-specific fields retain their existing conditional behavior.
- The Process summary remains available to assistive technology while the visual heading is simplified.
- The Process guide shows `How <Operation> works` and an explicit Show/Hide guide affordance; the existing diagram catalog and full guide link stay intact.
- **Also add to Recipe** defaults to *unchecked*, requiring opt-in before successful Step operations append to Recipe. History recording is unchanged.
- Workstation, narrow Product Layout and static markup tests now use the Surface select and check layout structure. The Workstation browser test checks element bounding boxes and operation-dependent fields.

## Verification performed

- Source-level contract audit: 12/12 checks passed for controls, field hierarchy, state bindings and test updates at the tested branch snapshot.
- JS/MJS syntax-only parse: 7/7 edited modules and scripts passed. This is not an executed Node test suite.
- GitHub comparison showed `behind_by = 0` against `main` at audit time.

**Outstanding:** Execute `npm run check`, `node scripts/workstation-regression.mjs`, `node scripts/process-geometry-regression.mjs`, `node scripts/process-recipe-safety-regression.mjs`, and `node scripts/product-layout-regression.mjs` in a runnable checkout with pinned dependencies, local app server and Chromium. Capture Step Deposit/Extend/Etch and Recipe at normal, compact and phone widths. Confirm no label clipping, no unexpected field reordering and correct History/Recipe behavior. The current environment could not fetch the repository over git to run the browser checks; no CI-green or visual-acceptance claim is made.

Do not merge before checking the actual screenshots and green runtime tests. A full Renderer benchmark is unnecessary for this CSS/control-only change.


## Integration update

This source branch has been integrated with View UX v3 into `feat/view-ux-v3-unified-20261009` for PR #158. The original branch-base and standalone verification statements above are historical; the combined result requires current-main review, Quality, browser interactions and desktop/phone screenshots before merging to `main`.
