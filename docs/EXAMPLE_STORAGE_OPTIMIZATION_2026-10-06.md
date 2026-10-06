# Example storage optimization — 2026-10-06

All four Welcome projects and both reference projects use lossless shared-assets-v2 geometry dictionaries. Model geometry, layer/annotation ownership, every History state, bookmarks, Variants and metadata pass full normalized JSON equality after readProjectFile. JSON signed zero is normalized without coordinate rounding. An exact comparison found that explicit null bookmark parentId was previously dropped; both file and Recovery packers now preserve complete bookmark metadata.

| Project                                           | Before bytes | After bytes | Reduction | Chrome ready median, before → after | Worker median, before → after |
| ------------------------------------------------- | -----------: | ----------: | --------: | ----------------------------------: | ----------------------------: |
| fully-textured-perovskite-silicon-tandem.wafercad |       393045 |      263827 |     32.9% |                     1.548 → 1.610 s |              115.9 → 117.5 ms |
| perc-solar-cells-point-contacts.wafercad          |      3071195 |      845137 |     72.5% |                     4.640 → 4.149 s |             1395.0 → 747.5 ms |
| photodetector-literature-examples.wafercad        |      2693533 |      366336 |     86.4% |                     3.315 → 2.947 s |              595.0 → 305.5 ms |
| suspended-silica-microdisks.wafercad              |       692925 |       99921 |     85.6% |                     0.977 → 0.871 s |              201.2 → 136.7 ms |
| black-si-photodiode-acs-photonics-2023.wafercad   |       347524 |       53788 |     84.5% |                     1.623 → 1.605 s |               120.0 → 82.8 ms |
| sahli-2018-fully-textured-tandem.wafercad         |       393045 |      263827 |     32.9% |                     1.642 → 1.680 s |              124.9 → 115.9 ms |

Three fresh installed-Chrome contexts per file/encoding, same application, local server, pinned Three. Small tandem files show no clear total-readiness speed gain (a 38–61 ms difference); rendering and startup dominate. Larger examples improve total readiness by roughly 11–12%; their worker parsing/validation gains are larger. This is measured local performance, not a network-download claim. Raw runs are committed in tests/fixtures/project-io/example-storage-validation-windows-chrome.json. The subsequent tandem presentation change is separate from these storage-only measurements.

Reproduce: node scripts/optimize-example-storage.mjs checks all six projects; add --write to repack only files that shrink and save byte-original local backups. Use scripts/project-import-benchmark.mjs with each before/after file and repeat=3. Windows Node 24.19.0, Playwright 1.55.1, Chrome 154.0.8037.98, Three 0.179.1; WAFERCAD_URL=http://127.0.0.1:4174 and WAFERCAD_THREE_DIR=node_modules/three.

Validation at this stage: full Node inventory 374 passed, zero failed/skipped; lint passed. The bookmark ancestry regression covers both native file and workspace packing. User authorized feature-branch pushes without CI; commits use [skip ci].
