# R8 targeted WebGL draw-window diagnostic (2026-10-12)

## Purpose and acceptance boundary

This is an **opt-in, diagnostic-only** refinement of the existing V3
OFF/OFF/ON/ON fresh-context capture. It narrows the earliest **observed**
framebuffer divergence between two matching-policy contexts without
changing the scientific geometry, production render state, visual
baselines, or the zero-pixel parity gate.

The original 11 fixed capture milestones are unchanged in standard V3
runs. A targeted acquisition replaces them with **at most 11** ordered
checkpoints, including both ends of a previously observed draw interval,
plus one final-frame readback. When the interval is less than 10 draws,
duplicate sample indices are removed. The supported range is
`1 <= LOW < HIGH <= 1280` for the existing 625-site fixture and
OFF/ON draw budgets. This limit is deliberately conservative and must
be reverified before changing the physical fixture or draw topology.

## Running without requiring a particular GPU

From a checkout of PR #174, with Node 24, Git, npm, a desktop
Chromium session, and a verified Intel, AMD, or NVIDIA WebGL GPU:

```bash
node scripts/renderer-unified-hardware.mjs --hardware-gpu --diagnose-v3-phase-window=256:384
```

`--plan-only` permits inspecting the command and artifacts without
using a GPU:

```bash
node scripts/renderer-unified-hardware.mjs --plan-only --diagnose-v3-phase-window=256:384
```

The unified runner checks out exact V3 and V4 SHAs into temporary
worktrees without changing the active worktree, installs locked
dependencies, performs a Chromium HTTP preflight, and preserves an
evidence directory and portable ZIP. Its diagnostic step runs only V3.
For a standalone, already-served V3 checkout, the equivalent direct
command is:

```bash
node scripts/renderer-electrical-fresh-context-ab.mjs --hardware-gpu --report-only --diagnose-phase-window=256:384
```

The standalone command requires the existing `WAFERCAD_URL` server
and the pinned Three.js setup described in `docs/testing.md`.

The original October 12 RTX 3060 evidence localized OFF/OFF drift
between draws 256 and 384, and ON/ON drift between 128 and 256 in an
earlier acquisition. These are examples of **observed bounds**, not
a guaranteed recurring location; subsequent drivers, platforms or
runs may differ. First use the current standard fresh-context report,
then choose a window relevant to the _same hardware environment_.

## Reading the evidence

Inspect `report.json`: `phaseWindow`, `phaseMilestones`,
`observedDriftWindows`, and each same-policy comparison's
`phaseEvidence`. A result such as `256:269` means the first observed
different checkpoint follows a matching draw-256 checkpoint.
It **does not prove that draw 269 or its labeled object caused the
mismatch**. The capture has bounded coverage and readback may itself
affect driver scheduling. Repeat as appropriate before attributing
geometry or shader ownership.

The capture rejects missing hashes, incomplete milestones, invalid
WebGL state, mixed adapters, and unsupported ranges. Both arms of each
same-policy pair must use the same adapter, driver and render mode.
DITHER-off and no-MSAA interventions cannot be combined with a draw
window: each is an independent hypothesis.

A completed draw-window run always reports `acceptanceEligible=false`
and `passed=false`, even if all pixels happen to match.
`diagnosticComplete=true` means valid evidence was collected, not
that V3 or V4 passed production acceptance. Real hardware performance
and strict **standard** fresh-context parity remain open. No approved
visual baseline is touched, and both PRs remain Draft.

## R8.3 sampled raster-state census

Each native draw-milestone and final-frame checkpoint now records a
read-only `rasterState` snapshot: viewport/scissor; RGB and alpha
blend factors and equations; color write mask; depth/cull/stencil
controls; dither; polygon offset; sample coverage and default-framebuffer
sample count. GPU object IDs and program handles are deliberately
excluded because they are not comparable across contexts.

Every same-policy comparison includes `rasterStateEvidence` with one of
`sampled-states-identical`, `sampled-state-mismatch`,
`invalid-raster-state`, `sequence-mismatch` or `not-captured`.
When a state mismatch is observed, the report identifies the first
sampled draw, changed GL fields, and both values. This distinguishes
observed pipeline-state drift from framebuffer divergence where the
sampled pipeline state agrees. Even complete state equality cannot
prove identical fragment inputs, precision, resolve behavior or a
causative draw. The final snapshot is taken at end-of-frame, not
necessarily inside the last draw.

Standard hardware acceptance and targeted diagnostic classification
both reject missing or malformed state snapshots. Software test
harnesses use deterministic fake GL values; they do not certify real
Intel, AMD or NVIDIA driver behavior. No global WebGL flags, geometry,
shader programs or visual baselines are changed by this addition.

## Validation ownership

- `site/tests/renderer-v3-phase-window.test.mjs` covers strict
  arguments, bounded sampling, nonfabrication of drift windows and
  diagnostic-only acceptance.
- `scripts/tests/renderer-unified-hardware.test.mjs` covers the
  unified-runner plan and fail-closed classification of missing or
  changed checkpoint evidence.
- `.github/workflows/renderer-v4-r1.yml` runs the targeted tests.
  These software-only checks are **not** a replacement for a
  real-hardware acquisition.
