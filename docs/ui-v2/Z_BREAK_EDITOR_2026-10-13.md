# UI v2 — Z Break editor integration

Date: 2026-10-13. Base: production UI v2 on `main`. Branch: `feat/ui-v2-z-break-editor-20261013`.

## Scope and ownership

- `site/ui-v2/z-break-editor.js` creates the compact editor, validates typed boundaries, and handles presentation-only keyboard gestures. `z-break-editor.css` owns only its styling.
- `site/ui-v2/section-view.js` composes the editor inside the existing shared Floating Editor. No second popover/tooltip manager.
- `site/controllers/section-collapse-controller.js` exposes its existing physical range through a read-only `bounds()` method. Existing Z normalization, geometry-independent state, drag snap and Section/3D invalidation remain authoritative. This is not a new renderer.
- No kernel, serialization or GLB export change. The shared controller's linked-scale rule stays 1× for both faces; only unlinked scales are adjustable (0.1× to 10×).

## UX and accessibility

- Precision-first: Top/Bottom numeric inputs accept the current global length display unit, reject reversed/out-of-range values and preserve the canonical µm coordinates.
- Optional spatial interaction: ruler handles can drag and snap to nearby structural boundaries; handle keyboard arrows move by 0.1 µm (Shift by 1 µm). Numeric typing is never snapped.
- Preview is compact and labelled by physical Z ticks. The center highlighted interval is omitted from the display, not etched away.
- Advanced scaling defaults collapsed; linked mode shows a concise read-only `1×` instead of two disabled fields. Unlink reveals both editable fields.
- Enable-off keeps the previously configured values, greys the preview and disables adjustments; re-enabling restores them.
- 352px floating width, no new fixed height. The shared floating manager clamps/repositions on narrow screens.
- No help badges/icons or instructional paragraphs inserted into the UI. Explanations stay in element metadata.

## Tooltip migration

The contextual tooltip service is now present in `main` (formerly PR #189). This editor reuses the existing catalog/controller and does not create or modify another tooltip owner.

The editor uses the parallel branch's existing `data-help` keys (`section.zbreak`, `section.scale`) and `data-help-detail` descriptions on the original, keyboard-focusable controls. When the central catalog is present, the editor does not set duplicate native titles. Only isolated previews without the service use a native `title` fallback. Help copy stays in `data-help-detail` or the central catalog; **never** add local tooltip DOM or listeners.

## Verification

Existing v2 browser acceptance `scripts/v2/check-section-view.mjs` checks the real Section compositor across 1440/1024/768/390 and verifies Z toggle, Front scale and model preservation. This branch updates that gate for the collapsed Advanced UI and new dialog title. Run:

```bash
npm run check:ci
node scripts/v2/serve-v2.mjs
node scripts/v2/check-section-view.mjs
```

The server command runs in a separate terminal. Human acceptance remains required for visual matching, 360/390px spacing and hover after the tooltip branch is rebased/merged. Do not change approved screenshot baselines during this task.
