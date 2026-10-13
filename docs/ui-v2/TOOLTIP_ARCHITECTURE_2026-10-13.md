# Contextual Tooltip Architecture

Date: 2026-10-13. Scope: current production UI v2 at `site/app.html`.
Implementation branch: `feat/ui-v2-contextual-tooltips-20261013`.

## Contract

Tooltips attach to existing controls using `data-help`. Never insert a
help icon, question mark, information badge, or extra clickable control.
Tooltips contain a short English title and a useful description. Their
content is plain text, and they cannot receive pointer events or focus.

- `tooltip-catalog.js` owns stable English help keys, descriptions, and
  safe state-dependent content for Process face, area, thickness and 3D quality.
- `tooltip-controller.js` owns one tooltip DOM node and delegates mouse
  and keyboard focus events. It never mutates the scientific model.
- `native-components.js` suppresses browser-native `title` attributes
  on elements created with `data-help`.
- `workstation-v2.js` creates and destroys the service with the Shell
  and hides open tooltips when the Shell rerenders.
- Existing Main, Mask, 3D, Section, Process, Project and History owners
  opt into help without creating competing overlay managers.

A trusted dynamic detail can be specified as `data-help-detail`. The
content is rendered with `textContent`, never HTML. Do not populate it
from imported project names or untrusted layout input.

## Interaction

Mouse hover opens after approximately 450 ms. Keyboard focus opens
immediately without moving focus. Mouse exit, focus exit, pointerdown,
Escape, scrolling, resizing and rerendering close the tooltip. Touch and
pen contact do not activate hover text. The service appends its description
ID to existing `aria-describedby` values and removes only its own ID.

Tooltips use a fixed document-level surface, clamped to the viewport.
This surface is noninteractive and does not add a button, an arrow, a
pseudo-element affordance, or a new layout slot.

## Coverage

P0 coverage includes view modes and tools, Main ROI and A-B slice,
Mask source/Draw/ROI/alignment, 3D render policy and visual controls,
Section Z Break, detail inspection and color-picker swatches, Process face/area/depth/Apply,
Project Base actions, History restore/branch/delete and Recovery actions.
P1 covers morphology parameters, cell and layer browser controls, and
annotation visibility/profile choices.

Existing native titles on unrelated labels, full process guides, and
scientific canvas pixels remain outside the tooltip rollout.

## Validation

- `node --test site/tests/v2-tooltip-catalog.test.mjs`
- `node scripts/v2/check-tooltips.mjs` with the v2 server on port 4182
- Existing Main/Mask/Section browser acceptance
- `npm run check`

The browser gate checks desktop/tablet/phone viewports, hover and focus,
keyboard Escape, resize dismissal, Process Both semantics, accessible
descriptions, and that no extra graphic/control is added. These tests
do not constitute approval of visual positioning in every environment.

Do not modify visual baselines, kernel geometry, serialization, or
renderer state to satisfy Tooltip tests.
