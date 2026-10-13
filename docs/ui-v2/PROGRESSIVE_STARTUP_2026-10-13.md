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
