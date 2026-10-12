# RTX 3060 V3 DITHER isolation — October 12, 2026

## Acquisition

Source: user-uploaded
`rtx3060-v3-dither-3b07cf2-2026-10-12T05-17-55-947Z.zip`.
Captured UTC 2026-10-12 05:19:01 with Windows RTX 3060 D3D11.
Git revisions: V3 `3b07cf298fbfbcc91d9de6abac95dd3f2d01952d`,
V4 runner `465dfc2edcf3cc79317241a4bba02e2e74762413`.
No infrastructure errors; `diagnosticComplete=true`,
`passed=false`, `strictPixelParity=false`. Four fresh contexts,
531 × 275 = 146,025 pixels per image.

## Pixel result

| Same-policy pair | Baseline changed pixels | DITHER-off changed pixels | Max channel deviation |
| ---------------- | ----------------------: | ------------------------: | --------------------: |
| OFF/OFF          |                      54 |                        33 |                     1 |
| ON/ON            |                      78 |                       134 |                     1 |

All four GL contexts used the RTX 3060 hardware backend and reported
`glError=0`. The no-DITHER probe counted **1,408 actual disabled
draws** in each OFF capture and **1,291** in each ON capture.
For both same-policy comparisons: camera, draw order, bounded
draw-input hash and material hash match. The native framebuffer
hashes diverge; the screenshot compositor is not the first
observed divergence stage. OFF's first sampled mismatch is
after draw 256; ON's is after draw 384. Both are
`material-exterior`. These are sampled checkpoints, not exact
first-differing draws.

The OFF pair has 33 changed pixels in bbox x214–312, y122–158;
the ON pair has 134 changed pixels in bbox x213–304, y114–174.
All changes were RGB only with max absolute channel delta 1.
DITHER-off did **not** remove fresh-context drift and is
therefore excluded as a sole root-cause fix. Comparisons across
the two independent runs cannot prove a statistically reliable
direction of speed or stability effect.

## Next actions and constraints

Run a diagnostic-only no-MSAA context-creation intervention,
keeping DITHER at the application default and checking
`getContextAttributes().antialias === false` and samples = 0.
Do not modify production colors, disable AA globally, alter
the approved screenshot baseline or relax the strict parity
acceptance criterion. PRs #166/#174 remain Draft.
