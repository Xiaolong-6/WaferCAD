# CI routing

WaferCAD keeps the full regression inventory, but pull requests do not run every browser suite unconditionally. The browser workflow first classifies the changed paths with `scripts/ci-test-plan.mjs`, then runs the narrowest regression scopes that own those changes.

## Pull-request gates

`Quality` is an unconditional gate for every pull request into `main`, including documentation-only changes. It runs pinned ESLint, Prettier format verification, generated-document consistency and the complete Node test suite (`npm run check`). It is a stable required-check candidate; repository ruleset configuration is a separate GitHub administration action.

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

The real UI v2 [Stage C/M4 workflow](../.github/workflows/ui-v2-stage-c-m4.yml) runs for applicable PRs. Production publication calls this same suite as a reusable workflow, so it must pass at the exact `main` commit before Pages can deploy. It runs real v2 Startup, cross-interface Recovery, synchronization, review interactions, M4 projects and M2 structural layout parity. Ordinary Browser regression remains independent and includes Legacy owners for shared interface changes. Its generated screenshots remain review artifacts rather than approved pixel baselines.

Workflow/planner-only changes stay on UI smoke. The planner itself has Node unit tests, while the weekly/manual full sweep validates the complete job matrix. Shared scientific browser helpers that are consumed by Process, Examples, and Product Review remain full-suite triggers, and renderer ownership explicitly includes the Section/plan renderer, rough-mesh worker/geometry, surface renderer, and annotation renderer. Process Geometry remains reserved for geometry-impacting changes and explicit full-regression events.

## Draft PRs and dedicated acceptance workflows

Draft PRs still receive the applicable fast Quality/targeted browser checks. Heavy acceptance is deferred by explicit workflow conditions until `ready_for_review`:

| Workflow                                                                                | Actual trigger and Draft behavior                                                                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Browser regression](../.github/workflows/browser-regression.yml)                       | Impact-selected PR runs, production-release calls plus weekly/manual full runs; the separate 625-site renderer job skips Draft PRs. |
| [Example Recipe reconstruction](../.github/workflows/example-recipe-reconstruction.yml) | Path-filtered PR/manual; fixture verification and nine example/Variant Run All jobs skip Draft PRs. No main-push trigger.           |
| [Native Fig3 full replay](../.github/workflows/native-fig3-full-replay.yml)             | Path-filtered PR/manual; skips Draft PRs. No main-push trigger.                                                                     |
| [Recipe safety](../.github/workflows/process-recipe-safety.yml)                         | Path-filtered PR and the explicitly named Recipe feature branches; skips Draft PRs. No main-push trigger.                           |
| [Pre-main full inventory](../.github/workflows/pre-main-integration-validation.yml)     | Manual only; does not run just because a PR is opened or main changes.                                                              |
| [M3D Welcome integration](../.github/workflows/m3d-example-integration.yml)             | The named M3D feature branch, PRs targeting the named Recipe feature branch, or manual dispatch; not a general main gate.           |

A skipped/deferred check is unverified, not passed. Marking a PR ready triggers its existing final-review jobs; direct main publication does not implicitly run every dedicated replay workflow. Costly manual acceptance still follows user authorization.

## Documentation and publication workflows

[Product manual/Wiki sync](../.github/workflows/product-manual-wiki.yml) runs on every main push, including documentation-only pushes, and supports manual dispatch. It installs pinned npm dependencies before checking generation, links/navigation, tutorial/catalog contracts and possible public-behavior drift, then compares managed Wiki pages.

[Pages deployment](../.github/workflows/pages.yml) runs on relevant `main` changes and manual dispatch. Before deployment, it requires same-SHA Release Quality (`npm run check`), impact-selected Browser regression, real UI v2 Stage C/M4, and a fail-closed scientific release aggregate. The scientific impact planner selects real Main/Mask/Section, KLayout format compatibility, and Recipe safety acceptances when their source owners change; manual releases select all three. Required failed, cancelled, skipped or missing scientific jobs block the aggregate. Only explicitly unselected scientific jobs may skip. The read-only `stage-pages` job waits for all four release gates, builds and stamps the exact `build/pages/` artifact, then runs the Chromium staged-artifact smoke at `/WaferCAD/`, exercising Welcome, startup, Project/Layout Workers and the real Process Worker. The `deploy` job consumes that previously tested artifact without rebuilding it, and alone holds `pages: write` and `id-token: write`. Both staging and deployment require `refs/heads/main`; ordinary PRs cannot publish.

## Heavy Process Geometry job

`npm run test:ui:process` is isolated in its own conditional GitHub Actions job. It no longer adds several minutes to unrelated pull requests.

When process/model geometry changes require it, the job runs in parallel with the normal targeted browser job. This preserves the scientific process-geometry gate while reducing pull-request wall time.

## Full regression events

The complete browser suite, including Process Geometry, runs for:

- the weekly Browser regression schedule (Monday at `02:17 UTC`);
- manual `workflow_dispatch` runs;
- pull requests or production-release calls whose changed paths conservatively select the full suite, such as dependency lockfiles or shared browser-test infrastructure.

A production-release call computes changed paths from the previous `main` revision to the candidate and feeds them through the same impact planner as pull requests. Release UI v2 acceptance runs on each product publication, while Browser tests remain impact-selected. Production Pages waits for these suites and the release Quality gate; there is no independent, racing main-push deployment.

This keeps PR and main validation change-aware while leaving the expensive unconditional integration sweep to weekly/manual runs.

## Cost controls

- Browser PR jobs do not repeat the Node test gate already owned by `Quality`.
- Node tests run inside independent weekly/manual Browser regression, but are skipped in the Pages release call where the release Quality job already owns them.
- Chromium and npm downloads remain cached.
- Normal targeted suites share one Chromium job to avoid repeated setup cost.
- Human-review screenshot galleries are disabled on pull requests and targeted main pushes; they are retained for weekly/manual full runs.
- Renderer stress cases and the full Process Geometry permutation set are retained for weekly/manual full runs; PRs and targeted main pushes use semantic/core subsets.
- Process Geometry is split only when selected because its real worker/process path remains materially heavier than ordinary UI checks.
- Node-test-only changes under `site/tests/` do not trigger Browser regression by themselves.
- KLayout parser/browser compatibility stays path-filtered on PRs and is reused as a required same-SHA release gate on layout/interop changes.
- Main/Mask and Recipe browser acceptances are similarly reusable release gates. They do not run unconditionally for documentation-only changes.

## Local equivalents

Use the smallest existing npm group that matches the change:

- `npm run test:ui:fast` — smoke + workstation + resilience;
- `npm run test:ui:state` — History + persistence;
- `npm run test:ui:geometry` — Process Geometry + interaction;
- `npm run test:ui:review` — bundled examples + product layout + renderer;
- `npm run test:ui:all` — every non-baseline browser suite.

The planner changes CI scheduling only. It does not remove or weaken any underlying regression suite.

## Merge protection and review evidence

GitHub branch protection/rulesets are repository settings, **not** workflow YAML. A contributor with administration permission must enable protection of `main` and require the stable `Quality / quality` check, with pull requests and stale-review protection as appropriate. The specialized path-selected and Draft-deferred checks cannot safely be made individually required without a stable aggregator: a workflow omitted by a path filter has no successful check to report. Before merging a science, browser, or UI change, inspect the applicable targeted jobs and uploaded evidence; `Quality` success alone is not sufficient for scientific or human acceptance.

The full release DAG prevents ordinary `main` Pages publication until post-merge scientific checks and staged-artifact smoke finish. The obsolete `ui-v2-preview.yml` publisher is retired, and production Pages is the only source-configured publisher. Repository/environment permissions and main protection require separate administration review; software WebGL does not constitute physical-GPU evidence. See [CI architecture audit](CI_ARCHITECTURE_AUDIT_2026-10-12.md) for the remaining controls.
