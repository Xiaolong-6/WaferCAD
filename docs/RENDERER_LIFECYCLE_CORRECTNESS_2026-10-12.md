# Renderer lifecycle correctness backport

**Base:** `main@560c97190c707e8cd0e20177156bac063e4acbf6`. The independently tested helpers were extracted from the V3/V4 renderer experiments. This small patch does not merge either experimental renderer PR.

## Behavior

`site/renderer-capture-transaction.js` owns temporary 3D PNG capture setup, rough-mesh preparation, PNG encoding, temporary WebGL disposal, original pixel-ratio restoration, camera-aspect restoration and the redraw request. It continues cleanup after a failure and aggregates cleanup exceptions without hiding the original error.

`site/renderer-v4-resource-lifetime.js` recursively releases scene-owned geometry, materials, textures and retired flat templates without disposing shared objects twice. A failed disposal does not stop the other resources from being released.

`site/three-view.js` uses these common helpers. Focused Node regression tests and the existing Issue #11 source contract cover the behavior.

## Boundaries and verification

The backport makes no changes to Process, stored geometry, History, Mask, ROI, scientific model output, renderer feature defaults, MSAA settings or approved visual baselines.

Standard Quality, targeted browser tests and the owning v2 3D checks validate the changed main-based branch. The exact CI status and tested commit are tracked in the pull request.

Separate R9 physical RTX 3060 evidence showed fresh-context pixel drift with standard 4-sample MSAA and exact parity with a zero-MSAA diagnostic. That result does not authorize a production MSAA change or a bulk merge of V3/V4.
