# Multi-wafer bonding design and staged scientific acceptance

Status: **Draft / P1B scientific prototype + P2 lossless Assembly IO candidate** (2026-10-15).
Branch: `feat/multi-wafer-bonding-from-pr229-20261015`.
Reference example: PR #229, Lian et al., _Microsystems & Nanoengineering_ 8, 119 (2022), DOI 10.1038/s41378-022-00462-3.
**Do not merge to Main without explicit scientific/visual user approval.**

## Goal and non-goals

Enable independently fabricated donor and receiver wafers to be aligned, bonded,
and subsequently processed as one assembly, with complete provenance and
reproducible Recipe/History. The initial GaN/SiC example requires two separately
patterned 400 µm Si wafers with true internal coolant voids. A monolithic
800 µm five-tier surrogate is not equivalent to wafer-to-wafer bonding.

This is geometric process emulation. Bond chemistry, hermeticity, interface
strength, warpage, thermo-mechanical deformation, void collapse, wafer
bow/overlay statistics, and heat/CFD/electrical transport are not predicted.

## Existing code constraints

- `site/model.js`: canonical physical model = XY nonoverlapping polygon regions
  carrying sorted (layerId, z0, z1) material slabs; micrometre coordinates.
- `site/process-topology.js` derives actual surfaces/voids and Section/3D.
- `site/model-array.js` is a _translation-only lateral repetition_ mechanism,
  **not** a generic stacked-chip assembly; it must not be overloaded.
- `site/process-face-execution.js` implements atomic Front/Back processing of
  one model; it is not a donor/receiver operation.
- `site/process-recipe.js` currently accepts Deposit/Extend/Etch/Lift-off/
  Implant/Electrical/Record/Snapshot, not a Bond command.
- `site/project-schema.js` now supports project v15 with strict Assembly validation and legacy v14 migration;
  `site/project-io.js` packs shared geometries and model dictionaries.
- History/Recovery require validated candidate commit, stable replay input and
  safe downstream rollback.

## Architectural decision

Introduce a distinct Assembly provenance domain rather than representing each
wafer as Deposit, Transfer/Laminate, a duplicated Base, a Variant, or a lateral
Array instance.

### Proposed persistent structure (not implemented yet)

```text
Assembly
  sources[waferId] -> independently valid, immutable input project revision
     material model, masks, Recipe, History, source hash and units
  bonds[] -> ordered physical operations
     donorId, receiverRevision, face pair, XY transform/handedness,
     contact plane, zero-thickness interface geometry, material mapping
  product -> a normal, valid 2.5D material model
  productHistory -> Bond node, then conventional post-bond operations
```

An Assembly can be extended with a third wafer by bonding against a completed
product revision. Source identities and Layer IDs must remain distinct and
traceable. The external source file shall be embedded (bounded, deduplicated)
rather than linked by an unverifiable local path. Recursive/foreign-project
references must be rejected, bounded and migration-tested. The new v15 project schema explicitly gates embedded Assembly provenance; older
v14 readers reject v15 rather than silently misinterpreting it.

### Physical coordinate contract

- XY align: `dx`, `dy`, `rotationDeg` in canonical µm/degrees; no implicit rescale.
- Face pair: Front–Front, Front–Back, Back–Front, Back–Back.
- The donor requested face is placed at the receiver's outermost material Z
  plane. A same-face pair flips donor Z. An explicit X/Y mirror is applied to
  its XY coordinates on flipping, then rotation and translation.
- Material Z intervals are translated/reflected **without changing thickness**.
  The two material solids may meet but must never overlap in positive Z.
- Direct bond is **zero-thickness interface metadata**, not a deposited layer.
  For this phase only direct, zero-gap contact is supported. A positive gap
  or an adhesive film requires actual separately modeled materials/spacers.
- Positive-area contact is the intersection of the real exposed face material
  footprints at the common plane. Recessed/etched footprints are excluded.
  Empty fluid cavities are preserved as genuine voids; geometric contact alone
  does not prove bonding quality or channel airtightness.
- Partial contact may be structurally legal, but contact fraction, connected
  contact islands, seal-ring continuity and bond-quality gates will be added
  before general release.

### Atomic transaction requirements

`prepareBond(receiver, donor, spec)` must be pure: validate both sources;
transform donor and annotate provenance; partition overlapping XY footprints;
sort and validate all Z slabs; verify nonzero contact and no illegal material
collision; validate the entire candidate; return a candidate and audit record.
A thrown error cannot change either source model, History, Recovery, Recipe,
or the live UI. Only the future transaction controller may commit the validated
candidate. Prepare / commit must be independent of renderer caches.

## Implementation progress

### P0 / P1 prototype (committed)

`site/wafer-bonding.js` provides `bondWaferModels(receiver, donor, request)`.
It returns `{model, interface, donorLayerIds}` and never mutates the source
models. It maps layer identities, flips orientation and optional appearance,
computes real contact geometry, partitions XY regions, preserves Z voids and
validates the final native model.

The strict prototype intentionally rejects canonical Array models and models
with Implant/Electrical Region annotations instead of silently dropping their
geometry. It does not yet create History operations, persistent provenance,
Recipe syntax, imported donor projects, or UI controls. These must not be
advertised as complete. The pure Kernel continues returning the interface separately; the v15
Assembly project wrapper now persists typed Bond metadata and full validated
source projects, with strict replay parity before both export and import.

`site/tests/wafer-bonding.test.mjs` defines eleven directed scientific tests:
800 µm two-wafer stack, capped open coolant trench, handedness/90° rotation,
front/back pairing, third-wafer extension, atomic rejection, and annotation/
array exclusion. These are proposed acceptance tests; their execution must
be reported independently.

### P1 remaining: hard scientific invariants

1. Verify after geometry Kernel load with:
   `node --test site/tests/wafer-bonding.test.mjs`.
2. Verify non-rectangular holes, many disconnected islands, partial seams,
   layered donor/receiver, remapped paired layers, and coordinate extremes.
3. Guard against tiny positive-area slivers, invalid contact percentages, and
   polygon-Boolean instability with the **existing strict** tolerances; do not
   widen global scientific tolerances to pass acceptance.
4. Cross-check input Model JSON before/after all failed operations.
5. Benchmark actual PR #229 two-wafer masks before lifting region budgets.
6. Integrate annotations and/or reject them at user-facing preflight, with
   no silent loss of physical metadata.

### P2: provenance + IO + Recipe/History

Add a bounded Assembly object to `project-schema.js` and asset packing in
`project-io.js`, with migration and round-trip validation of all donor source
revisions and interface geometry. Then add explicit `bond()` semantics to the
Recipe parser/preflight, Process worker, History operation labels and
Replay/Branch/Recovery transaction path. The design must preserve completed
independent donor recipes and allow post-bond steps on the assembled product.

Acceptance: byte-stable canonical source hashes, Layer ID provenance,
Save→Reload→Replay occupancy parity, third-wafer extension, Undo/Redo,
Abort/retry and failed-load isolation. Only then can this be a user-facing
manufacturing operation.

### P3: UI and real browser visual acceptance

Project → Assembly opens an explicit donor selector and lists source wafer
states. Bond editor: face pair, flip axis, XY offset/rotation, physical
contact method, live read-only overlap/interface preview, warnings, and one
atomic Commit Bond action. Main/Section/3D remain the existing synchronized
views. Section shows an optional **display-only** zero-thickness interface,
and 3D supports wafer inspection by provenance without inventing opaque
bonding films. Browser acceptance captures four views and paper-specific
sections; inspect screenshots autonomously before any full CI.

### P4: GaN interposer article test, PR #229

Build _two independent_ `thickness: 400` µm Si material models. Preserve
source-reporting vs inferred XY masks. Etch each separately (front/back 200 µm
DRIE where paper-supported), align correctly and Bond once. Verify total
interposer 800 µm only at physically solid sites, open longitudinal coolant
network, TSV location, Si ribs, face orientation and continuous port/channel
connectivity. Compare Fig. 1(a/c) and Fig. 2(g–i) at correct orientation with
real Chromium Main/Mask/3D/Section and inspection bookmarks. Do not infer
thermal or hydraulic performance from geometry. The existing PR #229 remains
independent and may continue fixing its surrogate.

## CI and release gates

During architecture/kernel iteration run only relevant local Node tests,
scientific invariants and minimal import/startup smoke. Do not enable a
full Quality or Browser Regression campaign just to turn a Draft PR green.
After verified geometry, targeted browser screenshots and paper comparison,
run targeted CI then the full required release gates. Record red/not-run
checks accurately. No merge or deployment without explicit user approval.

## Known gaps and handoff

**Implemented:** isolated scientific Kernel, v15 lossless Assembly provenance
and independent source replay, strict import/export and Recovery parity,
legacy v14 version preservation, and fail-closed editor import guard.

**Still unverified:** live multi-wafer editing and History/Recipe transactions,
browser/3D visual evidence, original complete two-wafer process-flow reconstruction
from PR #229, product-scale performance and required final Quality gates.

**Next:** integrate a first-class Bond History transaction plus source-aware UI,
then remove the editor guard only after end-to-end Save/Recovery/Replay and
real browser screenshots pass. Keep PR #229 source masks independent.

## Verified P1B/P2 milestone — 2026-10-15

- **P1B:** eleven primary geometry/transaction tests, six Assembly source/replay
  tests, and a two-independent-400-µm-Si paper-dimension test passed. Check
  both bond faces, XY mirror/rotation, distinct layer IDs, contact islands,
  surface coverage fractions, buried coolant voids, oxide interface film and
  three-wafer extension. The GaN case is a source-dimension **geometric
  fixture**, not the complete author's GDS/Recipe or a visual reconstruction.
- **P2 (partial):** `site/wafer-assembly.js` embeds full validated source
  projects (including Mask/layout, Recipe and source History snapshots) with
  bounded byte budgets and deterministic ordered replay. A v15
  `waferAssembly` field is validated in `project-schema.js`, and
  `project-io.js` uses **lossless-only** storage for bonded projects. Source
  length drift, wrong contact metadata, illegal nested provenance, mismatched
  output geometry and pre-v15 Assembly files are refused before import/export.
- **Acceptance:** seven v15 IO/migration unit tests pass. The original
  `project-geometry-storage.test.mjs` remains unchanged and now passes after
  removing an eager geometry dependency and preserving v14 snapshot versions.
  The Recovery path validates replay parity for Assembly records; v14 files
  no longer create needless version-upgrade checkpoints on every startup.
  A strict editor import guard prevents losing Assembly provenance before the
  live state owner and Bond History transaction are implemented.
- **Still missing:** a user-facing Bond operation and transaction in
  Recipe/History/Recovery, original two-wafer full PR #229 flow, real
  Chromium four-view screenshots, cross-version browser open test, complete
  Quality and release gates. Do not merge or deploy.

The v15 assembled project currently exposes an **immutable post-bond
baseline**. To prevent corruption, it refuses to save post-bond material
changes until a first-class Bond History/Recipe operation exists. The donor's
independent source History remains inside the Assembly record and is not
misrepresented as the product's own linear Process History. After P2 History
integration this restriction can be lifted with explicit replay provenance.

## Safety policy for the staged v15 codec

A v15 Bonded Assembly can be generated, validated, exported and round-tripped
through the standalone geometry/IO APIs. **It is intentionally not yet
editable in the ordinary WaferCAD workstation**: the generic project-state
controller currently does not own `waferAssembly` metadata. Until it is
transactionally wired into the live Workspace and History controllers, that
import is refused *before* any state mutation. Ordinary v14 project import
continues unchanged. No source Project, Mask, Recipe or History may be silently
discarded to make a Preview appear functional. The gate will be lifted only
after a dedicated editor-state ownership and atomic Rollback test suite passes.
