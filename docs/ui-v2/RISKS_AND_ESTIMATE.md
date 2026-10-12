# UI v2 Risks and Effort Estimate — M0

Baseline: `fbbb2f9f3a585574e20ed706c34653164f13440c`. Estimates derive from source coupling and the planned acceptance scope; they are **not schedule commitments**. Prototype iterations and time awaiting user approval are excluded. The source tree contains 31 controllers; this does not mean all 31 core modules require rewriting.

## Migration scope

- **Assembly layer:** In addition to the five explicitly rewritable functions, replace initialize/bind scroll navigation, Split title selectors, Section dock, resize/compact state, project-name synchronization, and custom events. The old Workstation is approximately 780 lines; new assembly/templates/navigation are estimated at roughly 600–1,000 lines total. Do not simply append another CSS override layer.
- **DOM-heavy domains:** Prioritize six generators: Recipe, Project/History, Mask browser, Layer legend, Draw editor, and Confirmation. The 56 dynamic DOM ID declarations/calls are not all simultaneously present; variable expressions need per-domain interpretation. Model Step ID assignments are excluded from DOM counts.
- **Direct DOM/navigation adapters:** Estimate 18–24 controllers or UI adapters, plus the app.js/Welcome entry layer. Change DOM references, component class names, focus/ownership, and navigation callbacks only; do not migrate transactions, scientific operations, file algorithms, or recovery algorithms.
- **Read-only services:** Use existing APIs for Process workers, model, project/schema/IO, snapshot graph, persistence, renderer, and parser. The explicit prohibited-change list takes precedence over general permission to update controller DOM binding.
- **Regression:** v2 needs its own bootstrap/locator adapter and the ten planned test categories. Reuse existing scientific assertions and retain legacy-entry results. Recipe security and Section/Z Break require cross-domain tests, not screenshots alone.

## Risk priorities

| Risk | Severity | Success evidence |
| --- | --- | --- |
| Missing references or duplicate bindings caused by assembly order | High | Independent factory and startup guard for the new entry; all controls created before binding; no console errors; one Apply commits exactly one Step. |
| Panels at 1440/1024 compete with the scientific canvas; mobile cannot finish edit → view | High | M1.5 four-width review on real projects; dense Recipe/History and expanded popup states remain operable. |
| Recipe/History dynamic DOM loses stable Step/Variant identity | High | Complete edit, Run to Step/Run All, failure location/continue/rebuild, Variant origin tree and restore scenarios. |
| Canvas reparenting, resize or More changes pointer coordinates | High | Strict geometric/pixel consistency of Main/Mask/Section/3D ROI, Slice, detail drag and maximize. |
| Unintended changes to localStorage/sessionStorage or entry-URL semantics | High | Preserve original keys and storage scope; verify v2 URL startup, refresh, recovery, multiple tabs and staged starts. |
| Confusing material palette colors with UI tokens, or letting display scale change physical units | High | Separate scientific-data colors from UI colors; retain µm assertions in model/export/History. |
| Dialog/portal ownership, Escape or focus conflicts | Medium–High | Combined tests for nested More, native Section modal, Confirmation and worker task. |
| Treating a static inventory as completion evidence | Medium | Label unresolved expressions; verify runtime; record functional, visual and workflow acceptance separately. |
| Assertion drift from duplicate legacy/v2 scripts | Medium | Shared assertion owner; vary only entry and selector adapters; explicit v2 startup guard. |
| Publishing a preview/visual baseline too early or contaminating legacy | Medium | Isolated host/directory; request explicit approval for baseline and default entry separately at M4/M5. |

## Phase estimates

| Phase | Implementation and verification (equivalent single-person workdays) | Principal uncertainty |
| --- | --- | --- |
| M1 | 1–2 | Component focus/error states and font approval. |
| M1.5 | 3–5 | Two to three layouts, two Recipe positions, genuinely complex data, four-width screenshots and user iterations. |
| M2 | 2–4 | State ownership and shared view templates, preventing duplicate legacy assembly. |
| M3 | 7–12 | Nine domains requiring dual acceptance, dynamic templates and popup lifecycle; read-only coupling may increase time. |
| M4 | 3–5 | Ten categories across both entries, real-project workflows, environment differences, strict ROI and recovery checks. |
| M5 | 1–2 | Isolated host, user approval, cleanup, specifications and handoff. |

Remaining total: approximately **17–30 workdays**, delivered in reviewable phases. Re-estimate if core changes become necessary, hardware-specific discrepancies appear, or prototypes require multiple rounds of reselection. Do not promise early completion based on CSS line count or DOM ID count.
