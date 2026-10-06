# Project storage and import optimization — 2026-10-06

Branch: `codex/project-io-geometry-sharing`. Starting baseline: `origin/fix/z-collapse-front-back-scale` at `1104a4b`.

The goal is a smaller exported `.wafercad` file and faster import while retaining all physical geometry, restorable Steps, Variant HEADs and bookmarks. The reference scenario is the locally reconstructed Fig. 3 wafer: 67,315,148 bytes, 41 Steps, five bookmarks, 1,875 devices. A measurement-only geometry dictionary reduced it to 3,211,041 bytes with exact field restoration; this is not yet a supported file.

Implementation will add a versioned geometry dictionary to shared asset storage, retain legacy readers, remove redundant cloning during packing, and reuse geometry-only validation work within a single validation call. Layer/stack, dimensional and annotation checks must remain state-specific. Imported geometry must not allow edits to change other historical states.

Acceptance: exported reference at most 5 MB; measured import median at least 50% lower than baseline in the same Chrome environment; exact round trips for all Steps and bookmarks; malformed-reference rejection; historical edit isolation; persistence and History browser regressions. Timing results and any unmet target will be reported rather than inferred from file size.

Only local checks are authorized. Milestone commits use `[skip ci]` and are pushed to this feature branch; no PR, main merge, deployment or manual CI dispatch is requested. Validation and reproducible commands will be appended as milestones complete.

## Implementation milestone

Supported v2 export: 3,015,859 bytes, down from 67,315,148 bytes. The complete normalized project is deep-equal after native export/read, including 41 Steps, five bookmarks and all Variant HEADs. No geometry precision or History retention was reduced. A separate Node timing measured 22.54 s export and 4.81 s import; these do not substitute for Chrome UI timing.

Local focused project/History checks: 56 passed. Complete Node inventory: 367 passed, zero failures/skips. ESLint passed. Changed-file formatting passed. The full repository format inventory reported 11 pre-existing warnings in unchanged baseline files; these are not silently reformatted in this feature.

Chrome baseline on the exact starting product: three visible installed Chrome 154.0.8037.98 runs, 1440 × 960 viewport, pinned Playwright 1.55.1 / Three 0.179.1. Input selection includes the normal Open confirmation. Median Open status: 148.59 s; median matching-model 3D ready: 148.83 s; median import worker: 72.90 s. Page errors: none. Optimized browser and persistence/History validation remain in progress at this milestone.
