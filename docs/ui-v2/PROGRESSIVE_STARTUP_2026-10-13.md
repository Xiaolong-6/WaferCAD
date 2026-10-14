# Progressive Workstation startup (P1)

**Scope:** UI v2 and cooperative 3D scene scheduling. This work is layered on the
startup-shell and inspector-width correction in PR #187. Keep the P1 PR in Draft
until the browser gates and any necessary physical-GPU review are complete.

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
