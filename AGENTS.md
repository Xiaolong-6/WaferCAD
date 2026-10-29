# WaferCAD development

**English-only convention for current and future work:** Write new and actively maintained documentation, UI copy, prompts, examples, commit messages, source comments, and handoff reports in English. Preserve historical audits, completed plans and old handoffs in their original language; do not translate them just for consistency. When retiring localized Wiki pages, remove obsolete placeholder/alias files, update tracked links to the canonical English page, and let the managed Wiki sync delete the old published slug after Main integration. Do not leave stubs solely for old bookmarks.

Read `docs/COLLABORATION.md` for the shared ChatGPT/Codex handoff workflow, `docs/DEVELOPMENT.md` for product contracts, and `docs/testing.md` for test ownership.

- The active static application is under `site/`. Keep canonical geometry in physical micrometres; display scaling, ROI inspection and morphology must not silently change stored material geometry.
- Use stable internal entity IDs and preserve project migration, transactional workers, History restore and browser recovery contracts.
- Add regressions to the suite that owns the behavior. Avoid file splitting solely to reduce line counts.
- Use locked dependencies via `npm ci`. During iteration run focused checks and (for UI/Renderer/Example changes) inspect real-browser output before broad CI. Before final acceptance run the required Quality, targeted CI and scientific/regression gates; do not weaken tolerances or skip data-integrity checks. Report exact commands, results, commit and environment.
  **Source retrieval before requesting uploads:** Reuse the existing exact-SHA
  source-only GitHub Artifact, verify `wafercad-source-manifest.json`, and
  obtain the pinned Three.js 0.179.1 tarball separately. Search the WaferCAD
  Project Sources/current workspace first; use the tracked
  `vendor/npm/three-0.179.1.tgz` fallback only if missing. Restore via
  `python3 scripts/restore-pinned-three.py --archive <path>` (or
  `WAFERCAD_THREE_ARCHIVE`), which checks `package-lock.json` SHA-512.
  Never package Three.js in a source-only Actions Artifact. See
  [offline bootstrap](docs/DEVELOPMENT.md#offline-source-transport-and-threejs-priority)
  before retrying blocked `git clone` or requesting another ZIP.

## CI execution policy (mandatory; 2026-10-22)

**One scheduled integration run per day at 02:30 UTC. No browser,
Renderer, Example, scientific matrix or History/Recovery suite runs automatically
for ordinary Draft pushes.** Before pushing, run the smallest owning Node tests,
science contracts and actual local Chromium/Playwright captures; keep exact-SHA
source-bound verification receipts. Draft PRs should have a valid local `draft` (or `full`) receipt. Alternatively,
PR Quality may run a strict incremental path **only** after verifying the full
receipt of the exact main parent and executing the explicitly owned changed-file
lint/format and Node contracts on the exact PR merge tree. Unknown/high-risk
diffs, missing baselines and failed targeted tests reject this shortcut and
require full proof. A Ready PR requires full proof **or** passing verified-base
incremental Quality plus the risk-selected reusable acceptance gates from
`ready-impact.yml`. Do not trigger unbounded remote fallback Quality.

The only automatic PR workflows are `Quality`, `Release evidence contract`,
and `Ready risk-targeted acceptance`. All heavyweight workflows are called by
these governed entrypoints when needed, by `daily-full.yml` at 02:30 UTC,
by an explicitly authorized manual dispatch, or by the existing fail-closed
production Pages release chain. The one schedule is the daily controller; do
not reintroduce workflow-specific weekly/daily schedules or broad PR events.

**Local enforcement:** `node scripts/ci-trigger-policy.mjs` and
`node --test site/tests/ci-trigger-policy.test.mjs`. They are also run in the
lightweight release-contract gate; all changes to automatic triggers need
explicit review. Nightly measures total Runner minutes against a 75-minute
operating target; a budget alert is not a reason to weaken a scientific gate.
A scheduled result is valid for **only its tested SHA**; Ready and release
checks still verify the actual candidate SHA. `pages.yml` retains independent
fail-closed publication and rollback gates. See `docs/CI.md`.

## Chromium-first local visual acceptance

For any visual change involving UI, Renderer, Examples, Mask, 3D or Section, default to **real local Chromium screenshots and independent AI visual review**. GitHub CI is not the primary visual-debugging loop.

1. Prefer Playwright launching local Chromium against the actual WaferCAD development server.
2. Operate the real application: select the relevant Example, configure the camera/view, zoom, ROI and display modes, and capture actual screenshots.
3. Independently inspect the screenshots. Fix obvious visual defects and capture again until the observed result is acceptable.
4. Do not substitute mock HTML, simulated screenshots, or passing tests alone for real WaferCAD browser visual acceptance.
5. After local visual and relevant focused tests pass, run risk-appropriate Targeted CI. Before final merge/release acceptance, run the required Quality, scientific regression and release gates.
6. If the source is inaccessible, Chromium cannot start, or real screenshots cannot be captured, explicitly report the blocker and **do not claim visual acceptance**.
7. Never omit necessary scientific-correctness, data-integrity, Recovery or other critical-risk tests merely to save CI time.

**Default sequence:** local change → real Chromium screenshot → AI visual inspection → focused local tests → batched fixes → push → necessary CI → final acceptance.

**Managed Chromium recovery (mandatory before declaring visual diagnostics blocked):** If normal app navigation fails with `ERR_BLOCKED_BY_ADMINISTRATOR` (including a managed `URLBlocklist: ["*"]`), reuse the existing `scripts/offline-native-app-capture.py` and follow [Offline Visual Kernel — real native app](docs/tools/OFFLINE_VISUAL_KERNEL.md#real-native-app-with-offline-swiftshader-diagnostic). It attempts normal-origin loading, then uses headed Chromium/Xvfb, pinned local Three.js and an `about:blank` fallback for real app/Renderer diagnostics. Start with `--inmemory-demo`; use `--inmemory-project <file>` plus optional ROI/Z break for real validated model geometry. **Do not create a second standalone Chromium runner** or treat `offline-visual-kernel.mjs` SVGs as native WebGL images. The null-origin diagnostic cannot validate Worker-backed project Open, persistent storage, History/Recovery or complete Workstation interaction; those still need normal-origin targeted acceptance. Record the precise coverage and limitations.

Minimize redundant CI without lowering final acceptance standards.

**Local Quality ownership:** Prefer local `node scripts/local-verification.mjs run draft`
for development and `run full` before final acceptance. Supported Node LTS
(22 or 24) and the exact pinned npm dependencies are sufficient; a Git checkout
or staged index is **not** required when the exact source-only package includes
`wafercad-source-manifest.json`. The verifier fingerprints actual file bytes
and the complete inventory; CI independently recomputes the fingerprint on the
proposed merge tree. Existing Git-index v1 reports remain supported. A changed
source tree invalidates its earlier blanket Quality proof, **not the value of
prior diagnostic results**. Prefer valid full reports to avoid duplicate CI;
missing or stale PR proof fails closed and must be regenerated locally.
The scheduled nightly and production release workflows retain their separately
specified real test execution paths. No evidence shortcut may weaken
scientific, Worker/History/Recovery, visual or release gates. See `docs/CI.md`.

- Keep approved platform-specific visual baselines separate. Do not replace an approved baseline merely to hide a failed comparison.
- Preserve other developers' uncommitted work. Inspect branch, HEAD and working tree before changing Git state; integrate concurrent upstream changes without force pushing.
- Update durable engineering/scientific contracts in the repository. For PR-specific progress, failures and handoff, maintain the PR description as the current status and comments as chronological evidence; do not create dated audit/handoff Markdown by default. Keep essential scientific provenance, fixtures and safety-critical evidence in version control. Chats and ignored artifacts are not authoritative.
- Follow the user's authorization for pushes, deployment and CI; do not infer permission to trigger costly manual jobs from a read-only review.
