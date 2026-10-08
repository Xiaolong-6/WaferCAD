# CI routing

WaferCAD keeps the full regression inventory, but pull requests do not run every browser suite unconditionally. The browser workflow first classifies the changed paths with `scripts/ci-test-plan.mjs`, then runs the narrowest regression scopes that own those changes.

## Pull-request gates

`Quality` remains the fast code gate for every non-documentation pull request. It installs the pinned development dependencies, runs ESLint and documentation checks, and runs the complete Node test suite.

`Browser regression` always runs the small UI smoke when application/browser-test changes trigger the workflow. Workstation integration and degraded-mode resilience are selected only when their owned startup/shell or Three/WebGL paths change.

The planner then enables focused suites as needed:

| Change area                                         | Additional browser coverage                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| History, replay, project History controls           | History + bundled examples                                                      |
| Persistence, project IO/schema, startup/recovery    | Persistence + bundled examples                                                  |
| Workstation/startup shell                           | Workstation integration; resilience only for Three/WebGL bootstrap paths        |
| Pointer/view/layout controls                        | Interaction, and product layout only for layout-owning files                    |
| Bundled example fixtures/metadata                   | Bundled examples                                                                |
| GDS/OAS/layout pipeline                             | Interaction + product layout; KLayout keeps its separate compatibility workflow |
| Renderer/Section/model-view geometry                | Renderer semantic regression; stress/gallery cases on weekly/manual full runs   |
| Process/model/vector geometry                       | Process Geometry core browser path; full permutations on weekly/manual runs     |
| Dependency lockfiles or shared browser-test helpers | Full browser regression                                                         |

Workflow/planner-only changes stay on UI smoke. The planner itself has Node unit tests, while the weekly/manual full sweep validates the complete job matrix. Shared scientific browser helpers that are consumed by Process, Examples, and Product Review remain full-suite triggers, and renderer ownership explicitly includes the Section/plan renderer, rough-mesh worker/geometry, surface renderer, and annotation renderer. Process Geometry remains reserved for geometry-impacting changes and explicit full-regression events.

## Draft PRs and dedicated acceptance workflows

Draft PRs still receive the applicable fast Quality/targeted browser checks. Heavy acceptance is deferred by explicit workflow conditions until `ready_for_review`:

| Workflow                                                                                | Actual trigger and Draft behavior                                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Browser regression](../.github/workflows/browser-regression.yml)                       | Impact-selected PR/main runs plus weekly/manual full runs; the separate 625-site renderer job skips Draft PRs.            |
| [Example Recipe reconstruction](../.github/workflows/example-recipe-reconstruction.yml) | Path-filtered PR/manual; fixture verification and nine example/Variant Run All jobs skip Draft PRs. No main-push trigger. |
| [Native Fig3 full replay](../.github/workflows/native-fig3-full-replay.yml)             | Path-filtered PR/manual; skips Draft PRs. No main-push trigger.                                                           |
| [Recipe safety](../.github/workflows/process-recipe-safety.yml)                         | Path-filtered PR and the explicitly named Recipe feature branches; skips Draft PRs. No main-push trigger.                 |
| [Pre-main full inventory](../.github/workflows/pre-main-integration-validation.yml)     | Manual only; does not run just because a PR is opened or main changes.                                                    |
| [M3D Welcome integration](../.github/workflows/m3d-example-integration.yml)             | The named M3D feature branch, PRs targeting the named Recipe feature branch, or manual dispatch; not a general main gate. |

A skipped/deferred check is unverified, not passed. Marking a PR ready triggers its existing final-review jobs; direct main publication does not implicitly run every dedicated replay workflow. Costly manual acceptance still follows user authorization.

## Documentation and publication workflows

[Product manual/Wiki sync](../.github/workflows/product-manual-wiki.yml) runs on every main push, including documentation-only pushes, and supports manual dispatch. It checks generation, links/navigation, tutorial/catalog contracts and possible public-behavior drift before comparing managed Wiki pages.

[Pages deployment](../.github/workflows/pages.yml) runs on main changes to `site/**`, the asset-stamping script or its own workflow, plus manual dispatch. It runs Node release sanity before deploying. A change only under `docs/` does not trigger Pages by itself. [Quality](../.github/workflows/quality.yml) is PR/manual rather than a general main-push gate; the selected Browser non-PR gate owns post-merge Node coverage.

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
