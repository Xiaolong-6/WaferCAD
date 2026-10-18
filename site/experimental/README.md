# Experimental WaferCAD research

Experimental files are **opt-in only**. They are not a replacement for the
existing lightweight Roughness/pyramid rendering or normal Process/History.
Default Welcome Examples, previous project versions, and scientific tolerances
stay unchanged.

## Microdisk (`microdisk/`, issue #298)

The separate, saved 72-band .wafercad project is reproducible from the
published Microdisk M07 state. Original M08/M09 and Main History are retained
without modification. The 36 µm release radius is **assumed**, not paper
measured. The source SEM depicts a similar device; identical-device SEM parity
is not verified. Generation is CPU-intensive (approximately two minutes)
and **must not run during ordinary startup**.

From the repository root:
- `node --test site/experimental/microdisk/microdisk-adaptive-persisted-variant.test.mjs`
- `node site/experimental/microdisk/generate-microdisk-adaptive-variant.mjs`
- `node site/experimental/microdisk/check-microdisk-adaptive-persisted-workstation.mjs`
  (requires a real local Chromium server).

## Physical facets (`physical-facets/`, issue #297)

The optional physical Si/SiO₂ owner and expensive meshing experiments are
not the default implementation of pyramidal texturing. Normal Roughness
continues to be lightweight, display-first geometry. Masked Conformal,
Etch, Implant and other unimplemented physical-process combinations remain
unsupported rather than silently approximated as correct.

See `docs/science/ROUGHNESS_MORPHOLOGY.md` and
`docs/science/PHYSICAL_FACET_MODELING_2026-10-16.md` for contract details.
