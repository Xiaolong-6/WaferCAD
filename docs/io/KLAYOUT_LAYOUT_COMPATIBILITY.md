# KLayout GDS/OASIS compatibility regression

WaferCAD uses the public KLayout test corpus as an external compatibility oracle for GDSII and OASIS import.

## Pinned corpus

- Upstream repository: `KLayout/klayout`
- Test-data revision: `5fa733e1680212e4ceda532ca5fa6ea707c654de`
- Full automated sweep: all `.gds`, `.gdsii`, `.oas`, and `.oasis` files below upstream `testdata/`
- Browser UI sweep: upstream `testdata/gds`, `testdata/oasis`, and `testdata/lstream`

The full upstream corpus is not vendored into WaferCAD. CI checks out the pinned revision. A small representative subset is bundled under `site/samples/klayout/` for the in-app sample selector.

## Acceptance contract

A layout is not considered supported merely because the low-level parser returns successfully.

Compatibility is checked in two stages:

1. **Parser + flatten pipeline**
   - identify GDSII or OASIS
   - decompress gzip-wrapped streams when required
   - parse cells, geometry, repetitions and hierarchy
   - flatten the selected root into WaferCAD mask geometry
   - reject malformed input deterministically
   - reject layouts that exceed the browser-safe expansion limit instead of exhausting memory

2. **Real browser import path**
   - import through the same hidden file input used by the UI
   - populate cell hierarchy and layer selection
   - render the Mask canvas without browser exceptions
   - import every bundled KLayout sample through the visible sample selector
   - exercise `Mask -> layer selection -> Operation -> Add` on a representative OASIS sample

A parser-only PASS is therefore insufficient.

## Recorded regression result

These counts record the corpus run against the pinned KLayout revision. They are not a claim that this entire sweep was repeated on every later main revision; use the exact CI run/product SHA for fresh certification.

At the pinned KLayout revision:

### Full parser/flatten corpus

| Result                                | Count |
| ------------------------------------- | ----: |
| Total files                           |  1138 |
| PASS                                  |  1079 |
| Valid but no renderable mask geometry |    29 |
| Upstream-defined expected rejection   |     9 |
| Browser-safe complexity limit         |    21 |
| Unexpected failure                    |     0 |
| Timeout                               |     0 |
| Crash / OOM                           |     0 |

### Real browser UI import

The core format directories contain 144 layout files.

| Result                              | Count |
| ----------------------------------- | ----: |
| Normal UI imports                   |   134 |
| Upstream-defined expected rejection |     9 |
| Browser-safe complexity limit       |     1 |
| Unexpected UI failure               |     0 |
| Browser `pageerror`                 |     0 |

In addition:

- 11 bundled KLayout samples pass through the visible sample selector.
- The representative mask-to-operation chain passes.
- The normal WaferCAD Quality workflow also passes.

## Compatibility fixes found by the corpus

The KLayout sweep exposed several issues that smaller local fixtures did not cover:

- OASIS TRAPEZOID records
- OASIS CTRAPEZOID records and modal width/height semantics
- OASIS Manhattan 2-delta decoding
- OASIS octangular 3-delta/gdelta direction decoding
- repetition variants and zero-step repetition semantics
- XGEOMETRY/XELEMENT extension record consumption
- CELLNAME/TEXTSTRING mode and reference validation
- gzip-compressed layout streams carrying a normal `.gds` filename
- large hierarchy/array expansion causing process OOM instead of a controlled import error

## Expected rejection versus regression

Some KLayout files are deliberately invalid conformance tests. Those are recorded as **expected rejection**, not failures. Examples include mixed implicit/explicit name-table assignment, undefined text/cell references, and undefined modal variables.

Large generated DRC/algo layouts can be syntactically valid while expanding far beyond a practical browser representation. These are recorded as **complexity limit** when WaferCAD stops them at its explicit safe expansion guard. A limit must be deterministic and must not crash the browser or Node process.

Any other rejection, timeout, crash, browser exception, or unexpected acceptance of a known-invalid conformance sample fails the compatibility workflow.

## Re-running

The compatibility workflow is defined in:

`.github/workflows/klayout-compat.yml`

Its reports are uploaded as workflow artifacts:

- `klayout-compat.json` — full parser/flatten corpus
- `klayout-ui-compat.json` — real browser import results
- `ui-failures/` — screenshots when a UI case fails

The standalone runners are:

- `scripts/klayout-compat.mjs`
- `scripts/klayout-ui-compat.mjs`

When updating the pinned KLayout revision, review newly added or changed upstream negative tests before changing the expected-rejection list. Do not convert an upstream-defined malformed sample into a WaferCAD PASS merely to make the corpus green.
