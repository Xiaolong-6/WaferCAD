# PR #161 Postmortem — M0

Review date: 2026-10-09. Main baseline `fbbb2f9f3a585574e20ed706c34653164f13440c`; PR head `9dda779b7c74c83bbef9e8e7fcdbd8cc5d9682dd`; test merge `a1db8154fb75344e9fb842dda42ce46c1b41d2bb`. Evidence came from the [PR description and diff](https://github.com/Xiaolong-6/WaferCAD/pull/161), discussion API, workflow steps and full logs for two failed jobs. At review, the PR was Open / Draft / REJECTED, unmerged, with 14 changed files, 1,151 insertions and 80 deletions. The comments endpoint returned an empty list; no additional review discussion was available.

## Conclusion

There were three independent failure layers: unfinished workspace information architecture, unusable responsive layout and acceptance tests that omitted realistic user workflows. CI subsequently confirmed concrete interaction and formatting failures. The rejection cannot be reduced to "CSS aesthetics"; passing a dedicated screenshot script did not establish product acceptance.

## Verifiable evidence

| Problem | Evidence in description/diff/log | Consequence for r2 |
| --- | --- | --- |
| Empty desktop panel consumed scientific viewing area | The PR author's review recorded a 344 px inspector and 52 px rail, while empty History occupied only a small card. `wc-tool-width` / `wc-rail-width` in the diff were 344/52; the docked grid reserved a 304–344 px panel column. | Prototype with populated History, multiple Variants and realistic Recipe; review panel width/collapse and available scientific canvas together. |
| Canvas obscured at 1024 px | `createIntelligentUi` used a dock cutoff of 1180 px; at 1024 px it reverted to the older overlay flyout, reported as covering canvas/Section in PR self-review. | Accept 1024 px independently; desktop/mobile media queries alone are insufficient. |
| Missing mobile edit/view workflow | Self-review recorded a roughly 340 px flyout in a 390 px viewport while still showing dock toggles that could not work on mobile. Diff reused `workstation-tool-flyout`. | M1.5 must demonstrate entering/exiting view/edit/draw, submitting parameters and returning to results, rather than shrinking desktop panels. |
| Navigation and Recipe unchanged | Diff retained five `TOOL_META` domains and Recipe within Process, replaced scrollable panels with an exclusive inspector and added a command palette. The icon rail still relied on tooltips. | Compare two or three navigation schemes and both Recipe placements in M1.5, with user approval. Define navigation labels/state ownership first. |
| Layered CSS migration | `intelligent-ui.css` loaded after existing `style.css`/`workstation.css` and overrode them under `intelligent-ui` and `workstation-ui-v2` guards. `intelligent-ui.js` was added while the old structure remained. | Use r2's isolated dual entry and independent tokens/components/assembly, not another global override layer. Preserve legacy asset paths. |
| Insufficient scenarios | `intelligent-ui-regression` covered 1440/1024/390 but not 768; it started from `welcomeEmptyBtn`, opened History, switched to Mask, exercised palette and desktop dock rect, then captured screenshots. It did not include M3D/Photodetector, Recipe Run All/failure recovery or populated History. | Button responsiveness is not evidence that information density, four views, Recipe/History or real user journeys work. M1.5 and M4 must run §4 scenarios. |
| Legacy and v2 test adapters mixed | PR changed `history-regression` from checking a visible continuation banner to checking status presence and `operationTools` visibility to accommodate exclusive panels. No separate v2 track existed. | This alone does not prove scientific assertions were weakened, but it mixes test ownership. Retain legacy assertions and establish v2 URL/marker guards. |
| No functional isolated preview | A dedicated workflow uploaded a static archive, attempted a raw.githack HEAD request under `continue-on-error`, and the PR itself noted no functioning standalone online preview. | ZIP upload or a successful URL HEAD is not evidence that the app starts. M5 requires an actual isolated preview host opened and checked, not replacing production Pages. |

## Concrete CI results

The [early screenshot run 37896042401](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896042401), *Build and browser-check UI review*, passed and uploaded screenshots. The PR description nevertheless recorded failed human visual review. This report relies on the author's artifact review: the M0 auditor did not download or independently inspect those screenshots and must not claim independent visual acceptance.

The latest-head [Browser regression run 37896914877](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896914877) tested merge `a1db815…`:

- Smoke, Workstation, Resilience, History and Persistence passed.
- Chromium targeted job `113710385289` failed in Interaction, with **1.7857142857142918 px** vertical registration drift in Main's 3D ROI, asserted at `scripts/interaction-regression.mjs:651`. Examples/Product Layout/Renderer were not executed afterward. This is an actual pointer/coordinate contract failure, not a subjective visual complaint.
- The independent Process Geometry job passed; the 625-site renderer and edge-on jobs were skipped. Successful results cannot be extended to skipped scenarios.

In [M3D conformal baseline audit 37896914888](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896914888), Candidate quality job `113710301063` passed lint but failed `format:check`, naming five files: `site/app.js`, `site/intelligent-ui.css`, `site/intelligent-ui.js`, `site/tests/intelligent-ui.test.mjs` and `scripts/intelligent-ui-regression.mjs`. The following `docs:check` was skipped. Two scientific-baseline jobs and the then-current layout job passed, but diagnostic historical pixel comparisons did not approve a new visual baseline.

Latest Quality run `37896914955` and Intelligent UI review `37896914907` passed, while Example Recipe Reconstruction and Native Fig3 full replay were skipped. Quality's `check:ci` did not include `format:check`, explaining why Quality was green while Candidate quality was red.

## Causal boundaries and corrective measures

The ROI drift is evidenced by logs, and the diff changed available canvas dimensions and panel reparenting/placement. Without reproducing a base/head comparison in the same environment, the specific root cause cannot be attributed to one CSS rule. Treat this as a high-priority migration risk and rerun original strict alignment assertions in M3/M4 while leaving the renderer read-only. Formatting failures and visual rejection are separate issues; fixing format alone would not approve the layout.

M0 creates evidence/contracts only. M1 checks light tokens and component states; M1.5 requires realistic complex projects, four widths and a comparison of two Recipe placements before approval; M2 rewrites assembly behind a new entry; M3 performs dual functional/visual acceptance by domain; M4 preserves original scientific/storage assertions on both test tracks; M5 adds the isolated preview and requests approval before changing the default entry.
