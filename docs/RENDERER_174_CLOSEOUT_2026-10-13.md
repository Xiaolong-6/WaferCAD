# Renderer PR #174 — evidence-led closeout (2026-10-13)

## Decision

Close PR #174 without merging experimental rendering policies into main.
Maintain the original 4-sample WebGL MSAA behavior, zero-pixel acceptance
requirement, and default-off status of all V4 optimization flags.
No new operator-assisted GPU run is justified by the current evidence.
This closeout does not claim that the physical GPU rasterization root cause
has been identified.

The production lifecycle/screenshot/resource-retirement correctness changes
were already merged independently through PR #183. Do not re-cherry-pick
them from #174 or merge its complete V3/V4 experiment history.

## A. Fixed evidence-collection contract

The failed operator acquisition
`2026-10-13T13-06-25-580Z.zip`, recorded at V4
`99bf21a9ede9a9b9120c8f68d9d1c62470e5fa1b`,
contains five archived files: three preparation logs, the campaign
summary and the focused-run log. The browser runner returned exit code
zero but wrote to the old
`renderer-hardware-fresh-context-ab-phase-window-128-384`
directory. The collector looked for the suffixed
`renderer-hardware-fresh-context-ab-phase-window-128-384-focused-129-154`
directory. It therefore recorded `reportFile=null`,
`evidenceFolder=null`, `campaignComplete=false` and
`diagnosticComplete=false`.

The shared `renderer-hardware-output-path.mjs` contract now defines
both locations, and the browser runner and collection plan import the
same function. A separate, fail-closed inventory guard requires four
nonempty PNG screenshots, four label-matched JSON traces and
`report.json` before the collector can classify a four-arm R9 result
as complete. The original artifact-copy behavior still keeps partial
evidence on failures.

The GPU-free regression
`site/tests/renderer-r9-evidence-zip.test.mjs` exercises a simulated
R9 focus run through the actual copy and ZIP-writing functions, parses
the resulting ZIP, checks the exact file inventory and bytes, removes
one trace to verify rejection, and reproduces the mismatched-output
failure. It also asserts both output-path clients import the shared
function. This is a software integration test, not a substitute for a
physical GPU acceptance run.

## B. Final scientific findings

The completed preserved-MSAA RTX 3060 trial
`2026-10-13T10-41-24-416Z.zip` captured four independent 4-sample
contexts with `preserveDrawingBuffer=true`: OFF/OFF differed by
11 pixels and ON/ON by 76 pixels, maximum channel delta 1/255.
Preserving the framebuffer does not remove native cross-context drift.

The completed production-policy 4-sample phase-window trial
`2026-10-13T12-25-04-372Z.zip` captured four contexts with
`preserveDrawingBuffer=false`: OFF/OFF differed by 83 pixels,
ON/ON by 99, maximum channel delta 3/255. Native framebuffer hashes
diverged before screenshot composition. The first observed mismatch
was between draws 128 and 154. From draw 154 through 358, the hashes
grouped by repeated trial index rather than ON/OFF policy. At draw 384
all four differed. These are reproducible observations within this
capture, not proof of a particular driver, texture or resolve cause.

The incomplete focus ZIP contains only text summaries, not the
original screenshot/trace/report files. Its log records OFF/OFF
106 differing screenshot pixels and ON/ON 80, maximum per-channel
delta 3/255. The reported 26 per-draw *bounded sampled* input
fingerprints are same-policy identical, but GPU data beyond the
4096-byte buffer samples, texture image contents and other
uncaptured state remain unverified. The missing original artifacts
make this run ineligible for evidence-completeness acceptance.

Earlier physical no-MSAA Index, Caps and Combined trials each
achieved exact screenshot parity, but `SAMPLES=0` changes the
approved production raster policy and visual baseline. These results
do not authorize disabling MSAA or relaxing strict pixel comparison.

The defensible conclusion is narrow: the observed small-region
4-sample framebuffer drift occurs in repeated OFF and ON contexts,
so V4 optimization alone cannot explain all pixel differences.
A particular hardware/driver causal defect has not been established.
Further repeated draw subdivision offers insufficient value to
justify another user-operated GPU campaign.

## C. Candidate disposition

**Index — Experimental / do not promote.** In the eligible
smooth-sidewall example, indexed vertices fell from 4,125,000 to
2,750,000 (33.3% within that eligible submesh). The physical
Index-only no-MSAA campaign reported approximately 118,800 fewer
CPU typed-array bytes (about 0.37% overall), with no reduction in
the 1,409 draw calls or 16,906,262 submitted triangles. The
exploratory A/B wall medians were 34.20/35.45 ms (B slower);
there is no repeatable native GPU performance or VRAM win.

**Shared flat Caps — Experimental / do not promote.** The physical
no-MSAA isolate showed roughly 331,776 fewer CPU bytes and zero
raster differences under that alternative policy. Exploratory
A/B wall medians were 37.35/39.85 ms. No credible native speed,
VRAM or standard-MSAA parity gain is established.

**Combined Index + Caps — Drop from the production promotion
candidate list.** Combined saves 450,576 CPU bytes (1.386% of
the measured CPU typed-array census) and 106 JS geometries in
the available RTX ABBA capture, without fewer draw calls or
triangles. Native standard-MSAA ABBA had same-policy context
drift and a separate candidate-correlated pixel region; no
causal attribution to either isolated feature is proven.
Timing varied strongly across replicate contexts and does
not establish speedup. Keep historical experimental code
in the archived branch only.

**Coarse adaptive tiles / CPU tile cache — Drop as a performance
solution.** The measured 625-site arrangement had 128 near
tiles, two mid tiles and zero far tiles. Small CPU cache hits
and unchanged 1,408 draw calls / 16,906,262 triangles on the
same software-WebGL frame do not substantiate responsive zoom
or GPU-work reduction.

**Responsive interaction preview / smooth worker — Experimental.**
A software-WebGL functional trace demonstrated approximately
16.9 million submitted triangles falling to 5.08 million during
interactive preview and restoring afterward. That establishes
a useful opt-in mechanism, not end-user input latency, physical
GPU frame-rate, visual parity across all modes or worker safety.
It remains a possible *separately scoped* future UX proposal.
Do not advance it via the 691+-commit #174 merge.

**Already integrated correctness fixes — Keep in main.** The
previously accepted screenshot capture-state and resource
retirement fixes were merged through PR #183. Verify their
presence in main rather than repeating tests or duplicating
commits from the experimental branch.

## D. Integration and closure

No unmerged V4 performance policy currently meets the production
acceptance criteria: verified user-visible responsiveness on the
target workload, demonstrable improvement beyond noise, full
4x-MSAA visual/scientific correctness, and a maintainable isolated
change. Accordingly, do not merge #174 as a whole or selectively
enable Index, Caps, Combined or coarse tile flags.

This PR's branch contains extensive historic development and is
substantially divergent from main. Extract a future independent
optimization only after separate quantitative evidence justifies
it; then create a minimal PR based on current main with targeted
UI, geometry, renderer and browser acceptance. Keep the archived
#174 branch and evidence documentation for traceability.

No more R9/R10/R11 hardware requests. A future product UX proposal
must have its own specific acceptance criteria, and must not
turn the operator into a general-purpose diagnostic CI runner.
