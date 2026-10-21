# CI routing

WaferCAD keeps the full regression inventory, but pull requests do not run every browser suite unconditionally. The browser workflow first classifies the changed paths with `scripts/ci-test-plan.mjs`, then runs the narrowest regression scopes that own those changes.

## Local Quality evidence

Run the existing checks locally and commit their source-bound report:

```sh
git add <changed-source-files>
node scripts/local-verification.mjs run draft
# Before Ready for Review or final merge acceptance:
node scripts/local-verification.mjs run full
git add .verification/quality/report.json .verification/quality/transcript.json.gz

```

Use Node 24 and the pinned installed devDependencies. Stage source changes
before running the command. The runner refuses untracked or unstaged source,
sparse/assumed-unchanged entries, conflicting index stages and non-regular
source files. It does not modify source, stage files, commit or push.

Both scopes retain ESLint, Prettier and generated-document checks. Draft runs
the focused planner/workflow/evidence and documentation Node contracts; full
runs the complete existing `npm test` inventory. A full report satisfies Draft;
a Draft report never satisfies Ready or release acceptance. Failure, Abort or
source changes during a run cannot retain an old passing report.

`Quality / quality` first checks the report and compressed transcript using
Node built-ins and Git without installing dependencies. **If the proof is
missing, incomplete, failed, stale, or incompatible with the exact proposed
merge tree, Quality installs locked dependencies and actually runs the same
required checks.** Draft fallback runs lint, format, generated docs and the
focused Quality/CI/documentation Node contracts; Ready and manual full fallback
run `npm run check`, including the entire `npm test` inventory. Any failing
or interrupted check rejects the job; no stale report can authorize success.
The locally supplied full proof is still preferred to avoid repeating tests.
The strict full-proof step and the full-execution fallback have separate names
so a tolerated failed evidence probe can never count as release attestation.

The default PR checkout checks the proposed merge tree. For full Main release
validation and manual pre-main integration, the same proof-first/full-execution
fallback applies to the exact checked-out source. Neither path skips the
existing browser, scientific, staged-artifact or publishing gates.

The SHA-256 source identity covers sorted Git index paths, modes and blob IDs,
excluding only the two generated evidence files. A clean staged source check
binds the tested checkout to those Git objects, while canonical Git identity
avoids platform newline differences. An evidence-only commit does not create a
commit-hash cycle. Any other tracked source, test, workflow, dependency or
documentation change invalidates the current report. This first version is
conservative; it does not claim per-suite incremental evidence reuse.

Reports include exact commands, exit codes, signals, durations, Node/tool
versions, timestamps, source revision, plan digest and transcript hashes.
`node scripts/local-verification.mjs verify draft` (or `full`) performs the same read-only
check locally. The report is explicitly **developer-reported** evidence;
hashes detect stale or inconsistent data, not a developer fabricating an
entire report. It is not a signed or independent execution attestation.
Review, source protection, scientific acceptance and explicit merge approval
remain necessary.

The path-filtered Release evidence contract retains fast dependency-free
tests of this safety-critical verifier and release routing. That independent
safety check does not rerun application Quality. The old documentation PR
workflow is manual-only; the local Draft/full plan owns its Node contracts.
Other browser/scientific workflows are not yet migrated to local reports.
Do not describe this Quality migration as removing all local-capable CI.

## Visual-first Draft development

Visual changes use an inexpensive, explicit evidence loop before full acceptance.
From the repository root, with pinned dependencies and Playwright installed:

`npm run preview:visual`

The command starts a temporary local v2 server, loads a real bundled JLFET
example in the production `app.html` Workstation, and captures Main, Mask,
3D and Section in desktop (1440 px) and portrait (390 px) viewports.
Set `WAFERCAD_VISUAL_SMALL=1` for an additional 360 px portrait case, or
`WAFERCAD_VISUAL_EXAMPLE=<published-slug>` to select another real example.

Artifacts are written to `test-results/visual-first/`. This is **real-application
visual evidence**, not a parallel scientific illustration: the capture opens
production `site/app.html`, uses the native Canvas/Three.js renderers and the
real Workstation controls, and records source SHA-256 hashes and the Git revision
(where available). The capture fails rather than silently approving an
unfinished/unavailable WebGL frame. Screenshots remain **unreviewed evidence**,
not automated visual approval, geometry/science acceptance, pixel baselines,
or permission to merge. The developing agent must inspect the images and
iterate locally before requesting full acceptance.

### Scope-aware capture when WebGL is unavailable

For UI, desktop layout, Main, Mask and Section-only changes, run the **real
application** with the three-view scope. The collector opens `app.html` and
captures native Canvas 2D, panels and Workstation controls, without treating an
unavailable 3D renderer as a failure of those three views:

```sh
WAFERCAD_VISUAL_SCOPE=2d-ui \
WAFERCAD_VISUAL_START=empty \
WAFERCAD_VISUAL_VIEWPORTS=1440x900,390x844 \
WAFERCAD_CHROMIUM=/path/to/chromium \
npm run preview:visual
```

`WAFERCAD_VISUAL_SCOPE=3d` checks only the real Three.js view and **requires**
a valid WebGL frame and the pinned `three@0.179.1` dependency.
`WAFERCAD_VISUAL_SCOPE=all` (default) retains the full four-view acceptance
capture. `WAFERCAD_VISUAL_VIEWS` may further narrow, but never widen, the
selected scope. A three-view capture records `untestedViews: ["three"]`,
`requiresWebgl: false`, and `visualAcceptance: false` in `report.json`.
A 2D/UI success therefore **does not pass, waive or resolve** a 3D-specific
issue, even if the overview screenshot contains a `3D unavailable` panel.
It also does not prove a scientific geometry, process, History or Recovery
contract. AI inspection of actual screenshots and relevant focused tests remain
necessary for the scoped UI acceptance.

Where enterprise browser policy blocks navigation, the normal real-app capture
remains unavailable. A permitted **in-memory real-component** capture can
provide UI-only diagnostic evidence, with its exact limitations recorded; it
cannot be renamed a native full-app screenshot or used to waive the visual
requirement. Do not circumvent enforced Chromium security policy.

Capture a particular Example/viewport/view without running the entire Browser
suite (for an empty-shell check, use `WAFERCAD_VISUAL_START=empty`):

```sh
WAFERCAD_VISUAL_EXAMPLE=photodetector-literature \
WAFERCAD_VISUAL_VIEWS=main,mask,three,section \
WAFERCAD_VISUAL_VIEWPORTS=1440x900,390x844 \
WAFERCAD_CHROMIUM=/path/to/chromium \
WAFERCAD_VISUAL_SWIFTSHADER=1 \
npm run preview:visual
```

`WAFERCAD_CHROMIUM` can point at a compatible standalone Chromium executable,
including one supplied by an independently installed package. The command
requires the pinned `node_modules/three` version `0.179.1` for 3D and routes
the production Three.js import map to those local bytes, avoiding reliance on
the CDN. Software WebGL flags are opt-in. An environment where browser policy
blocks `localhost` cannot complete this capture; a geometry-only SVG/VTK image
must not be reported as a substitute. See
[Offline Visual Kernel](tools/OFFLINE_VISUAL_KERNEL.md) for separate diagnostic use.

`visual-first.yml` automatically captures applicable **Draft** PRs, and
can also be dispatched manually. It never publishes and cannot approve
the PR. Draft `Quality` accepts matching Draft/full evidence or executes Draft checks;
Ready for Review requires matching full evidence or executes full checks. The general Browser regression keeps smoke in Draft,
and retains impact-selected Process Geometry, History and Persistence gates
when needed to protect scientific invariants and stored project data.
Heavy shared UI v2 Stage C/M4, Main/Mask/Mobile, D1, 3D Phase B and non-science Browser
regressions defer until Ready for Review or explicit manual/release triggers.
Other science-specific workflows may still run on Draft if their own
contracts require it.

The exact `main` release chain is unchanged: Quality, targeted Browser,
real v2 Stage C/M4, selected scientific checks, staged Pages artifact and
deployment verdict remain mandatory. A Draft skipped check means
**unverified**, not passed; no one may merge on the basis of Draft green alone.

## Narrow PR path routing

**GitHub path filters apply to the cumulative base-to-HEAD pull-request
diff**, not only to the latest documentation-only commit. If earlier commits
in the same PR touched `scripts/v2/**`, workflows or application owners,
later prose/formatting pushes can select the same UI/3D jobs again. The
M3D conformal workflow also explicitly selects `docs/wiki/**`.
Inspect the complete PR file diff and workflow `paths` filters before
pushing; batch related documentation corrections and validate formatting
and references locally first. Retain mandatory scientific/Recovery and
final release gates; a skipped workflow is not an acceptance pass.

Only production/source owners trigger heavyweight PR UI acceptance. A change to
`site/tests/**` or the standalone screenshot collector does not start Stage C,
Main/Mask, D1, Phase B or Example replay. The tests themselves still run under
Quality. Stage C listens to `scripts/v2/**` and browser helpers, rather than
all maintenance scripts. Example README/provenance edits do not select browser
replay, while project files and fixtures still do.

The Browser planner compares base/head `package.json` for PRs. It de-scopes
**only** the addition of the exact `preview:visual` command. Dependency changes,
lockfile changes, existing test command changes, missing history and all other
npm script changes fail closed to the full browser suite. Reusable release gates,
manual runs and required scientific ownership are unchanged. New configuration
tests explicitly guard these assumptions.

## Pull-request gates

`Quality` is an unconditional gate for every pull request into `main`, including documentation-only changes, and retains its stable check name. Draft prefers current local Draft/full proof and Ready prefers full proof. If the matching proof is absent or stale, CI performs the identical required checks itself on the exact integration tree. A Draft report does not certify the complete Node suite. Repository ruleset configuration is a separate GitHub administration action.

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

The real UI v2 [Stage C/M4 workflow](../.github/workflows/ui-v2-stage-c-m4.yml) runs for applicable PRs. Production publication calls this same suite as a reusable workflow, so it must pass at the exact `main` commit before Pages can deploy. It runs real v2 Startup, cross-interface Recovery, synchronization, review interactions, M4 projects and M2 structural layout parity. Ordinary Browser regression remains independent and routes former Legacy command names through native-v2 scientific owners. Its generated screenshots remain review artifacts rather than approved pixel baselines.

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

[Documentation evidence diagnostic](../.github/workflows/documentation-wiki-targeted.yml) is manual-only and checks full local proof without installing npm or rerunning documentation tests. The local Draft and full Quality plans own the documentation suite; `Quality` is the single automatic PR gate for it.

[Product manual/Wiki sync](../.github/workflows/product-manual-wiki.yml) runs on every main push, including documentation-only pushes, and supports manual dispatch. It installs pinned npm dependencies before checking generation, links/navigation, tutorial/catalog contracts and possible public-behavior drift, then compares managed Wiki pages.

[Pages deployment](../.github/workflows/pages.yml) runs on relevant `main` changes and manual dispatch. Before deployment, it requires verified full Quality (matching source-bound proof or successful full execution), impact-selected Browser regression, real UI v2 Stage C/M4, and a fail-closed scientific release aggregate. The scientific impact planner selects real Main/Mask/Section, KLayout format compatibility, and Recipe safety acceptances when their source owners change; manual releases select all three. Required failed, cancelled, skipped or missing scientific jobs block the aggregate. Only explicitly unselected scientific jobs may skip. The read-only `stage-pages` job waits for all four release gates, builds and stamps the exact `build/pages/` artifact, then runs the Chromium staged-artifact smoke at `/WaferCAD/`, exercising Welcome, startup, Project/Layout Workers and the real Process Worker. The `deploy` job consumes that previously tested artifact without rebuilding it, and alone holds `pages: write` and `id-token: write`. Both staging and deployment require `refs/heads/main`; ordinary PRs cannot publish.

## Retired public Legacy editor

Production Pages staging generates `app-legacy.html` as a same-origin,
query/hash-preserving redirect to `app.html`. The original Legacy editor,
including `app.js` and `workstation.css`, is absent from the active checkout
and retained at the immutable `legacy-frozen` tag. Native-v2 scientific test
owners replace executable Legacy DOM coverage on the current branch, while
the frozen source remains reproducible for historical comparisons.
PRs touching the artifact builder run the staged Pages browser smoke, which
verifies the bookmark redirect, absence of old JS/CSS, and real production
Workers under `/WaferCAD/`. The redirect performs no Project/Recovery
storage migration or mutation. See [Legacy source sunset](operations/LEGACY_SOURCE_SUNSET.md)
for remaining scenario-by-scenario fidelity risks.

## Welcome four-view preview isolation

The production v2 Stage C/M4 owner also exercises
`scripts/v2/check-welcome-preview-isolation.mjs`: the Welcome iframe opens a
reduced final-stage real project in read-only v2 Main, Mask, 3D and Section,
without `start` intent, writer-lease acquisition or autosave marker mutation.
The ordinary M5 startup owner verifies the same preview routing before loading
the full example into the editor. This gate does not cover physical hardware
GPU parity.

## MAGIC-1000 v2 visualization owner

`magic1000-candidate.yml` is a read-only, path-gated PR and manual acceptance
for the current v2 Section/3D preview of MAGIC-1000. It replaces the obsolete
self-pushing feature-branch workflow, drops repository write permission, and
uploads screenshots/reports without rewriting the committed thumbnail.
`scripts/magic1000-visual-acceptance.mjs --write-thumbnail` is reserved for
intentional, locally reviewed image regeneration. Browser rendering does not
prove agreement with the paper's device microscopy.

## Historical Project compatibility

The [Legacy project compatibility acceptance](../.github/workflows/legacy-project-compat.yml)
is a path-gated PR workflow, independent from the ordinary Pages release. It imports the
SHA-256-verified historical `shared-assets-v1` project in the real v2 Workstation
and verifies autosave, reload, and Recovery preservation. It remains a release-relevant regression even though the executable Legacy
editor has already been removed from the active checkout. This gate supplements
current project-format and controller tests; it does not establish exact parity
with every historical Legacy UI gesture or scientific browser scenario.

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

- Quality and release Quality validate local evidence without installing npm or repeating the local Node/lint/format/docs gate.
- Browser PR jobs do not repeat the locally executed Node gate certified by `Quality`.
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

The full release DAG prevents ordinary `main` Pages publication until post-merge scientific checks and staged-artifact smoke finish. The obsolete `ui-v2-preview.yml` publisher is retired, and production Pages is the only source-configured publisher. Repository/environment permissions and main protection require separate administration review; software WebGL does not constitute physical-GPU evidence. See [CI architecture audit](archive/CI_ARCHITECTURE_AUDIT_2026-10-12.md) for the remaining controls.
