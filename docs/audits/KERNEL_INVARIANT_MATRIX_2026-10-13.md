# Kernel scientific invariant matrix — 2026-10-13

Baseline: `main@2949dfc`.

## New contract tests

- Both-face candidate mutation followed by thrown error or no-change must not commit either face.
- Four deterministic model seeds cover Both Deposit and sequential Front/Back selective Etch.
- Canonical models must pass schema validation, reference existing unique Layer IDs, and contain finite, positive, non-overlapping Z intervals.
- Selective film Etch preserves underlying Base and the opposite face.

## Verification limits

This tests current vector 2.5D geometry semantics. Suspended materials and intentional true voids remain supported; this suite does not forbid them. It is not a calibrated physics model or exhaustive randomized-property campaign. Full Process Geometry browser acceptance remains separate.

Run locally: `node --test site/tests/kernel-invariant-matrix.test.mjs`.
