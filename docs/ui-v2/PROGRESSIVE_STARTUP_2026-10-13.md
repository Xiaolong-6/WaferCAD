# Progressive Workstation startup (P1)

**Scope:** UI v2 and cooperative 3D scene scheduling. This work is layered on the
startup-shell and inspector-width correction in PR #187. Keep the P1 PR in Draft
until the browser gates and any necessary physical-GPU review are complete.

## Current acceptance decision (16 October 2026)

The user approved a **1,000 ms inclusive responsiveness ceiling** for PR #188,
replacing the earlier assistant-proposed 500 ms target. Both of these must
hold **for each** real-device M3D first load and saved-Quality recovery:

- Maximum observed main-thread Long Task **<= 1,000 ms**.
- Maximum observed trusted input queue-delay estimate **<= 1,000 ms**,
  with input observed during loading. Main-thread input/Orbit/Zoom verification
  must still succeed.

Scientific integrity, exact model hash and layer-count continuity, History
and Recovery transaction safety, correct Fast-to-Quality restoration, stable
final screenshots and verified physical GPU identity remain independently
mandatory. No existing scientific tolerance or assertion is relaxed.

Existing references to 500 ms elsewhere in this document describe **historical
acceptance targets, diagnostic counters or past samples**, not the current
release gate. A software-Chromium pass cannot certify physical RTX/iGPU
responsiveness; do not merge until the updated gate and all required visual,
science and recovery checks pass and the user explicitly approves Merge.

## Ownership and commit boundaries

- **Shell ready:** the navigation, final four-view grid, slots and adapters are
  assembled. Navigation is visible while the editor is inert.
- **Project ready:** import/Recovery transaction has finished, including its
  safety checkpoint. Only now are real Project/Process contents exposed.
- **First frame ready:** at least one visible scientific view has completed
  its own first paint, independently of the other views.
- **Per-view ready:** Main, Mask and Section report after a completed visible
  canvas render. 3D observes the real renderer frame serial, not merely
  Three.js initialization or a queued frame.
- **3D unavailable:** failure of WebGL or its dependencies only releases the
  3D fallback; other views continue functioning.

These flags are presentation-only. Do not persist them in the scientific
project, reuse them for History, or equate them with an idle background task.

## 3D preview and refinement

A transient Fast presentation is permitted for the first 3D frame. If the
restored project requests Quality, its actual Quality setting is left intact.
A later idle task requests refinement, retaining the coarse usable frame during
the transition and surfacing refinement errors without clearing the existing
canvas. Camera state, material layers and exports keep their existing owners.

To reduce input starvation in dense non-array M3D designs,
`shouldYieldDuringSceneAssembly` also enables the existing 8 ms cooperative
assembly budget for scenes with at least 96 cap/sidewall groups or at least 32
annotations. Array scenes keep their previous 64-instance threshold.
The new yield checks in implant/electrical assembly alter scheduling only;
they do not simplify canonical geometry or modify the final surface plan.

The renderer still contains some synchronous geometry tasks. Cooperative
scheduling improves opportunities for browser event handling but **does not
establish a hard maximum input latency**. Avoid claiming complete background
isolation until a measured hardware run covers those tasks.

## Gates

- Node state-machine and assembly policy tests.
- Delayed M3D project request: the Shell and fixed grid must be visible
  without leaking the default Base or Process editor.
- Real Main/Mask/Section first paint without waiting for the 3D first frame.
- Fast-first-frame/Quality restoration and no stored Quality mutation.
- Existing Stage C/M4, D1, 3D and Main/Mask/browser/Quality gates.
- Later hardware review: input latency, first-frame timestamps, GL identity,
  final geometry/pixel stability and visible recovery from a 3D failure.

**Do not change accepted visual baselines or merge into main before review.**

## Hardware evidence and CPU root-cause update (13 October 2026)

Two independent Windows Chrome/ANGLE D3D11 runs confirmed NVIDIA RTX 3060,
stable repeated Quality PNGs, unchanged 27-layer model hash and correct
Fast → Refining → Quality readiness transitions. The original acceptance
remains **blocked**: worst observed main-thread Long Tasks were between
15–27 seconds. Neither uploaded "profile" ZIP contained a Chrome CPU profile,
so those archives alone do not identify the blocking functions.

CI Chromium CPU profiling (run 38370377108) reproduced about 16.0 s and
27.0 s Long Tasks. Hotspots include `polygon-clipping.umd.js` sweep
comparators and `renderer-instancing.js::ringKey`. Project import additionally
performed a redundant main-thread JSON serialization, parse and validation
after the strict import Worker had already validated the entire project.

Two byte-preserving mitigations landed on the P1 branch:

- Linear-time canonical ring rotation, verified against historical signatures
  for rotated, reversed, repeated and numeric-prefix point sequences.
- Direct adoption of validated `project-worker.js` output, without the redundant
  `JSON.stringify → Blob → JSON.parse → validate` round trip. Snapshot
  integrity copies and History mutation validation remain in place.

Software-CI A/B timing (Chromium, **not physical RTX**):

| Metric                           |  Before |   After |
| -------------------------------- | ------: | ------: |
| M3D Project Ready                | 30.41 s | 14.84 s |
| M3D first scientific frame       | 31.37 s | 16.09 s |
| M3D worst Long Task              | 16.01 s | 12.60 s |
| Restored Quality Project Ready   | 27.38 s | 28.30 s |
| Restored Quality worst Long Task | 26.99 s | 27.95 s |

Focused renderer parity, snapshot integrity and profiling CI checks passed.
The persistent-workspace restore and material-topology ownership still perform
expensive synchronous processing. A future change must move verified heavy
restore/geometry work off the foreground thread, preserving Recovery
transactions, physical geometry, ownership, GL state and visual baselines.
Do **not** close the P1 hardware responsiveness gate or merge on this evidence.

## P1-A / P1-C follow-up — 14 October 2026

The earlier 13 October hardware and CPU results above remain historical evidence.
Later commits reduced several previously identified main-thread import and
History bottlenecks, but the **500 ms maximum Long Task acceptance gate
remains open**.

The [three-run software Chromium campaign](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38531160978)
on HEAD `53c227f` sampled each scenario in a separate browser context
within the same browser process. The data are diagnostic and do not imply
cold-process or physical-GPU parity.

- M3D first load: longest Long Task median **1,110 ms** (range **1,110–1,162 ms**);
  first scientific frame median **15.64 s**, 3D Ready median **34.21 s**.
- Restored Quality: longest Long Task median **1,248 ms** (range **1,050–1,268 ms**);
  first scientific frame median **15.72 s**, 3D Ready median **33.57 s**.

For 64 imported historical states, the new browser performance marks
recorded an independent snapshot-attestation clone of 144–175 ms,
History batch validation of 60–108 ms, and staged History import
active time of 492–548 ms. Import staging yielded to the main event
loop 18 times. The larger isolated Long Tasks still chiefly involve
polygon clipping/bounds, surface-plan Worker message reception and
native WebGL program submission.

The [exact-head P1-C run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38532723065)
on `f5ba2f1` passed Quality Gate, targeted History/renderer tests,
legacy persistence, real progressive startup and cross-view Recovery,
and software CPU sampling. Its single-run maximum Long Tasks were
1,165 ms (M3D) and 1,045 ms (restored Quality); this is **not** a
three-run trend estimate.

History import now stages copies cooperatively and commits the live
project with History in the same final synchronous phase. New import,
synchronous replacement and Clear invalidate an earlier in-flight
cooperative import; a superseded request throws `AbortError` before
publishing stale History. The regression suite covers these races,
explicit abort and isolation from incomplete History.

Ordinary branch push CI collects a single CPU diagnostic sample and
retains the complete correctness/browser gates; explicit workflow
dispatch selects the three-run campaign. Attach the exact-head CPU
artifacts when making performance comparisons.

### Remaining blockers and ownership

- P1 History integrity and reproducible diagnostics are covered by the
  above test results. Maintain failure-atomicity tests for any further
  persistence or Recovery changes.
- Geometry topology, surface-plan message transfer/assembly and WebGL
  compilation/submission still require coordinated Renderer work;
  do not introduce a second renderer or weaken scientific geometry.
- Physical-device acceptance should include integrated GPUs where
  available, not only NVIDIA RTX 3060. Test final Quality fidelity and
  responsiveness in addition to coarse first-frame readiness.
- PR #188 remains Draft. The feature branch has diverged from `main`;
  reconcile overlapping UI v2 entry/runtime/workflow and CI changes
  before merge review. Green CI alone is insufficient for this PR.

## P1-E streamed Surface Plan transport — 14 October 2026

Large non-array ownership plans now send caps, polygon batches, sidewalls
and border lines through separate Worker messages. The renderer assembles
these in private memory, validates expected collection sizes and publishes
the plan once the final message arrives. Abort and malformed replies leave
the previous geometry and ownership cache unchanged. Small plans retain
the original single-message path.

Scientific contract: no polygon resampling, coordinate rounding, material
ownership changes or second geometry implementation. New tests verify
precise multi-ring coordinates, real Kernel topology, ordering, incomplete
streams, cancellation and cache atomicity.

[Exact-head software Chromium CI](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38552055201)
on `48c3f0a` passed Quality, targeted renderer/History parity, Legacy
persistence, progressive boot and cross-view Recovery. The CPU profile
no longer attributes any over-500 ms Long Task to
`renderer-surface-plan-async.js::worker.onmessage`; earlier samples
attributed approximately 500–950 ms tasks to receiving a full plan.
This is evidence for reducing the individual receive-task cost, not a
controlled end-to-end speedup.

Single-sample results: M3D first scientific frame 15.68 s, 3D Ready
35.18 s and largest Long Task **1,143 ms**; restored Quality first
frame 16.02 s, 3D Ready 35.36 s and largest Long Task **1,103 ms**.
Remaining hotspots are polygon bounds/boolean geometry, snapshot
copying/GC and native WebGL program/buffer submission. The 500 ms
responsiveness threshold and physical-GPU acceptance remain open.

Historical P1-E limitation: batching originally bounded whole polygons,
so one very large polygon could exceed the message budget. P1-H below
addresses that case with bounded exact point chunks while preserving
physical topology and fidelity.

## P1-F disjoint Polygon union cloning — 14 October 2026

The exact Boolean union path still runs for touching or overlapping
polygons. For a single already-normalized component, avoid cloning
the normalized geometry a second time. For fully disjoint components,
avoid a second full `normalizeMulti` pass after the broad-phase test.
The original inputs remain deeply detached from returned geometry.

New parity tests cover 625 separated wafer polygons, exact coordinate
values including subnanometer positions, caller mutation isolation,
mixed overlapping and isolated components, and malformed polygons.
No new geometry tolerance, snapping or approximation was introduced.

[Exact-head P1 CI](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38561846383)
at `fb645bf` passed Quality, targeted scientific tests, Legacy
persistence, real Progressive Startup, Quality Restore and Recovery.
A single software Chromium profile measured M3D first frame
at 16.21 s, 3D Ready at 37.06 s and the largest Long Task at
**1,306 ms**. Restored Quality measured first frame at 16.39 s,
3D Ready at 38.48 s and largest Long Task at **1,426 ms**.

The preceding software sample at `16e8890` measured maxima of
1,076 ms / 1,347 ms, respectively. Different CI conditions and
only one sample per configuration prohibit a causal performance claim.
A substantial Boolean/GC long task is still present; the complete
startup responsiveness requirement is **not satisfied**.

Further work must target measured Polygon Boolean ownership and
WebGL submission bottlenecks, with controlled multi-run A/B evidence
and physical GPU/iGPU validation. Avoid repeating broad History
refactors when they do not address the dominant sampled blocks.

## P1-G exact broad-phase connectivity and cross-GPU acceptance — 14 October 2026

The non-array Polygon union now indexes active bounding boxes by Y while
sweeping in X. This avoids examining every same-X polygon when their Y
intervals are disjoint. Each potentially touching pair still belongs to
the original exact Boolean operation; the original EPS comparisons,
component source ordering, geometry normalization and caller isolation
are retained. Exhaustive-reference tests cover random overlap graphs,
subnanometer seams, transitive connectivity and 1,800 vertically
separated boxes. The existing scientific union tests remain required.

The physical hardware acceptance harness now classifies unmasked NVIDIA,
Intel and AMD WebGL adapters, while rejecting unknown/software drivers
(including SwiftShader, WARP and llvmpipe). This prevents an integrated
GPU from being rejected merely because it is not NVIDIA. This identifies
reported GPU hardware; a real-device performance profile is still required.

**Status at implementation:** code and tests are pushed for CI review;
no speedup, 500 ms pass or physical-GPU acceptance is claimed without
new controlled measurements. Keep PR #188 Draft, preserve all final
Quality and scientific parity gates, and do not deploy yet.

## P1-H bounded giant-polygon transport and input acceptance — 14 October 2026

The Surface Plan stream now bounds packets even if one polygon has more
than 4,096 points. Oversized polygons are transported as ordered ring
headers and exact point chunks, then reconstructed only in private
receiver state. The published plan remains transactional. New tests
cover a 9,000-point outer ring, a 7,000-point hole, subnanometer values,
packet ordering, truncated chunks and independent returned memory.
No physical topology or renderer shading policy was changed.

The hardware acceptance harness now measures **two separate conditions**:

1. Main-thread Long Tasks remain at or below 500 ms on physical GPU.
2. Trusted browser input events are sampled across startup/refinement.
   Their queue-delay estimate must remain at or below 500 ms, including
   at least one loading-phase event. Input injection begins before
   DOMContentLoaded and records the original CDP event timestamp.
   Once Quality is ready, real-canvas pointer dragging must change
   Orbit state and wheel input must independently change camera radius,
   without changing model hash.

The input queue-delay estimate compares high-resolution event timestamps
with delivery time. It is **not** a compositor-to-photon latency measure.
The real gesture and final Quality pixel/hash requirements remain
independent gates. Test the physical adapter identity, Fast-to-Quality
sequence and repeated final screenshots as before.

For a physical Windows Chrome run, check out the PR head and execute
`node scripts/v2/p1-hardware-acceptance.mjs --profile`. Its report,
CPU profiles and screenshots are produced in
`test-results/p1-hardware/`. A new report overwrites prior local
evidence in that directory, and the script opens an isolated Chrome
context without using the regular browser profile.

A passing Linux/software Chromium CI validates code, scientific parity
and the acceptance harness; **it cannot certify real GPU performance**.
Keep #188 Draft until a current-revision physical GPU/iGPU report meets
all gates. Reconcile Main's Mask post-import Cell/Layer refresh with
the branch's Worker-validated project import shortcut at final sync.

## P1-I sidewall assembly and Main synchronization — 15 October 2026

The last completed single-sample software Chromium diagnostic before this
change ([P1 CPU run 38579823696](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38579823696))
reported maximum Long Tasks of **1,352 ms** for initial M3D and **1,290 ms**
for restored Quality. Its hot functions included polygon-clipping/GC, native
WebGL buffer creation, History snapshot cloning and sidewall triangle
construction. These remain failures of the 500 ms responsiveness objective.

The sidewall constructor now writes the same cross-product unit normals
directly to the final attribute arrays instead of allocating an intermediate
edge, normal and normalized-vector array for each triangle. The quality policy
is resolved once per synchronous sidewall batch. An independent reference
test compares the previous arithmetic against 5,000 random and degenerate
triangles, including exact Float32 positions, normals and depth attributes.
No physical edge threshold, topology, face winding or Shader policy changed.
The expected benefit is reduced temporary allocations; **no runtime speedup
is claimed until controlled post-change CPU results are recorded**.

Main integration commit `0bbde6f` has two parents and incorporates four
new Main commits. Eight new acceptance/workflow files and the updated
`docs/testing.md` were adopted verbatim. The Main Mask Cell/Layer controls
refresh is preserved alongside the branch's validated-Worker Project import
shortcut. Compare reports zero commits behind Main at the integration point.

The P1 PR remains Draft until an exact-head CPU comparison, current strict
Quality/browser/scientific CI, and real GPU/iGPU acceptance satisfy their
respective requirements. Do not infer hardware responsiveness from the
Linux software-renderer sample.

## P1-J border-clipping allocations — 15 October 2026

Software Chromium CPU sampling after the corrected Boolean test import
([P1 run 38705639053](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38705639053))
reported maximum Long Tasks of 1,149 ms for M3D first load and 1,354 ms
for restored Quality (one sample). Shader and buffer submissions, GC,
History clone and polygon clipping remain major bottlenecks. Neither case
passes the 500 ms target.

The 3D renderer's `displayBorderPositions` hot path previously allocated
two endpoint arrays and two interpolated point arrays per displayed segment.
The new `renderer-border-position-clip.js` appends exact interpolated
coordinates directly to the final buffer, retaining Z Break cut ordering,
visibility decisions and numeric interpolation order. An independent test
retains the historical implementation and compares randomized segments,
disabled Z Break, precise/degenerate coordinates and Float32 output.
No 3D material, topology, physical extent or face border semantics change.

This is a candidate reduction in JavaScript allocation overhead, **not a
verified end-to-end performance improvement** until a current-revision
P1 CPU comparison and physical GPU/iGPU acceptance are available.
Keep PR #188 Draft, do not merge or deploy on CI green alone.

## P1-K asynchronous History attestation — 15 October 2026

The Worker already validates the entire restored project. Before History
adoption, the workstation independently clones the imported snapshots so
mutation can be detected by `isValidSnapshotStates`. Previously the
workstation cloned **all** snapshot, branch-node and branch-head states in
one main-thread `structuredClone(states)` call. The single task remained
visible in software-Chromium CPU profiles.

Progressive startup and Worker-based project import now use
`readWorkerValidatedProjectSnapshotAsync`, staging independent attestation
copies in private batches of four states and yielding the browser thread
between batches. A monotonically increasing generation guards against stale
concurrent imports: a superseded attestation throws `AbortError`, and no
partially cloned cache is published. The existing synchronous reader is
preserved for legacy consumers. Test coverage includes five- and nine-state
imports, deterministic yielding, atomic publication, independent copied
geometry and a newer synchronous import superseding an older asynchronous
one.

A single extremely large state still incurs one indivisible
`structuredClone` and could exceed 500 ms. The change reduces the
**aggregate per-task** clone span in multi-state histories; it is not proof
of the physical-GPU responsiveness gate. Monitor
`wafercad:history:attestation-clone` duration and its
`activeCloneMs` and `batches` detail, while retaining strict History
integrity, Recovery and final screenshot gates. PR #188 remains Draft and
must not be merged or deployed solely because CI is green.
