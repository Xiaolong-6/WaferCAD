# Native Conformal follow-up - 2026-10-06

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

The exact user checkpoint now completes T2 gate/metal/contact windows, native ILD2 liner, SOG overfill, CMP and T3 in Chrome. The final single-site reconstruction has three native Conformal HfO2 gates, two native Conformal ILD liners, three electrical annotations and 40 complete History Steps. No horizontal HfO2 gate proxy is used. All 22 original History nodes and their full states remain exactly equal to the approved source.

## Partition defects and fixes

T2 initially failed strict worker validation with a 2.92995e-7 square micrometre overlap at the S/D pad corners. Its wall partition was valid before numerical crack healing; unioning an unsnapped crack into one owner introduced the overlap. Checked canonicalization on the existing 0.1 nm persistence grid fixes that defect.

ILD2 subsequently exposed a 6.3484e-7 square micrometre overlap: target and remainder independently rounded a shared wall boundary. Both owners now use the same snapped boundary band. Shared intersection vertices are inserted into both boundaries before the final persistence snap, and empty geometry owners are removed. Runtime and export tolerances remain unchanged; genuine overlaps still reject before commit. Z coordinates use decimal-stable snapping on the existing grid.

The exact fixture test continuously applies T2 gate, metal, contact windows and ILD2 without a save/reload between operations. It checks physical thickness, finite-height walls, unique ownership, grid coordinates, original History and native export/reopen. Full Process Geometry browser regression passes.

## Actual UI reconstruction and reopen

Installed Chrome 154.0.8037.98 used the normal Mask and Process controls. The requested step was exactly L9, 0.01 micrometre (10 nm), Conformal, front face, `T2 HfO2 gate`. Native ILD2 uses a 20 nm HfO2 liner, a 200 nm Conformal SOG overfill and native CMP to Z=250.4028 micrometres. Every CMP region reaches the same physical top plane. T3 transfer, doping, S/D metal, isolation, gate, gate metal, contact windows and anneal records all passed.

The UI run first exported the original checkpoint and reached CMP at Step 30. A Playwright click-navigation timeout after a successful record caused a restart from that exported CMP checkpoint; the last ten Steps were then applied in Chrome. A temporary navigation away from Process during contact-window setup recovered through the local workspace. The completed 40-Step export was reopened and exported again after the bookmark-cursor fix. Geometry, all History nodes and complete branch state are identical. The independent checks also compare unchanged prefixes at Steps 22, 30 and 37. This is a checkpoint-resumed UI run, not a claim of an uninterrupted browser session.

Reopening exposed a separate import bug: an explicit null bookmark cursor was replaced by an older branch milestone. `workspace-snapshots.js` now preserves explicit null while retaining the fallback for legacy files with missing cursor metadata. Its regression checks reopening an unbookmarked process HEAD with an older milestone. The final Chrome export/reopen has zero page errors and exact model/History equality.

## Reproduction and checks

Serve this checkout and use `scripts/fig3-native-process-regression.mjs` for a full UI replay from the approved 22-Step Brotli fixture. Optional `--resume-after-cmp`, `--resume-after-gate` and `--verify-complete` use the script's local exported checkpoints under test-results/native-fig3/complete-ui. Set WAFERCAD_URL to http://127.0.0.1:4173, WAFERCAD_THREE_DIR to node_modules/three and WAFERCAD_CHROMIUM to the installed Chrome executable; WAFERCAD_HEADFUL=1 shows the replay.

Full Node inventory: 376 passed, zero failures/skips. Full Process Geometry and bundled-example browser checks passed; ESLint and changed-file Prettier pass. Node 24.19.0, Playwright 1.55.1 and Three 0.179.1 were used on Windows. Machine-readable evidence is in tests/fixtures/native-fig3/three-tier-validation-windows-chrome.json. Detailed UI traces and captures remain local. Feature commits use [skip ci].

The stale original-checkout server on 4173 was stopped at the user's request. Both localhost 4173 and 4174 now serve this feature checkout. The original 4173 URL can be refreshed to see the current Z-collapse UI and Welcome catalog.

The completed single-site project is published as a Welcome example; provenance, geometry assumptions and storage results are in NATIVE_FIG3_EXAMPLE_2026-10-06.md.
