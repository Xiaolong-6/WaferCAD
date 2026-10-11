# Renderer V3 + V4 unified RTX 3060 evidence

This is a **diagnostic tool**, not a replacement for either PR's acceptance gates.
PR #166 (V3) targets `main`; PR #174 (V4) targets the V3 branch.
Both remain Draft until their individual hardware parity requirements pass.

## One command on Windows

From any checkout of PR #174, with Node 24, npm, Git, PowerShell, network
access to the repository, and a working RTX 3060:

```powershell
node scripts/renderer-unified-hardware.mjs --hardware-rtx3060
```

The script fetches both remote branch heads, checks that the V4 HEAD contains
the V3 HEAD, makes two **detached temporary Git worktrees**, installs pinned
dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, installs
pinned Playwright Chromium, and launches its own local HTTP server. It leaves
the current checkout and its uncommitted changes untouched.

The default run executes the original V3 OFF/OFF/ON/ON diagnostic and the V4
A/B/B/A diagnostic for each of `FastSmoothIndex` only, `SharedFlatCaps`
only, and both enabled. Each trial uses the exact revision of its respective
PR; never substitute the V4 default-off scene for a V3 commit-level result.

For a smaller targeted run, use `--modes=index`,
`--modes=caps`, `--modes=combined`, or
`--modes=index,caps`. Review the plan without touching Git or GPUs:

```powershell
node scripts/renderer-unified-hardware.mjs --plan-only
```

## Evidence and result interpretation

Every run produces a new timestamped directory under
`test-results/renderer-unified-hardware/` and an accompanying ZIP. It
contains a `summary.json`, the exact SHA for each branch, logs for installation
and each experiment, plus the original screenshots and `report.json` files.
Upload **one ZIP** for review. The runner continues gathering the other policies
after a strict pixel mismatch. Missing artifacts, wrong candidate flags,
unexercised V4 optimizations, and nonzero error exits remain failures.

CI uses software WebGL (SwiftShader) and cannot validate Windows Direct3D11
or actual GPU execution time. On RTX 3060, the strict zero-pixel requirement
is unchanged. The previously observed 45 stable A/B pixels are an attribution
lead, not proof of a specific geometry or material defect. No approved visual
baseline is modified by this script.

The runner may exit nonzero **while still producing a usable ZIP** because the
strict pixel gate has not passed. Retain the evidence; do not weaken assertions
or merge either PR on the strength of software smoke tests.
