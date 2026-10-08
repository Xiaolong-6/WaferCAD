# Photodetector production example · Process Geometry Kernel rebuild (2026-10-08)

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

## Scope and sources

- Branch: fix/photodetector-reconstruction-v2, based on feat/process-recipe-v1.
- Builder: node scripts/maintenance/rebuild-photodetectors.mjs --write.
- Bundled output: site/examples/photodetector-literature-examples.wafercad.
- Source 1: O. E. Setälä et al., ACS Photonics (2023), DOI 10.1021/acsphotonics.2c01984, Methods.
- Source 2: H. Liu et al., Light: Science & Applications (2025), DOI 10.1038/s41377-024-01670-4, Materials and methods.
- Variant comparison: H. Liu, Development of highly sensitive Ge NIR photodiode utilizing nanotexturing and charged oxides (Aalto University thesis, 2026), §4.1 and Fig. 15.

The example is regenerated from modern Kernel operations instead of moving/renaming old snapshots or fabricating intermediate models. Every geometry-changing Step stores restorable model geometry and replay inputs; non-geometric processing is represented as record Steps. Named snapshots are inspection bookmarks, not substitutes for fabrication Steps.

## Black-Si · Setälä 2023

1. Si (111), 350 µm, n− Base. Grow 650 nm front thermal SiO₂.
2. Open the active region in SiO₂ (a 2.6 mm opening radius in the illustrative layout).
3. Apply rough ICP-RIE to the 2.5 mm-radius active region.
4. Open the guard-ring SiO₂ window.
5. Implant B in the active area and contact/guard region (10 keV; dose 3×10¹⁵ cm⁻²; 1.5 µm depth only a schematic marker). Implant rear P, depth assumed.
6. Record 1050 °C × 20 min O₂ drive-in and oxide removal. No oxide is silently invented by the Kernel's geometric record command.
7. Deposit 50 nm conformal ALD Al₂O₃. Open assumed front contact windows.
8. Sputter front 300 nm and rear 1000 nm Al. Remove front Al over the active area.
9. Record 425 °C × 30 min forming-gas anneal before selectively stripping the remaining blanket Al above SiO₂; protected anode and guard metal is retained.
10. QA child Variant intentionally tests nonselective overetch and is not a manufacturing recommendation.

Black-Si roughness is deterministic and rendering-only; the sample SEM does not uniquely determine a 2.5D profile. The 300 nm lateral size / 500 nm relief are illustrative, with a fixed seed and profile ID. Existing selective-contact assumptions remain flagged instead of being promoted to sourced process facts.

## Ge · Liu 2025 and thesis Fig. 15

The Ge branch begins with an explicit Base replacement, since a Si substrate cannot be a physical ancestor of a Ge wafer. Subsequent common Steps:

1. n-Ge Sb, 302 µm, 29.1 Ωcm; deposit PECVD SiNₓ 300 nm implantation mask.
2. Pattern SiNₓ for B front contact-ring implantation (30 keV, 1×10¹⁵ cm⁻²); implant P from the back (60 keV, 1×10¹⁵ cm⁻²).
3. Record B/P activation 500 °C × 5 min N₂, then remove SiNₓ in BHF.
4. Deposit temporary Al₂O₃ etch mask (illustrative 100 nm since this thickness is unspecified); open 5 mm-diameter active area.
5. Etch nanostructured Ge through the mask using a reproducible schematic 200 nm XY, 700 nm feature-height profile.
6. Record 3% H₂O₂ etch-back, remove temporary mask with BHF, and record 31.6% HCl clean for 5 min.

The 2025 journal Methods specify 15 seconds for H₂O₂ while the 2026 thesis §4.1 says 30 seconds. The generator uses the journal's 15 s as its source and records the discrepancy; neither duration is translated into an invented etch depth.

The common branch then divides:

- A · Fig. 15a: whole-front 20 nm conformal Al₂O₃, induced p-type inversion on Ge, patterned contact openings, 400 °C passivation activation, rear 300 nm Al, front 500 nm Al, and final 350 °C healing anneal.
- B · Fig. 15b: inactive-area 45 nm SiO₂ / 20 nm Al₂O₃; induced p-type active region versus induced n-type inactive region; same contact and anneal operations. The 45 nm SiO₂ is a documented study value and should not be presented as a directly specified Fig. 15 fabrication thickness.

Important modeling boundary: The current Kernel's generic Electrical process attaches an annotation to the exposed material. For induced Ge annotations to retain Ge host ownership, this generator inserts anticipated electrical regions directly before the causative dielectric deposition and explicitly labels them as becoming active after passivation. This is a modeling annotation, not a claim that inversion existed before ALD. A future host-selective Electrical API can express the physical time more literally; do not remove or alter the Ge host constraint to conceal this limitation.

## Reproduction and acceptance gates

1. Run node scripts/maintenance/rebuild-photodetectors.mjs --write to regenerate the complete editable project.
2. Run node scripts/build-example-previews.mjs --write --id=photodetector-literature and the thumbnail generator on pinned Playwright Chromium.
3. Run npm run check and npm run test:ui:examples (the browser gate requires a local server on port 4173).
4. Verify all process nodes and Variant heads survive project export/import, masked effects remain in the intended Ge or Si material, rough surfaces remain front-only, FINAL strips Al selectively, and the QA branch remains deliberately destructive.
5. Compare per-stage Section and 3D renderings under current Kernel. Do not equate a successful schema test to visual acceptance. Do not replace an approved Windows visual baseline solely to suppress a mismatch.

No test execution or final replay is claimed here until confirmed by a CI or local validation result. Preserve Git history as provenance of the older snapshot-built project.
