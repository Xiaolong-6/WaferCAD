# Mobile Workstation layout — 2026-10-13

## Scope and ownership

The production v2 entry is `site/app.html`. Compact viewports (up to 820 CSS px, following the existing `WaferCadV2ViewState.compact` policy) use a single active Workstation pane. No model, Recipe, History, persistent project, or Geometry Kernel schema is changed.

- **View**: the active scientific canvas occupies the Workstation's available height. The editor and primary domain navigation are hidden. `Edit workspace` restores the last selected editor.
- **Edit**: Project, Mask, Process, or History occupies the Workstation's available height below a stable domain navigation row. `View results` returns to the previous scientific view.
- Desktop preserves the side-by-side view/editor contract and independent inspector Hide/Restore behavior.

The compact pane is owned by `uiState.mobile` (`view | edit`). `presentation.editorHidden` derives from that value in compact mode. The desktop `uiState.editorHidden` flag remains independent so Hide/Restore on wide viewports retains its old behavior. Deep links that open Process explicitly restore that desktop flag.

## Layout and scroll contract

`workstation-v2.css` bounds the mobile Workstation to `100dvh` minus its shell margins, with the topbar, navigation and status as non-scrolling chrome.

Only one primary region scrolls at a time:

- Edit: `.p-panel-content` (or the bounded History/code child when its domain owns scrolling).
- View: `.p-stage`, only if the view contents cannot fit (e.g. Section with expanded legend).
- The document body is not a second vertical scroller in the mobile Workstation.

The former 390px editor canvas and fixed 480px inspector are deliberately removed from compact mode. Touch controls in primary navigation/view toolbar and scientific legend use a 44px minimum on coarse pointers.

## Rendering and DOM identity

`workstation-v2.js` keeps primary navigation buttons mounted between renders. A change of pane adjusts view adapter visibility without destroying mounted Main, Mask, Section, or Three hosts; adapters recover on the next View presentation. Main/Mask camera, ROI, in-progress drawing and Process draft values belong to their existing runtime/controller owners, not to the pane.

Height-only `resize` events, including browser chrome and virtual-keyboard height changes, do not trigger a complete Workstation render; CSS layout and existing canvas size observers respond. Width or compact-breakpoint changes still render to update view mode and navigation.

## Acceptance

The browser gate `scripts/v2/check-mobile-workstation.mjs` is executed by `ui-v2-main-mask.yml` and via `npm run test:ui:mobile` against the v2 test server on port 4182. It checks real `app.html` at 360×640, 390×844 and 430×932 for:

- Default View, first-screen edit access, Process form visibility, no document overflow.
- Process form internal scrolling with stationary navigation and >=44px coarse-pointer targets.
- Round trip preserving the Main canvas DOM identity and a Process draft field.
- Stable navigation node identity after rerenders, including a height-only viewport change.
- Bounded History scrolling and no uncaught page errors.

The CI runner is software Chromium; this gate does not certify hardware GPU performance. Mobile horizontal landscape, platform-specific virtual-keyboard occlusion (iOS Safari / Android Chrome), long History projects, and full interactive ROI parity still warrant device-level review before replacing any approved visual baseline.
