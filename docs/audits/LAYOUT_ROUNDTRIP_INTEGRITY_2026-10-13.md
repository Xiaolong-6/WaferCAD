# GDS/OAS round-trip integrity — 2026-10-13

Baseline: `main@2949dfc`.

## New contract tests

- Canonical polygons, closed-ring normalization, orientation independence, coordinates, Layer and Datatype preserve identity across both writers.
- GDS to OAS to GDS, and OAS to GDS to OAS, preserve representable geometric inventories.
- Cell/Layer-filtered Mask ROI export does not mutate imported geometry; serialization retains exact representable clip boundaries.

## Verification limits

The exported layout currently uses a flattened cell. Preserving the original input hierarchy is not claimed. The internal parser is not an external oracle: KLayout compatibility and real-browser import/edit/export remain separate required gates. Database-unit limits stay unchanged.

Run locally: `node --test site/tests/layout-roundtrip-integrity.test.mjs`.
