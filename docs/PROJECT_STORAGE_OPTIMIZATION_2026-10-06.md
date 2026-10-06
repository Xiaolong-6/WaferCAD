# Project storage and import optimization — 2026-10-06

Branch: `codex/project-io-geometry-sharing`. Starting baseline: `origin/fix/z-collapse-front-back-scale` at `1104a4b`.

The goal is a smaller exported `.wafercad` file and faster import while retaining all physical geometry, restorable Steps, Variant HEADs and bookmarks. The reference scenario is the locally reconstructed Fig. 3 wafer: 67,315,148 bytes, 41 Steps, five bookmarks, 1,875 devices. A measurement-only geometry dictionary reduced it to 3,211,041 bytes with exact field restoration; this is not yet a supported file.

Implementation will add a versioned geometry dictionary to shared asset storage, retain legacy readers, remove redundant cloning during packing, and reuse geometry-only validation work within a single validation call. Layer/stack, dimensional and annotation checks must remain state-specific. Imported geometry must not allow edits to change other historical states.

Acceptance: exported reference at most 5 MB; measured import median at least 50% lower than baseline in the same Chrome environment; exact round trips for all Steps and bookmarks; malformed-reference rejection; historical edit isolation; persistence and History browser regressions. Timing results and any unmet target will be reported rather than inferred from file size.

Only local checks are authorized. Milestone commits use `[skip ci]` and are pushed to this feature branch; no PR, main merge, deployment or manual CI dispatch is requested. Validation and reproducible commands will be appended as milestones complete.