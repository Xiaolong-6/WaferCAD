# CI routing

WaferCAD keeps the full regression inventory, but pull requests do not run every browser suite unconditionally. The browser workflow first classifies the changed paths with `scripts/ci-test-plan.mjs`, then runs the narrowest regression scopes that own those changes.

## Pull-request gates

`Quality` remains the fast code gate for every non-documentation pull request. It installs the pinned development dependencies, runs ESLint, and runs the complete Node test suite.

`Browser regression` always runs the fast browser group when application/browser-test changes trigger the workflow:

- UI smoke;
- workstation integration;
- degraded-mode resilience.

The planner then enables focused suites as needed:

| Change area                                         | Additional browser coverage                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| History, replay, project History controls           | History + bundled examples                                                      |
| Persistence, project IO/schema, startup/recovery    | Persistence + bundled examples                                                  |
| General workstation/UI/controller changes           | Interaction, and product layout where applicable                                |
| Bundled example fixtures/metadata                   | Bundled examples                                                                |
| GDS/OAS/layout pipeline                             | Interaction + product layout; KLayout keeps its separate compatibility workflow |
| Renderer/Section/model-view geometry                | Renderer product review + bundled examples                                      |
| Process/model/vector geometry                       | Process Geometry + renderer review + bundled examples                           |
| Dependency lockfiles or shared browser-test helpers | Full browser regression                                                         |

Workflow/planner-only changes exercise every normal browser suite but intentionally do not force the long Process Geometry regression. The planner itself has Node unit tests, and the heavy geometry job remains available through geometry-impacting changes and full-regression events.

## Heavy Process Geometry job

`npm run test:ui:process` is isolated in its own conditional GitHub Actions job. It no longer adds several minutes to unrelated pull requests.

When process/model geometry changes require it, the job runs in parallel with the normal targeted browser job. This preserves the scientific process-geometry gate while reducing pull-request wall time.

## Full regression events

The complete browser suite, including Process Geometry, still runs for:

- relevant pushes to `main`;
- the nightly Browser regression schedule (`02:17 UTC`);
- manual `workflow_dispatch` runs;
- pull requests that change pinned dependencies or shared browser-test infrastructure.

This gives targeted feedback during development while retaining a complete integration sweep after merge and on a recurring schedule.

## Cost controls

- Browser PR jobs do not repeat the Node test gate already owned by `Quality`.
- Node tests are repeated inside Browser regression only for non-PR full runs, where a separate Quality workflow may not exist.
- Chromium and npm downloads remain cached.
- Normal targeted suites share one Chromium job to avoid repeated setup cost.
- Process Geometry is split only because it is substantially longer and benefits from conditional parallel execution.
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
