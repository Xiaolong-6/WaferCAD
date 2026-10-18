# Documentation Node test owners

This is the first domain-grouped test suite under `site/tests/`.

- `documentation.test.mjs` — documentation graph, link/heading, archive and provenance invariants.
- `wiki-manual.test.mjs` — current Wiki, Welcome catalog and Recipe examples.
- `process-guide.test.mjs` — generated Process Guide/catalog and SVG fidelity.

**Discovery:** `npm test` still uses the stable `site/tests/*.test.mjs` glob. The root `site/tests/documentation-suite.test.mjs` dynamically imports **every** `*.test.mjs` in this directory and requires all three original owners. A new test in this directory is picked up automatically; no nested test is silently skipped. External focused CI runs the same suite entry point.

Do not move scientific, History, Recovery or browser suites until their import paths, npm/CI owners and exact behavior have been separately verified. See [test architecture](../../../docs/testing.md).
