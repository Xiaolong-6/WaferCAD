# Material / Target process semantics — design review (2026-10-13)

**Status: proposal; NOT accepted product behavior.** The `Material / target` v2 Manual preview remains disabled. Do not activate it or change the canonical schema before this contract is reviewed.

## Separate identities

- **Material**: chemical/optical composition label, e.g. Si, SiO2, Al2O3. A label is not unique and is never a substitute for an entity ID.
- **Layer**: persistent, addressable geometric material entity identified by stable Layer ID; multiple Layers may have the same Material.
- **Target**: selector used by an operation to address one or more existing Layers, or a surface/region when no Layer should be selected.
- **Face**: `front`, `back`, `both` for Process. Main camera orientation is separate. Both creates two independent Front/Back Layer IDs, carried in a single restorable Process Step, consistent with `PROCESS_BOTH_FACE_2026-10-11.md`.
- **Area**: full/Mask/ROI selection defines XY footprint; it is orthogonal to Layer and Face.

## Proposed operation matrix

<!-- prettier-ignore -->
| Operation | New material | Existing target | New Layer identity | Semantics requiring review |
| --- | --- | --- | --- | --- |
| Deposit/ALD | Required | None, except support surface | New Layer; Both creates two | Physical exposure and conformal coverage |
| Grow | Required | Exposed source surface or material | New Layer(s) per face | Thermal oxidation silicon consumption vs current geometric growth |
| Directional/Isotropic Etch | None | Existing Layer(s) or explicit Material set | Target Layers removed/reduced | Multiple identically named Layers, selectivity |
| Extend | None | Existing exposed Layer ID | Same target Layer | Reuse exact Layer identity and exposure checks |
| Transfer/Laminate | Required | Surface/support | New Front/Back identities | Existing interface ownership |
| Implant/Electrical | Annotation rather than material | Region, exposure and mask | No material Layer | Annotation depth/polarity semantics |
| Lift-off | Existing sacrificial Layer | Exact sacrificial target | Removal only | Both unsupported under current contract |
| CMP/Planarize | None | Absolute-Z reference and face | Existing geometry altered | Both unsupported under current contract |

**Proposed UI:** contextual single row, caption changes to `Material`, `Target layer` or `Target material(s)` according to Operation. Offer an explicit all-matching-Layers action instead of silently selecting same-name Layers. Hover explanation uses the shared UI v2 tooltip architecture and no added help icon. Manual and Recipe encode the same operation arguments.

## Required scientific decisions (open)

1. **Etch targeting**: recommend stable Layer ID as the default, with an opt-in Material-wide selector that clearly enumerates matched Layer IDs.
2. **Grow and oxidation**: recommend separating a geometric outward-growth approximation from a future volume-conserving/consuming thermal-oxidation model. Do not claim Si-consumption physics until kernel, validation and documentation actually implement it.
3. **Paired Both Layer choice**: when selecting one paired Layer, should paired targeting always auto-expand, or require a visible paired-target indicator? Preserve current Kernel semantics until explicitly approved.

## Case studies for review

- **Photodetector**: two independent SiO2 Layers from Both-side thermal oxide approximation, then explicit Back removal or selective process.
- **PERC**: symmetric passivation, front/back Mask contact patterning with distinct targets.
- **ALD**: nominal conformal film on exposed faces, each face retaining a separate Layer ID under Both.

## Acceptance for a later implementation

Stable Layer references across History replay, Recipe and Project Save/Import; correct mixed-material/identical-name selection; valid Both paired ID mapping; atomic failure; no implied fabrication physics beyond the actual Kernel; concise UI that obeys M1.5/M2 design and hover conventions.

No code, editor dropdown, serialization or test baseline is changed by this proposal.
