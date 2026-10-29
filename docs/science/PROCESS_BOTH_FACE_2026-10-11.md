# Process Face: Both — Kernel contract and handoff (2026-10-11)

## Scope

Adds `face: 'both'` as a single logical Process operation executed by the Kernel in a deterministic order: **Front → Back**. This is a Kernel/Recipe integration feature isolated from the in-progress Workstation UI v2 redesign. The active Main/Mask inspection face and persisted `project.activeFace` remain `front | back`. The current v2 Manual Process Surface selector supports **Front / Back / Both** (integrated in [Manual Both acceptance](../archive/ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md)); **Both must not change the global inspection face to `both`**. The original Kernel work preceded this UI integration.

A current Recipe code example:

```js
deposit({
  material: 'Al2O3',
  thickness: '20 nm',
  coverage: 'conformal',
  face: 'both',
  area: 'full',
});
```

The same syntax is available for directional deposition, Extend, directional/isotropic Etch, Transfer/Laminate, Implant, and Electrical Region. The existing single-face default remains `front`. Invalid recipe face values now fail validation instead of silently becoming Front.

## Execution and persistence

- The worker creates one candidate model and applies Front, then Back, using exactly the same Process area/Mask ROI for both.
- If either pass returns `changed: false` (or throws), there is no committed candidate; current model and History are preserved. A successful Both operation creates **one** History/Recipe Step and an atomic validated worker response. The canonical Process model revision increments for each physical face, so the internal `processRevision` increases by two for a successful Both Step.
- **Decision (user approved):** One Both Deposit or Transfer creates **two independent material Layer IDs** with the same material name: one Front, one Back. The result contains `layerIds: { front, back }` and a compatibility `layerId` pointing to Front. Each layer carries `processGroupId` (shared), `processFace` (different), and `pairedLayerId` (cross-reference). Each layer may subsequently be renamed, recolored, Extended, or selectively Etched independently. A shared Process Step does not imply a shared Layer ID.
- Deleting either material Layer leaves the other intact. The surviving Layer retains its process origin but clears the now-invalid `pairedLayerId`; subsequent Both operations fail atomically if they cannot modify both faces.
- For Both Extend and selective Etch, a selected Front layer with a paired Back layer automatically addresses that distinct Back layer on the second pass. Non-paired legacy layers such as Base retain their existing ID. Recipe material names that match more than one possible Front target are rejected as ambiguous rather than silently picking the wrong film.
- One History Step stores both layer IDs. History replay remaps both separately when rebuilding a sequence, so later target references remain valid even if the allocated layer ordinals change.
- Implant and Electrical Region create a separate annotated region for each face; IDs are returned together for color assignment. This does **not** imply a physical oxidation or solution-transport solver: it is the existing idealized 2.5D surface/coverage geometry repeated at the other exposed face.
- Canonical arrays are processed per face through the existing copy-on-write array Kernel. Both does not eagerly flatten an entire wafer.
- **Intentionally unsupported:** Lift-off, because the first face may remove the shared sacrificial material needed for the second pass; and Planarize/CMP with one absolute Z target, which would have ambiguous/opposed semantics. These explicitly fail rather than silently using Front only.
- A face with no eligible change causes the complete Both Step to fail. Users needing a one-sided operation should choose Front/Back explicitly. This prevents silently half-complete `Both` operations.

## UI v2 integration (implemented 2026-10-12) and remaining presentation work

- Process Surface options: Front / Back / Both. `Both` is an **operation target** only.
- The released v2 Manual Surface selector accepts `Both` and the Recipe editor preserves/restores `params.face === 'both'`; the retired Legacy editor's historical Front/Back-only controls are preserved at the `legacy-frozen` tag. See the [dated integration and test report](../archive/ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md).
- Send a _single_ worker operation with `params.face: 'both'`; do not call Apply twice in the UI.
- One Both application creates one restorable History Step with two distinct, paired material Layer IDs. The v2 Manual form exposes valid paired material targets and rejects unsupported Both combinations; a more explicit two-child layer/legend presentation remains a **future UX enhancement**.
- For a symmetric oxidation/ALD-like step, material thickness is measured from each local exposed face into the outward direction (one full thickness on each side). Any future diffusion/chemical/transport model should be a separate physical process implementation.

## 2026-10-13: Face-specific texture profiles in Both Etch

The bundled Perovskite–Si Tandem now uses one atomic Both Etch for symmetric substrate depth while preserving front/back pyramid appearance seeds and profile identities. In declarative Recipe Code, a directional `etch({ face: 'both' })` can specify `faceSurfaces: { front, back }` with one rough/pyramid appearance profile per face. Both model passes still share the same physical etch depth, area and target material. Individual `seed` and `profileId` values are preserved during Recipe serialization, Process worker dispatch, History replay and migration backfill. The face-specific surface is **display-only morphology**, not a physical random etch solver. See [example consolidation](../examples/EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md).

## Regression / reproducibility

Owned Node coverage: `site/tests/process-both-face.test.mjs` (two distinct linked material IDs, Mask footprint, paired Extend/Etch, independent single-face Etch, atomic rejection, Transfer, annotations, canonical arrays, Recipe round trip, unsupported methods) plus History replay ID-mapping regression. The v2 Manual selector has an additional browser owner, `scripts/v2/check-manual-both.mjs`; its dated [acceptance report](../archive/ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md) describes the tested commit and remaining CI gates.

Repository: `Xiaolong-6/WaferCAD`. Branch: `feat/kernel-process-face-both-20261011` based on main, without merge. Implemented using the GitHub-connected repository interface. **Local `npm ci`, `npm run check`, and browser tests were not executed in this environment** because a checked-out workspace was unavailable. PR CI provides executable evidence; preserve Draft until green. PR CI is the initial executable verification and must be reviewed before merge; do not claim a product pass from source inspection alone.

Original delivery scope was Kernel, Process Recipe plumbing, regression tests, and this document. **Update (2026-10-12):** the new Workstation has since integrated Manual Both without changing the global inspection-face contract; its acceptance is recorded separately, and this earlier Kernel report remains revision-specific.
