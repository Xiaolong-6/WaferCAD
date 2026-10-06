# CI routing

WaferCAD keeps the full regression inventory, but pull requests do not run every browser suite unconditionally. The browser workflow first classifies the changed paths with `scripts/ci-test-plan.mjs`, then runs the narrowest regression scopes that own those changes.

## Pull-request gates

`Quality` remains the fast code gate for every non-documentation pull request. It installs the pinned development dependencies, runs ESLint, and runs the complete Node test suite.

`Browser regression` always runs the small UI smoke when application/browser-test changes trigger the workflow. Workstation integration and degraded-mode resilience are selected only when their owned startup/shell or Three/WebGL paths change.

The planner then enables focused suites as needed:

| Change area                                         | Additional browser coverage                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| History, replay, project History controls           | History + bundled examples                                                      |
| Persistence, project IO/schema, startup/recovery    | Persistence + bundled examples                                                  |
| Workstation/startup shell                            | Workstation integration; resilience only for Three/WebGL bootstrap paths         |
| Pointer/view/layout controls                         | Interaction, and product layout only for layout-owning files                    |
| Bundled example fixtures/metadata                   | Bundled examples                                                                |
| GDS/OAS/layout pipeline                             | Interaction + product layout; KLayout keeps its separate compatibility workflow |
| Renderer/Section/model-view geometry                | Renderer semantic regression; stress/gallery cases on nightly/manual full runs   |
| Process/model/vector geometry                       | Process Geometry core browser path; full permutations on nightly/manual runs     |
| Dependency lockfiles or shared browser-test helpers | Full browser regression                                                         |

Workflow/planner-only changes stay on UI smoke. The planner itself has Node unit tests, while the weekly/manual full sweep validates the complete job matrix. Shared scientific browser helpers that are consumed by Process, Examples, and Product Review remain full-suite triggers, and renderer ownership explicitly includes the Section/plan renderer, rough-mesh worker/geometry, surface renderer, and annotation renderer. Process Geometry remains reserved for geometry-impacting changes and explicit full-regression events.

## Heavy Process Geometry job

`npm run test:ui:process` is isolated in its own conditional GitHub Actions job. It no longer adds several minutes to unrelated pull requests.

When process/model geometry changes require it, the job runs in parallel with the normal targeted browser job. This preserves the scientific process-geometry gate while reducing pull-request wall time.

## Full regression events

The complete browser suite, including Process Geometry, runs for:

- the weekly Browser regression schedule (Monday at `02:17 UTC`);
- manual `workflow_dispatch` runs;
- pull requests or main pushes whose changed paths conservatively select the full suite, such as dependency lockfiles or shared browser-test infrastructure.

A push to `main` now computes the changed paths from the previous main revision to the pushed revision and feeds that list through the same impact planner used by pull requests. This preserves a post-merge verification pass while avoiding an unconditional second full sweep after every merge.

This keeps PR and main validation change-aware while leaving the expensive unconditional integration sweep to weekly/manual runs.

## Cost controls

- Browser PR jobs do not repeat the Node test gate already owned by `Quality`.
- Node tests are repeated inside Browser regression for non-PR runs, including targeted `main` pushes, because a separate Quality workflow may not exist for direct pushes.
- Chromium and npm downloads remain cached.
- Normal targeted suites share one Chromium job to avoid repeated setup cost.
- Human-review screenshot galleries are disabled on pull requests and targeted main pushes; they are retained for weekly/manual full runs.
- Renderer stress cases and the full Process Geometry permutation set are retained for weekly/manual full runs; PRs and targeted main pushes use semantic/core subsets.
- Process Geometry is split only when selected because its real worker/process path remains materially heavier than ordinary UI checks.
- Node-test-only changes under `site/tests/` do not trigger Browser regression by themselves.
- KLayout parser/browser compatibility remains path-filtered in its dedicated workflow.

## Local equivalents

Use the smallest existing npm group that matches the change:

- `npm run test:ui:fast` — smoke + workstation + resilience;
- `npm run test:ui:state` — History + persistence;
- `npm run test:ui:geometry` — Process Geometry + interaction;
- `npm run test:ui:review` — bundled examples + product layout + renderer;
- `npm run test:ui:all` — every non-baseline browser suite.

The planner changes CI scheduling only. It does not remove or weaken any underlying regression suite.
