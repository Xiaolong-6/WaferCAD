# Native Fig3 tier-2 checkpoint

This Brotli archive contains the byte-exact original `fig3_site_tier2_before_gate_failure.wafercad` checkpoint from the user-requested Chrome reconstruction package. `metadata.json` records its SHA-256, original size, 22 History Steps and 30 material regions. Brotli is fixture packaging only; the native project remains JSON.

The probe is exactly L9, 0.01 µm (10 nm), Conformal, `T2 HfO2 gate`, front face. The geometric reconstruction and mask assumptions are described in the full-wafer fixture README. Existing tier-1/ILD1 conformal history is retained; this fixture does not substitute the horizontal HfO2 proxy for tier-2.

`site/tests/fig3-native-conformal.test.mjs` verifies checkpoint integrity, the strict runtime partition, channel/pad film thickness, physical S/D sidewall coverage, unchanged original history and native export/reopen. The 0.1 nm storage grid is unchanged. Runtime overlap rejection is checked before shared-grid normalization.
