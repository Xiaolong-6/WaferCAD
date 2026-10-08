# Native three-tier Fig3 Welcome example - 2026-10-06

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

`site/examples/three-tier-silicon-jlfets.wafercad` is the completed single-site reconstruction of three silicon junctionless transistor tiers. It uses the same interactive Main, Mask, 3D and Section card style as the existing literature examples.

Source: B. Lam et al., "Monolithic three-dimensional integration of silicon transistors," Nature 654, 652-659 (2026), [DOI 10.1038/s41586-026-10496-6](https://doi.org/10.1038/s41586-026-10496-6). The masks are educational reconstructions, not original fabrication mask data. This example covers one 1.6 mm device site, rather than the complete wafer array. The existing full-wafer reconstruction is a separate artifact.

Three 10 nm Si membranes carry three native 10 nm Conformal HfO2 gates. Channel gate metal is 40.4 nm and S/D metal is 41.4 nm, represented as merged geometric layers. Selective contact etches remove the gate dielectric at the pads, while silicon isolation removes Si outside the active mask. Electrical annotations do not represent TCAD results.

Both inter-tier dielectrics use native 20 nm Conformal HfO2 liners, Conformal SOG overfill and native CMP. The 90 nm spacing reference comes from Fig. 2 and is explicitly an assumption for this Fig. 3 geometry, not a measured Fig. 3 ILD thickness. The second uniform CMP plane is Z=250.4028 micrometres. Transfer models placement rather than bonding chemistry; SOG/CMP is a recorded geometric surrogate. Source assumptions, process conditions and anneal records remain in History.

As of 2026-10-07, the formal example has been rebuilt from the initial receiver state through all 40 recorded process Steps using the current process kernel; it no longer depends on the old tier-2 checkpoint as its construction baseline. All 40 History nodes remain restorable and retain operation parameters plus replay metadata. Five curated bookmarks include T2 completion, ILD2 CMP and T3 completion. The central 3D ROI is 80 by 140 micrometres; Section spans 100 micrometres across the gate, and a Detail ROI targets the upper stack. Mask inspection selects the active, S/D, gate and contact layers.

The 2026-10-07 full replay serializes the single-site project with shared-assets-v3 storage at 744,110 bytes and the 625-site wafer array with shared-assets-v4 storage at 2,425,931 bytes. Both files pass exact serialize/reopen round trips. Geometry remains on the native process representation rather than a display-only reconstruction. The earlier 58.96-second Welcome-to-project observation remains historical context only; it is not a current benchmark claim.

The shared native Fig3 physical contract checks all three channel/pad thicknesses, unique material ownership, native gate/liner operation modes, opened contacts, silicon isolation, both uniform CMP planes and T3 finite-height sidewalls. The dedicated full-replay acceptance now executes Steps 1-40 through the product UI/kernel, validates all 40 restorable states, exports and reopens the single-site project, expands it to 625 device instances, and verifies the full-wafer round trip. `scripts/fig3-full-replay-acceptance.mjs` is the canonical reconstruction/acceptance path; `NATIVE_CONFORMAL_FOLLOWUP_2026-10-06.md` documents the older checkpoint-resumed protocol.

The subsequent loading and final-only Welcome preview optimization is documented in [2026-10-07 performance follow-up](WELCOME_LOADING_2026-10-07.md). The dated 58.96-second observation above describes the earlier version.
