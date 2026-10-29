# CI routing

WaferCAD keeps the full regression inventory without running Browser/science suites automatically on ordinary Draft pushes. The Ready acceptance owner uses `scripts/ci-test-plan.mjs` to classify cumulative changed paths, then runs only the selected reusable gates. The daily controller and Main release have separate exact-SHA execution rules.

## Authoritative execution strategy (effective 2026-10-22)

This section supersedes the historical per-workflow PR-routing notes farther
below. Changes to this policy must update `scripts/ci-trigger-policy.mjs` and
its owning unit tests; **do not** restore broad automatic `pull_request`,
`push` or independent `schedule` triggers on heavy workflows.

| Phase                | Automated remote execution                                                                                                                                             | Local owner                                                            | Merge eligibility                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Ordinary development | None                                                                                                                                                                   | Focused Node/scientific tests and real Chromium screenshots            | No waiting on GitHub                                                 |
| Draft PR push        | Proof-only Quality or verified-base diff Quality; small release policy contract; Ready router skips                                                                    | `node scripts/local-verification.mjs run draft` or matching full proof | Not merge-ready                                                      |
| Ready for Review     | Full Quality proof or verified-base diff Quality plus selected Ready owner gates                                                                                       | Full proof and actual app/browser inspection                           | All selected gates must pass on the candidate tree                   |
| Daily at 02:30 UTC   | `daily-full.yml`: actual full lint/format/docs/Node + full Browser + Process/Recipe + scientific examples/facets + UI/Renderer + normal-Origin History/Recovery/Worker | None required to start the nightly run                                 | Informative for its exact SHA, never a substitute for a newer PR SHA |
| Main release         | Unchanged fail-closed `pages.yml` exact release-tree checks and deploy verdict                                                                                         | Human approval and correct source-bound proof                          | Required prior to publication                                        |

**Budget:** GitHub quota is approximately 3,000 Runner minutes/month. The
daily controller records actual aggregate job minutes and flags runs exceeding
**75 minutes**. This is an _accounting/alert threshold, not an advance hard
billing cap_: with 31 daily runs the planning allowance is 2,325 minutes,
leaving ~675 for targeted Ready/release tests. Investigate overruns and narrow
unrelated jobs; never ignore/loosen physics, data integrity, Worker, History or
Recovery contracts. The only daily cron is `30 2 * * *`: Finland local time
04:30 winter (UTC+2), 05:30 summer (UTC+3). Legacy archived research and
large paper-specific one-offs remain explicitly manual, not duplicated daily.

**Source identity:** A midnight pass at commit `abc123` says nothing about a
new Kernel commit `def456`. The Ready planner routes changed paths using the
base/head diff; a fixed `Ready impact verdict` fails if a selected owner gate
fails, cancels, or is missing. Missing local Quality proof triggers a strictly owned diff Quality path only when
the main base has independently verified full proof. Unknown/high-risk diffs
fail closed; they never fall back to the remote 1,197-test inventory. The nightly run deliberately
executes full checks irrespective of committed proof; publication continues to
be fail-closed at the exact release tree.

**Developer commands:**

```bash
node scripts/ci-trigger-policy.mjs
node --test site/tests/ci-trigger-policy.test.mjs
node scripts/local-verification.mjs run draft
# Before Ready/merge: node scripts/local-verification.mjs run full
```

Do not use an empty commit simply to force every workflow to run. The Ready
entrypoint uses path ownership, while manual full acceptance remains available
when a release risk genuinely requires it. Changes to branch protection/
required checks need a repository administrator: require stable `Quality / quality`
and `Ready risk-targeted acceptance / Ready impact verdict` for Ready merges,
plus the existing required release/evidence protections. A skipped optional
owner job does not imply it passed; the aggregator only permits skips when
the corresponding impact output is false. GitHub required status checks are
repository settings and **cannot be guaranteed by YAML alone**.

---

**Authority note:** The table above and `AGENTS.md` govern execution. The sections below detail local verification, accepted visual evidence, Ready routing and release. Any historical references to automatic Draft/weekly Browser runs are explicitly superseded by the 2026-10-22 policy.

## Incremental Quality (baseline + exact diff)

The automatic PR Quality job accepts either the existing source-bound Draft/Full
receipt **or** a strict incremental route. This is not a replacement for release
Quality. The incremental route must first inspect the exact synthetic merge
commit's two parents against the event's main-base/head SHAs, classify every
cumulative changed file using `scripts/incremental-quality.mjs`, and verify
`node scripts/local-verification.mjs verify full` in a detached worktree of the
**exact main parent**. A missing/stale base proof, unknown path, rename/deletion,
or failure of any selected command rejects incremental Quality.

Eligible changes use locked `npm ci`, ESLint and Prettier on changed JS/MD files,
plus real Node tests for changed tests and explicitly mapped workflow, UI and
Docs owners. New ownership is opt-in within `scripts/incremental-quality.mjs`;
Kernel/Process/History/Recovery, dependencies, export and unknown sources remain
full-proof-only. The first implementation also tests its own Quality routing
with CI contracts rather than silently claiming previous proof covers modified
CI code. The output of the GitHub Quality job is tied to the exact PR merge SHA;
no developer-supplied incremental transcript is trusted.

**This optimization applies only to PR Quality.** The scheduled daily job
continues actual full Quality, Ready runs real risk-selected browser/science
acceptance, and the main Pages release continues its unchanged full Quality
proof-or-execution and fail-closed publication chain. The 75-minute nightly
budget target remains a **warning**, while failed mandatory tests still fail.

## Local Quality evidence

Run the existing checks locally and commit their source-bound report.
Neither **Node 24 exclusively** nor a complete Git checkout/staged index is
mandatory. **Draft Quality accepts any local Node, ESLint and Prettier versions
that successfully execute its unchanged checks**, and records their actual
versions for diagnosis; an uninstalled tool or failed command is not a pass.
**Full Quality remains pinned to Node 22 or 24 LTS** and the required installed
dependencies (ESLint, Prettier and Three.js) must match `package.json` exactly.
Playwright remains owned by browser acceptance, not Node-only Quality.
This does not change the locked `npm ci` reproducible release environment or
waive any real-browser or scientific correctness acceptance.
In an ordinary Git workspace the
verifier enumerates tracked source paths but hashes the **actual working bytes**
(no staging needed). For a source-only package, it requires the standard
`wafercad-source-manifest.json`, rejects missing and unlisted source files, and
hashes every listed source file independently. This is a source inventory,
**not** blind trust in the manifest's old per-file hashes. A complete clean
package is required; an outdated/incomplete recovery bundle cannot certify a
new merged source tree.

```sh
# Draft accepts any running local Node/tool versions; Full requires Node 22 or 24:
node scripts/local-verification.mjs run draft
node scripts/local-verification.mjs run full
# In a Git checkout, if evidence was generated, commit only these two files:
git add .verification/quality/report.json .verification/quality/transcript.json.gz
```

The v2 source fingerprint covers sorted path names and SHA-256 of the actual
file contents, excluding only the two generated proof files. The CI checkout
computes the same digest from its authoritative tracked inventory. Old v1
Git-index evidence remains readable and valid when its original source tree
matches. Reports record the actual Node and Quality tool versions. Draft
checks accept non-pinned versions; Full checks enforce the locked toolchain.
Logs, exact commands and source fingerprints remain mandatory for both.
An evidence-only commit leaves the content digest unchanged.

Both scopes retain ESLint, Prettier and generated-document checks. Draft runs
the focused planner/workflow/evidence and documentation Node contracts; full
runs the complete existing `npm test` inventory. A full report satisfies Draft;
a Draft report never satisfies Ready or release acceptance. Failure, Abort or
source changes during a run cannot retain an old passing report.

`Quality / quality` verifies the locally generated source-bound report and
compressed transcript against the proposed merge tree. **Missing, incomplete,
failed, stale or incompatible PR proof fails closed without running application
Quality in CI.** Developers regenerate the matching Draft or Full report locally
and commit both receipt files. The scheduled nightly and explicitly dispatched
Quality runs execute the actual `npm run check` suite using locked dependencies,
regardless of existing proof. A tolerated failed evidence probe is never a pass.

The default PR checkout checks the proposed merge tree. For full Main release
validation and manual pre-main integration, the same proof-first/full-execution
fallback applies to the exact checked-out source. Neither path skips the
existing browser, scientific, staged-artifact or publishing gates.

A source or test change invalidates blanket Quality proof for the previous
snapshot; previous results remain useful as historical diagnostics, but must not
be presented as an acceptance of different bytes. Draft and Full checks remain
unchanged. Complete source inventory coverage is required in either mode.

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

**Superseded Draft-routing text (pre-2026-10-22):** Older versions of
`visual-first.yml` automatically captured Draft PRs and used a remote
Quality fallback. Neither behavior is the present policy. Ordinary Draft
pushes now verify matching local Draft/full Quality receipts without
automatically running Browser/Renderer/Example/science suites. The
`visual-first.yml` workflow remains available by explicit dispatch where
authorized; Ready impact and the daily controller own the current targeted
and integration gates. Missing/stale evidence is fixed locally, not rerun
remotely.

The exact `main` release chain is unchanged: Quality, targeted Browser,
real v2 Stage C/M4, selected scientific checks, staged Pages artifact and
deployment verdict remain mandatory. A Draft skipped check means
**unverified**, not passed; no one may merge on the basis of Draft green alone.

## Current Ready impact routing

The governing route for Ready PRs is `ready-impact.yml`. Its
`scripts/ci-test-plan.mjs` classifier selects owner-specific acceptance
gates based on the cumulative base-to-HEAD change set, not just the last
commit. Ready PRs require a valid **full** local verification receipt.
Only the selected reusable owner suites execute; the fixed
`Ready impact verdict` rejects failed, cancelled or missing selected jobs.
An unselected gate's skip is not a pass.

Typical ownership: Process/Model changes select scientific/geometry
checks; History, Recovery and Worker changes select the corresponding
transaction and normal-origin suites; UI, Renderer and Example changes
select actual-browser owners. Dependency/runner infrastructure changes
may require broader gates. The 02:30 UTC daily controller performs the
independent full inventory at its tested SHA. The old automatic Draft
Browser routing and fallback policy is historical and **must not** be
reintroduced via workflow path triggers. See the
[authoritative execution table](#authoritative-execution-strategy-effective-2026-10-22).

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

`magic1000-candidate.yml` is a read-only **manual-dispatch** acceptance
for the current v2 Section/3D preview of MAGIC-1000. It replaces the obsolete
self-pushing feature-branch workflow, drops repository write permission, and
uploads screenshots/reports without rewriting the committed thumbnail.
`scripts/magic1000-visual-acceptance.mjs --write-thumbnail` is reserved for
intentional, locally reviewed image regeneration. Browser rendering does not
prove agreement with the paper's device microscopy.

## Historical project compatibility and heavy-process ownership

Legacy project compatibility, native Browser smoke, Process geometry, and
History/Recovery tests remain required **where selected by the Ready
impact owner, daily integration or exact-SHA release chain**. They do
not run automatically just because an ordinary Draft PR was pushed.
Use `npm run test:ui:state`, the smallest matching Node/science
owner, and local real Chromium diagnostics before an authorized
remote acceptance run. The original broad weekly Browser schedule and
Draft-trigger rules were retired by the 2026-10-22 policy.

## Cost controls

- Quality and release Quality validate local evidence without installing npm or repeating the local Node/lint/format/docs gate.
- Browser PR jobs do not repeat the locally executed Node gate certified by `Quality`.
- The daily full integration controller intentionally reruns the full Node suite on its tested SHA. Ready Quality is proof-only; release gates follow their own exact-source verification and selected execution paths.
- Chromium and npm downloads remain cached.
- Normal targeted suites share one Chromium job to avoid repeated setup cost.
- Human-review screenshot galleries are not a Draft default; they are reserved for explicitly selected Ready, daily or manual full runs.
- Renderer stress cases and the full Process Geometry permutation set belong to the daily/manual full inventory; Ready PRs use risk-selected owners.
- Process Geometry is invoked only by the selected acceptance owner, daily controller or approved manual/release gate, never as a Draft fallback.
- Node-test-only changes under `site/tests/` should use their local owning Node suite; browser acceptance still follows the Ready/release risk selector.
- KLayout parser/browser compatibility is selected by the Ready risk router and reused as a same-SHA release gate on layout/interop changes; it is not an automatic Draft PR job.
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
