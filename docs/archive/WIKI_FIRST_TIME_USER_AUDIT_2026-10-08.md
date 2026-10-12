# Wiki first-time-user usability audit — 2026-10-08

## Audit scope and baseline

- Repository: `Xiaolong-6/WaferCAD`
- Base: `main` at `be2f6af190f20546ab15f9d4174ac496cc67b7f5`
- Working branch: `audit/wiki-first-time-usability-20261008`
- Reviewed: `docs/wiki/Home.md`, `Getting-Started.md`, `_Sidebar.md`, `Process-and-Recipes.md`, `Troubleshooting.md`, `Masks-and-ROI.md`, `Workspace-and-Views.md`, `History-Variants-and-Recovery.md`, `Import-and-Export.md`, the English Recipe tutorial, and the six-example catalog; compared against `site/app.html`, `docs/USAGE.md`, documentation/guide tests and the Wiki publishing workflow.
- Audience: a first-time user with no CAD/semiconductor-process vocabulary, then a technically literate user looking for a specific action or fix.
- This is a **source/documentation audit**. No live usability study or real-browser acceptance is claimed. Public GitHub Wiki publication, on-screen image layout and phone interactions were not independently verified in this session.

## Verdict

**Original manual: technically rich but a weak first session for a novice.** It correctly documents models, Recipe and scientific limits, but its landing page originally led with expert positioning, and the old Getting Started walkthrough required users to invent substrate/mask/film choices. Without numeric inputs and expected visual checkpoints, users could not tell an incorrect mask selection from a correct operation observed on the wrong cross-section.

The changes below produce a **plausible, testable guided route**. This is a documentation improvement, not yet proof that an untrained person will complete the workflow in ten minutes.

## Findings and disposition

| Priority | Finding from main                                                                                                          | Evidence                                                                                                    | Branch action / remaining gap                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | Landing page front-loaded technical scope and internal sync contract; no immediate low-commitment task.                    | `docs/wiki/Home.md` original layout.                                                                        | **Addressed:** task-based Home, direct app/tutorial/example routes, maintainers' contract moved below user guidance.                                                                               |
| **P1**   | The first draft incorrectly placed **Apply base** under Project and implied Base is automatically Si.                      | `site/app.html`: separate `#settingsTab`/`#baseTab`; `site/model.js` defaults to layer `Base`.              | **Corrected:** Welcome **Start empty**, Project **XYZ unit**, Base **Apply base**; tutorial explicitly states Base is generic geometry, treated as Si only for the exercise.                       |
| **P1**   | Getting Started had nine abstract choices and no specified values, no reliable success conditions.                         | `docs/wiki/Getting-Started.md` original steps 1–9.                                                          | **Addressed:** new `First-10-Minutes.md` with exact substrate, deposition, Draw mask, selective etch, per-step checks and export; Getting Started now routes to it.                                |
| **P1**   | Screenshot described a 2026-10-05 compact Process UI although main's 2026-10-08 workflow uses a single Operation selector. | `docs/wiki/Process-and-Recipes.md`; `site/app.html` contains `#operationType`.                              | **Addressed:** removed the misleading Process screenshot and aligned copy with Step-mode selector. Other dated snapshots should be checked visually when layouts change.                           |
| **P1**   | Troubleshooting presented unranked conceptual FAQs rather than symptom → input check → safe recovery.                      | `docs/wiki/Troubleshooting.md`.                                                                             | **Addressed:** mobile-readable symptom headings for wrong mask/area/face, lost oxide, section alignment, units, duplicated Recipe application and persistence.                                     |
| **P1**   | Border-only rendering artifacts and actual geometry corruption were easy to conflate.                                      | Main docs focused on visual toggles; field reports concerned internal seams in M3D.                         | **Addressed in guidance:** compare Border off, Section and ROI/opacity; preserve the exported project and exact step when a thin sheet persists. **No Kernel fix is implied.**                     |
| **P1**   | Mask ROI also clips Whole face in the current worker, contrary to the previous Wiki's Selected/Invert-only wording.        | `site/process-worker.js` applies the ROI limiter after resolving every Area mode; `docs/IMPLANT.md` agrees. | **Corrected:** Wiki masks, startup, troubleshooting, Process and repository usage docs; retained a test guarding this behavior. The UI's Whole face hint deserves a separate product-level review. |
| **P2**   | ROI vocabulary is cognitively expensive: Mask ROI changes patterned Process domain; Main ROI clips visualization.          | `Masks-and-ROI.md`; `docs/USAGE.md`.                                                                        | **Addressed:** highlighted at first contact, in Home/Getting Started/First 10 Minutes/Troubleshooting.                                                                                             |
| **P2**   | Save/Recovery versus Export had high data-loss potential for a newcomer.                                                   | `History-Variants-and-Recovery.md`; original Home.                                                          | **Addressed:** explicit Save/Export distinction in short path, landing page and rescue content.                                                                                                    |
| **P2**   | Generated 18-operation reference is accurate but dense for new users.                                                      | `Process-Operations.md` generated from `site/process-guide.js`.                                             | **Deferred:** keep the generated authoritative reference unchanged; use links from the beginner path, rather than hand-editing generated pages.                                                    |
| **P2**   | General onboarding remains English only; Chinese support focuses on Recipe scripting.                                      | `_Sidebar.md`, `Recipe-Code-Tutorial-zh-CN.md`.                                                             | **Open:** a native Chinese first-session guide can be added after terminology and walkthrough validation.                                                                                          |
| **P2**   | Real-browser and assistive-technology behavior of the published Wiki are unverified.                                       | Branch content and source tests alone cannot confirm hosting or visual display.                             | **Open:** test Wiki publication, desktop/mobile screenshots, keyboard navigation, alt text and a cold-start unassisted walkthrough after merge/publish.                                            |

## Acceptance checks

1. **Source truth:** Compare the tutorial's `#baseWidth`, `#baseHeight`, `#baseThickness`, `#maskSourceToggleBtn`, `#operationType`, `#operationArea`, `#growthMode`, `#etchTargetLayer`, `#operationThickness` and `#xyUnitSelect` against `site/app.html`.
2. **Navigation:** Home, sidebar, Getting Started and Troubleshooting must all link to `First-10-Minutes`. Existing Recipe tutorials and six-example catalog remain authoritative.
3. **Documentation gates:** run `npm run docs:check`, `node --test site/tests/wiki-manual.test.mjs site/tests/documentation.test.mjs`, and `npm run format:check`. The branch adds a beginner-control contract test plus an executable Kernel regression `site/tests/wiki-first-run.test.mjs`. Run both alongside the documentation checks in a checked-out workspace/CI before accepting.
4. **Real novice workflow (still required):** in a fresh browser/profile, make a 100 × 100 × 10 µm generic Base (assumed Si in the exercise), add a full-face 0.2 µm SiO₂ layer, draw a central rectangular mask, selective-etch the oxide 0.2 µm, align A–B through the window, export/reimport `.wafercad` and verify the step count and geometry.
5. **Publication check (after main merge only):** confirm the Wiki sync workflow succeeded, the sidebar leads to `First-10-Minutes`, SVG schematics load from `main`, and a mobile user can reach the whole walkthrough without special application knowledge.

## Verification performed in this audit

- Rechecked the actual Welcome **Start empty** link, Project New/Save/Export/XYZ unit controls, the separate Base tab, the Process selector and the Draw Rect toolbar against source. Corrected the novice tutorial and added a regression guard for that distinction.
- Added a Kernel-based numerical regression for the 200 nm oxide window. It is committed but must be executed in CI/a local checkout to confirm the real outcome.

- Compared the branch with the pinned main base: **13 changed paths** (11 documentation files and 2 tests), no changes to production geometry/kernel/runtime code.
- Fetched **14 Wiki pages** and inspected **106 relative Wiki link references** against their target pages: **no missing target among the checked references**.
- Confirmed that all **11 UI control IDs** used by the beginner regression contract exist in the main-derived `site/app.html`.
- Confirmed that both new tutorial SVG images and its existing Photodetector thumbnail are present in the repository.
- **CI evidence:** the first PR #156 Quality run failed at `docs:check` because this audit file was not linked from `docs/README.md`. The missing link was added to the documentation map and a new CI run was triggered; its result must be checked before claiming success. Prettier and a real-browser usability session remain separate acceptance gates.

## Follow-up suggestions

- Observe at least three new users completing the steps without spoken hints; record the first point of confusion and task completion, rather than declaring the guide beginner-friendly from the author's perspective alone.
- Replace older dated UI screenshots with current captures **only after** comparison with the deployed app. Do not relabel obsolete baselines as the live interface.
- Consider adding a one-click built-in tutorial project or a UI tour with real checkpoints after the text guide is validated. That should be a separate product change, not hidden in a documentation branch.
- Keep source links, scientific caveats and Recipe parser details for advanced users; preserve novice-friendly task routing on Home.
