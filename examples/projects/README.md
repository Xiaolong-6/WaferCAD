# WaferCAD project examples

This directory keeps project fixtures that are useful for regression and development review.

## Production bundled example families

The Welcome page is driven by `site/bundled-examples.js`. Public, editable bundled examples live under `site/examples/` and should be grouped by **device/application family**, not one card per paper.

The current production literature families are:

- **Photodetectors with nanopatterns** — `site/examples/photodetector-literature-examples.wafercad`
  - Rebuilt from the current Process Geometry Kernel using `scripts/maintenance/rebuild-photodetectors.mjs`; see `docs/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md`.
  - **Black-Si Fig. 1a:** ordered thermal oxidation, lithography, ICP-RIE, B/P contact implants, drive-in and oxide-strip records, conformal passivation, contacts and final forming-gas treatment.
    - FINAL · selectively strips blanket Al while protecting active ALD.
    - QA · intentional nonselective overetch; not a fabrication recommendation.
  - **Ge Fig. 15:** explicit n-Ge Base, temporary SiNₓ implantation mask, B/P activation, temporary Al₂O₃ etch mask, ICP-RIE and wet-treatment records.
    - A · full-area Al₂O₃.
    - B · inactive SiO₂/Al₂O₃.
    - p-inversion and n-accumulation remain Ge-hosted Electrical Regions; the *anticipated* annotations precede the passivation film because host-selective buried electrical placement is not yet available.
- **PERC solar cells with point contacts** — `site/examples/perc-solar-cells-point-contacts.wafercad`
  - source-order reconstruction is the default active Variant;
  - curated baseline and GDS-patterned-contact alternatives remain available.
- **Fully textured perovskite–silicon tandems** — `site/examples/fully-textured-perovskite-silicon-tandem.wafercad`
  - double-sided deterministic Pyramid texture;
  - SHJ bottom cell plus nc-Si:H record-device / ITO control branches;
  - conformal top-cell stack, ALD SnO₂, IZO, and surrogate Ag grid;
  - Ag-finger inspection bookmarks preserve Section and 3D camera state.
- **Suspended silica microdisks** — `site/examples/suspended-silica-microdisks.wafercad`
  - released annular air gap is canonical geometry;
  - the central silicon support remains physically connected to the silica disk.

The photodetector family opens on the Black-Si FINAL Variant while retaining the complete restorable Variant tree. This structure is intentional: future examples should normally add a new family project rather than adding one Welcome card for every publication.

## Welcome preview and literature-source contract

The Welcome page uses each bundled `.wafercad` project itself as the primary preview source.

- Project cards embed a read-only mini WaferCAD viewer in the preview area.
- The viewer exposes `Main / Mask / 3D / Section` tabs and reuses the production renderers.
- 3D is initialized only when the 3D tab is requested, so the Welcome page does not create multiple WebGL scenes up front.
- A stored screenshot may remain as a loading/error fallback, but screenshot pixels are not the normal preview surface and are never regression truth.
- `Open example` enters the complete editable workspace with History and Variants.
- Preview iframes must not acquire workspace ownership, write autosaves, create Recovery checkpoints, or alter process lineage.
- Embedded previews expose inspection only: Main/Mask can pan and zoom, 3D can orbit/zoom, and Section is display-only. Slice A/B editing, ROI tools, Mask Draw/editing, process controls, exports, bookmarks, and other mutation controls stay unbound and hidden.

Every literature reconstruction must also expose traceable source metadata directly on the Welcome card:

- publication title;
- author or first author + et al.;
- journal / venue and publication year;
- DOI link when a DOI exists.

If one bundled family combines multiple publications, list every source represented by that project. Paper figures are not copied into the Welcome preview; the interactive views are rendered from the WaferCAD reconstruction itself.

## Regression contract

Bundled examples are production acceptance fixtures, not presentation-only files.

`site/tests/example-regression.test.mjs` validates every restorable literature Step and Variant HEAD against the current project schema and renderer-facing geometry. It also locks the known high-value process invariants:

- Black-Si FINAL strips most blanket front Al without removing the protected ALD;
- front roughness remains on Front and cannot ghost onto Back;
- the QA overetch branch remains intentionally destructive;
- Ge Fig. 15 A/B keeps real B/P implants as Implant while induced inversion/accumulation remain Electrical Regions;
- Electrical Regions remain constrained to their original Ge host material.

`scripts/example-regression.mjs` complements this with a real Chromium path: open the bundled family from Welcome, switch Variants, restore representative Steps, and require the 3D scene/model/process revision to settle on the restored state.

When a new example family is added, add family-specific structural invariants here rather than relying only on screenshots. Pixel-perfect screenshots are deliberately not the primary contract because renderer and typography changes should not invalidate correct process topology.

## Sahli 2018 textured tandem source fixture

`sahli-2018-fully-textured-tandem.wafercad` remains the development/source fixture for the promoted Welcome copy at `site/examples/fully-textured-perovskite-silicon-tandem.wafercad`.

Its acceptance contract focuses on:

- deterministic front/back Pyramid morphology with explicit CV/seed reconstruction parameters;
- real fabrication History ending at `20_final_tandem`;
- Ag-finger cross-section and micro-section stored as inspection bookmarks attached to the final Step rather than fake `VIEW_*` fabrication Steps;
- persisted 3D camera state and Section Z collapse;
- morphology-aware GLB export using the same rough/Pyramid surface definition as the interactive 3D renderer.

## Black-Si photodiode regression fixture — ACS Photonics 2023

`black-si-photodiode-acs-photonics-2023.wafercad` is the recovered process project supplied during the rough-surface regression investigation.

It remains here as a regression fixture and is not the Welcome-page production copy.

Regression value:

- rough black-Si surface;
- front B implant following the rough entry surface;
- conformal ALD Al₂O₃;
- front/rear metal;
- selective metal strip that re-exposes a pre-existing rough conformal interface;
- snapshots covering the fabrication sequence.

The stored copy repairs the already-corrupted re-exposed Al₂O₃ surface metadata in the recovered project so that the final state matches the intended process topology. The kernel regression prevents the same corruption from being produced by future edits.
