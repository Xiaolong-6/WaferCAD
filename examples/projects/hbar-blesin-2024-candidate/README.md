# Blésin et al. (2024): author-GDS HBAR transducer reconstruction

**Candidate only — do not publish in Welcome before full scientific/visual acceptance.**

- Paper: Terence Blésin et al., _Nature Communications_ **15**, 6096 (2024), [doi:10.1038/s41467-024-49467-8](https://doi.org/10.1038/s41467-024-49467-8).
- Original authors' data: [Zenodo 10965620](https://doi.org/10.5281/zenodo.10965620), downloaded dataset's `ChipLayout/D76_33_F2_Chip2.gds`.
- Exact author GDS SHA-256: `f76cc5217b1024dcd0f68b168f2fb67d6c57560bba3a604652d84257d10e3423`.
- Reproduction entry: `node scripts/build-hbar-transducer-example.mjs --source path/to/Zenodo/ChipLayout/D76_33_F2_Chip2.gds --output test-results/hbar`.
- Original `Chip2` cell: 9,646 polygons, 5,000 µm square, 1 nm GDS database unit. ROI centered at `(-4367.57, 5393.4)` µm; 130 × 150 µm.
- Included **author-derived** local source mask (`hbar-blesin-2024-author-roi.gds`) and native project (`hbar-blesin-2024-author-roi.wafercad`). Geometry is selected from the actual GDS, not traced from the SEM. The derived GDS uses a fixed export timestamp to keep its bytes reproducible. The 18 original shapes crossing the physical ROI are clipped with the production polygon Boolean kernel (rather than leaking multi-millimetre pads/waveguides into the 130 × 150 µm GDS). The untouched author input is retained separately.

## Physical construction

The project contains original ring contours and release hole masks, a Si base, 2.8 µm lower SiO₂, 850 nm patterned Si₃N₄, filled/CMP-planarized total 5.9 µm SiO₂ cladding, and 95 nm Mo / 1.0 µm AlN / 95 nm Mo electrodes. These dimensions come from the paper's Methods and Supplementary Appendix B. The candidate's History includes intermediate film and hole-opening states and an exact continuous silicon release based on PR #352.

**Science provenance caveats:** The GDS supplies numerical layer IDs without a verified layer-purpose table. Layers **8** (Si₃N₄ ring candidate), **9** (oxide release-hole candidate), and **11** (arc actuator candidate) are assignments inferred by overlaying their original geometry on the paper's optical micrograph and cross-sectional design. The exact Mo/AlN/Mo photolithography relationship, as-built Al feedline, XeF₂ isolation, partial reflector facets, and oxide DRIE mask purpose remain unverified. The source run card (`Runcards/STP-047_...xlsx`) documents 16 min Si isotropic release, 15 min Si DRIE and a final 8 min isotropic terrace etch, but it does not directly supply the lateral etch distance. **The example's continuous release distance (19 µm vertical / 24 µm lateral) is therefore an illustrated scenario, not an experimentally established value.**

The physical silicon handle started around 525 µm in the run card; this ROI project deliberately uses a 36 µm local substrate slice for visual inspection. The 250 µm chip-facet DRIE, thinning/grinding, Damascene reflow profile and original through-wafer mechanics are not physically reproduced. No optical propagation, acoustic FEM, S-parameters, conversion efficiency, or mechanical stiffness claims are made.

## Verification and acceptance

- Rebuilt using production `site/layout-io.js`, `site/model.js`, continuous material owner and `site/project-io.js`.
- Strict project serialization/read-back and extracted-mask GDS import round-trip succeeded.
- Native headed Chromium/Three.js diagnostic successfully rendered the Mo/AlN/Mo stage and the continuous released stage (software SwiftShader, managed null-Origin). The real Workstation, Worker-backed project Open, History/Recovery transactions and 4-view synchronization remain **unverified**.
- Native continuous Si support is analytic. The Renderer update to coalesce same-height co-owned thin films affects display geometry only, not the canonical scientific owner.
- On PR #352 HEAD `4b652cb`, Process Recipe supports an **executable** `continuous` etch. The candidate stores the exact final target, author-GDS release-hole mask and XY/Z release reaches in both History and Recipe. The complete 11-Step Recipe has been replayed through the production process geometry APIs and matches the saved analytic material owner after excluding view-only layer colors. Oxide-hole etching stops at the 5.9 µm oxide/Si boundary (avoiding a formerly silent 20 nm Si overetch), and CMP uses absolute 23.9 µm Z in both History and Recipe. Full Workstation Run All / Worker / Recovery acceptance remains **unverified**; production geometry-API parity is not a substitute for browser integration.

Refer to `reconstruction-report.json` for polygon counts, material properties and unresolved provenance. The baseline S04 and released S06 native screenshots are held in local diagnostics and must be individually reviewed before publication.

## Real Workstation acceptance (pending browser evidence)

Run the actual native-v2 Workstation in a **normal-origin Chromium** environment
with locked dependencies and a local WaferCAD server, then execute:

```sh
npm run test:ui:hbar
```

The fail-closed browser owner `scripts/hbar-workstation-browser-acceptance.mjs`
opens the bundled `.wafercad`, checks actual Main/Mask/Section and an **exact
painted** 3D frame, inspects and returns from a historical physical Step,
checks IndexedDB Save and a read-only second-tab writer lease, restores a named
HBAR Recovery checkpoint after opening an empty project, reloads it, and
replays all 11 Recipe Steps using the real UI and 9 browser Process Worker
operations (including both Record History commits). The last material owner
must exactly match the saved candidate, apart from display-only palette data.
Screenshots and a status JSON are written under `test-results/hbar-workstation/`.

**Do not treat syntax/Node tests or isolated `about:blank` Three.js evidence as
passing this command.** Managed Chrome's `ERR_BLOCKED_BY_ADMINISTRATOR` stops
this normal-Origin acceptance; no bypass or mock execution is permitted. The
existing `npm run test:ui:state` separately owns broader multi-tab lease-loss,
takeover and Recovery failure atomicity. The HBAR test is opt-in and does not
add automatic GitHub Actions triggers or a first-frame time limit.
