# Mobile Workstation layout & gesture contract — revised 2026-10-14

**Current product contract:** The compact Workstation uses the native-document
scrolling and gesture ownership described below. This supersedes the original
2026-10-13 bounded-pane implementation; the date in the filename records the
first work, **not** an unmerged mobile rollout. The canonical production entry
is `site/app.html`. Compact layout changes must remain presentation-only:
Project, Recipe, History, scientific geometry, saved camera coordinates and
persistent scientific host identity are not rewritten by navigation.

## Architectural ownership

- `mobile-workspace-controller.js` owns production compact View/Edit navigation transitions,
  Mask-to-view coupling, cancellation of pending scroll restoration, and **per-domain
  document scroll positions**. It does not own desktop docking, scientific gestures,
  or business-model state. `workstation-entry.js` composes the controller and retains
  desktop-specific action routing.
- `workstation-v2.js` owns the stable Shell and scientific/domain adapter hosts.
- `mobile-workstation.css` is the **only owner of compact pane sizing, scrolling
  and chrome positioning**. `workstation-v2.css` keeps shared visual presentation,
  desktop geometry and mobile button styling; it must not redefine the mobile
  scroll layout.
- The responsive mode is decided from the CSS viewport width (<=820px), not
  `screen.width` or pointer type; coarse pointers adjust hit targets only.
- Read-only Welcome/embedded previews retain a separate fixed-frame canvas
  contract under `workstation-preview.css` and are excluded from this change.

## Mobile Edit: native document flow

- `document.scrollingElement` owns the ordinary vertical scroll. `body`,
  Workstation, inspector, content, History, Recipe steps and Recipe code panes
  are not bounded viewport-height vertical scrollers.
- The header, primary navigation, editor heading and status follow the
  document flow; they are **not** permanently pinned to a small viewport.
- History and Recipe can be long. List nodes expand naturally. A future
  History virtualization must listen to the document scroll, not add a bounded
  fixed-height inner panel.
- Text entry and true dialog surfaces may manage their own scroll/focus;
  a code editor may still capture normal text-edit gestures.
- Switch Edit -> View -> Edit restores the active domain's prior document offset.
  Switching Project / Mask / Process / History remembers separate offsets.
  Scientific hosts, drafts and camera state are not remounted.

## Mobile View: scientific gesture surface

- View is viewport-height (100dvh minus Shell margin) without an editor panel
  or pinned status footer. The single scientific canvas is the gesture owner.
- Main, Mask and Section (2D) default to **Pan + Zoom**.
- 3D defaults to **Orbit/Rotate + Zoom**; Pan remains an optional explicit mode.
- The scientific controllers own coordinate transforms, pointers, camera state,
  ROI/draw special modes and restoration. The layout layer must not synthesize
  or reinterpret these gestures.
- Returning to Edit restores native document scrolling; touching form content
  never activates a hidden scientific canvas.

Desktop, wide-screen split views and their independently scrolling inspector
remain unchanged.

## Current verification ownership and remaining device coverage

`scripts/v2/check-mobile-workstation.mjs` is the **targeted** production
compact-viewport acceptance owner (360×640, 390×844 and 430×932). Its
original release checkpoint covered:

1. Default View and one-click Edit, with persistent live canvas identity.
2. A long Process editor expands the document, without inspector internal scroll.
3. Emulated touch movement causes document scrolling and the nav moves with it.
4. View/Edit transitions restore document offset and preserve draft fields.
5. Domain-specific scroll restoration and History/Recipe/Code flowing contents.
6. Stable navigation identity and drafts through height-only viewport resize.
7. No horizontal overflow, no browser exceptions, and accessible 44px targets.
8. Initial Main/Mask/Section Pan+Zoom and 3D Orbit+Zoom state.

These are acceptance **scenarios**, not claims that the named browser run
passed on the current HEAD. For any change to compact layout or gestures,
inspect long imported History, multiple Recipe steps, keyboard/visualViewport
changes, real touch Pan/pinch/orbit, expanded Section legends, GPU context
recovery and Welcome Preview isolation. Automated Chromium touch emulation
is not equivalent to real iOS Safari or Android Chrome; preserve an explicit
physical-device evidence gap when that check was not performed. A green
behavioral gate does not by itself approve visual layout.
