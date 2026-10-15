# PR 250 outline ownership and depth audit

Repository: `Xiaolong-6/WaferCAD`. Implementation starts from product revision
`f76c8e02a2e9944dcea72ea1db3410727bb9a67d` on
`fix/3d-rough-seams-transparent-outlines-20261015`.

## Reproduced ownership defects

The original ROI matcher required both endpoints of a material wall to lie on
one ROI edge. A diagonal wall from `(0,0)` to `(4,4)` disappeared when the ROI
ring described that edge as `(0,0)` to `(2,2)` to `(4,4)`. The same failure
affected a split collinear hole boundary. The new regression returned zero
segments instead of the expected eight before the fix.

Two adjacent same-material wall spans from `(0,0)` to `(2,0)` and `(2,0)` to
`(4,0)`, with equal lower and upper interfaces, produced an artificial vertical
border at `(2,0)`. That partition is not a physical edge. Its new assertion
failed before the fix.

`sectionCutContours` now intersects material-wall intervals with the union of
collinear ROI edge intervals, including hole rings and partial overlaps.
Opposite straight continuations of equal material and equal interface spans
suppress the artificial vertical partition. Actual ROI corners and changes in
material ownership retain their vertical edges. This changes contour ownership
only; it does not modify material regions, thicknesses or saved projects.

## Shared renderer boundary contract

ROI contours consume `sidewallBoundarySamples` from
`rough-boundary-profile.js`. When supplied, the `boundaryProfiles` map contains
the actual rendered cap boundary positions by cap index. Buried perimeters use
those positions directly. ROI lower and upper interfaces use the same union of
boundary vertices and linear interpolation as the sidewall. Independent
morphology evaluation remains a fallback when the corresponding mesh profile
does not exist; it does not establish exact alignment with a future mesh.

## Depth classification

The previous hidden-line pass disabled depth testing. It therefore displayed a
reference overlay, without establishing which side of a structural surface a
line fragment occupied.

`three-outline-pass.js` preserves the normal translucent color rendering, then
clears depth alone and renders structural occluders with their original
materials, color writes disabled, and depth writes enabled. Reusing materials
retains GPU morphology, clipping and instancing. A small positive polygon offset
allows a contour on its own surface to pass the visible depth comparison.
The final outline pass uses solid `LessEqualDepth` and dashed `GreaterDepth`
materials. Both require depth testing and neither writes depth. Implant and
Electrical annotation volumes are excluded from structural occlusion.

The pass restores renderer, scene, object and material state even when rendering
throws. It does not allocate persistent render targets or replace surface
materials. With all outlines disabled, it uses one ordinary scene draw. With
outlines enabled it adds a structural depth draw and an outline draw; the added
cost requires runtime measurement, especially for large arrays. It classifies
against nearest exterior structure, rather than accumulating transparency or
displaying an X-ray attenuation model.

## Executed focused checks

Windows, Node `v26.7.0`, locked Three `0.179.1`:

```text
node --test site/tests/three-outline-geometry.test.mjs site/tests/three-outline-pass.test.mjs
12 passed, 0 failed
```

The depth tests cover pass membership, excluded annotations, retained invisible
objects, exception cleanup, Border-disabled fallback, and an actual GPU rough
decorated `THREE.InstancedMesh` retaining its material identity, shader callback,
program key, material version and instance count. These are state and ownership
checks; actual WebGL screenshots, CPU/GPU numerical parity, multi-view line
classification and performance acceptance remain part of the integration audit.
No screenshot baseline is approved or replaced by these checks.
