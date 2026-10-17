# Legacy UI source sunset

The production editor is `site/app.html` (v2). The public `/app-legacy.html` route is still built by `scripts/build-pages-artifact.mjs` as a query/hash-preserving redirect **without executable Legacy code**.

Legacy editor and experimental D1 DOM bridge sources are removed from the active checkout. Historical user `.wafercad` project/schema readers, IndexedDB Recovery, writer leases, and shared `site/ui-v2/real-three-controls.js` remain.

Frozen rollback commit: `eaddf7f01da0c4c057a03f263d80b13ebc6a29ea`. The remote lightweight tag `legacy-frozen` has been created and independently verified to point to that exact commit; `archive/legacy-frozen-20261016` currently points to the same commit. The tag is the canonical permanent rollback reference and nightly source pin.

Archived source-only tests run nightly against `legacy-frozen` after this workflow reaches the default branch; active v2 invariants and restored old-project compatibility tests continue on Main. Deeper Array, Metalens, Renderer, exports and example replay science obligations are documented in [#289](https://github.com/Xiaolong-6/WaferCAD/issues/289) and do not block UI source retirement.

## Current-release browser gate ownership

Source retirement is not permission to drop physics checks. The production v2
release suite uses the original `package.json` command names, but each former
Legacy DOM entrypoint delegates to a **fail-closed native-v2 scientific owner**
in `scripts/v2/check-source-sunset-release-owners.mjs`. Every owner runs real
Chromium, actual v2 Process/Worker paths, and a domain-specific Node science
invariant set. The original full Legacy source and exact historical assertions
remain reproducible at the immutable `legacy-frozen` Git tag.

- **Workstation / View UX:** native startup, lease isolation, desktop docking,
  mobile, Main/Mask/Section/3D and actual controls via the existing Workstation
  - View UX wrappers.
- **Interaction:** native Main ROI/Slice and Mask Draw (rectangle, circle,
  polygon, ring, sector), 0.1 nm editor unit integrity, Mask alignment/ROI,
  actual SVG/GDS/OAS exports, physical Process mask scope, and a persistent
  Draw→File→Draw→Selected Mask Worker→History→Recovery scenario.
- **Process / Recipe / transaction:** Front/Back atomicity, numerical units,
  prefix/Stop/preflight rollback, real Worker rejection/retry, Recipe/History
  restore, 0.125 µm scoped deposition, full shared-workstation Process, and
  real full-model GLB abort, paired with conformal/rough/implant/isotropic/
  lift-off/Section science tests.
- **I/O:** native project migration/Recovery, KLayout GDS/OAS Mask Process,
  Report/GLB export, three live M4 projects, and import/export geometry tests.
- **Array:** 625-site masked Process/History, 6400-site actual Worker replay,
  80×80 templates and real 3D camera/Display model isolation, plus native
  array material/History scientific invariants.
- **Examples:** M4 independent project imports/exports and nine-Step TiO₂
  Metalens Worker/History/Recovery paired with literature-fixture and
  intermediate-geometry Node contracts.
- **Renderer / product:** native four-view product layouts and touch,
  actual GLB export-abort, GPU/CPU scientific geometry and outline checks,
  80×80 retained 3D model isolation, and a 625-site 20-toggle
  retained-scene/resource browser check.
- **KLayout and Recipe safety workflows:** full external corpus/actual Mask
  Process integration, and native preflight/Worker/transaction controls.

The Browser Release workflow runs heavy owners as independently gated Chromium
jobs. Workstation, Interaction, Examples, Product Layout and Renderer use a
dynamic owner matrix; Process, I/O and Array use independent science jobs.
This preserves required failure propagation without sharing the former
15-minute main browser watchdog. The independent Node Quality, History,
Persistence, Recovery and renderer outline invariants remain active.

**Scope and residual fidelity risks:** the old pre-v2 UI's exact DOM gestures
and per-scenario screenshot wording are _not_ claims about current v2. The
old Sector ROI angle-handle gesture, paper-specific every-Step fidelity,
full-wafer SVG/GLB export probes and some edge-on GPU composition cases still
need explicit evidence to declare historical scenario-by-scenario parity.
They are tracked in [Issue #289](https://github.com/Xiaolong-6/WaferCAD/issues/289),
not hidden behind a deleted assertion, a looser geometry tolerance or an
automatic green badge. A passing new suite certifies the listed native
scientific contracts, not every archived scenario.

**Final merge gate:** validate exact-HEAD complete Node + Quality,
Release Browser including the independent heavy owners, real scientific
Array/Examples and Project/Recovery contracts, and actual Chromium screenshots.
Record any remaining failures; do not merge without explicit owner approval.
Keep `archive/legacy-frozen-20261016` until the pinned nightly runs
successfully after Main deploy.
