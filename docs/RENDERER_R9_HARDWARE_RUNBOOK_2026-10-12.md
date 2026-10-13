# R9 single-session physical GPU acceptance runbook (2026-10-12)

## Objective

Collect **one** reproducible ZIP using a pinned V3 revision and current V4,
rather than asking the operator to run five independent commands or
reinstall dependencies five times. This is a hardware acquisition, **not**
a promise that either PR will pass.

The `--campaign=r9` mode performs, in order:

1. `v3` — production-boot-policy fresh WebGL contexts OFF/OFF/ON/ON,
   strict zero-pixel PNG and native-GL framebuffer parity, ordered
   checkpoint hashes, full sampled raster-state census.
2. `v3-msaa-off` — the same four fresh contexts with only context
   antialiasing disabled; verify zero framebuffer samples. This is a
   **hypothesis test, never production acceptance**.
3. `v4-index` — four A/B/B/A contexts, isolated FastSmoothIndex.
4. `v4-caps` — four A/B/B/A contexts, isolated SharedFlatCaps.
5. `v4-combined` — four A/B/B/A contexts, both candidates.

A single invocation fetches the live V4 HEAD and pins the archived V3 revision, verifies V4 descends from V3,
creates detached temporary Git worktrees, installs locked dependencies,
checks Chromium navigation, runs the steps and saves _each experiment's_
report, screenshots and logs before producing a portable ZIP. It does
**not** switch, clean, reset or modify the operator's active worktree.

## Revision provenance (PR #166 branch deleted)

PR #166 is closed and its remote `perf/transparent-renderer-v3-20261009`
branch has been deleted. The launcher **does not fetch that missing ref**.
It uses the immutable final V3 commit `4e7128042fb5ef86908e4ee7e3df7084ae7ce52f`, verified as an
ancestor of the still-live V4 branch `perf/renderer-v4-adaptive-tiles-20261010`.
The launcher first fetches V4, then verifies the V3 Git object is present
and is an ancestor; if either fails, it stops rather than comparing the
wrong renderer. A normal full-history clone of V4 has the V3 commit.

## Targeted V4 follow-up after R9 evidence (diagnostic only)

The 2026-10-13 physical RTX 3060 R9 session established that production
4-sample MSAA had same-policy fresh-context drift, while V3 no-MSAA made
all four frames and native GL framebuffer hashes identical. To isolate
whether V4 Index/Caps independently cause pixel changes, the new
`--campaign=r9-v4-msaa` collects only the **three V4 A/B/B/A modes**.
The launcher installs V4 only, never reruns V3 and never accepts no-MSAA
as a production pass. The report records actual default framebuffer
`SAMPLES=0` and `contextAntialias=false` in all twelve contexts.
Run from an updated WaferCAD worktree with a verified real GPU:

```powershell
node scripts/renderer-unified-hardware.mjs --plan-only --campaign=r9-v4-msaa
node scripts/renderer-unified-hardware.mjs --hardware-gpu --campaign=r9-v4-msaa
```

Do not compare wall-time values from this diagnostic with normal production
MSAA runs as evidence of speedup. It exists to attribute **pixel parity**
on a controlled alternative raster path. Share one ZIP from the runner.
Even a zero-pixel result in all three diagnostic arms leaves production
4-sample MSAA hardware acceptance blocked.

## Exact PowerShell procedure

From your existing Windows WaferCAD checkout (replace the first line
with your actual checkout path if different), in **PowerShell**:

```powershell
Set-Location 'C:\path\to\WaferCAD'
git status --short
git fetch origin perf/renderer-v4-adaptive-tiles-20261010
git switch perf/renderer-v4-adaptive-tiles-20261010
git pull --ff-only origin perf/renderer-v4-adaptive-tiles-20261010
node --version
node scripts/renderer-unified-hardware.mjs --plan-only --campaign=r9
node scripts/renderer-unified-hardware.mjs --hardware-gpu --campaign=r9
```

Node **24** is the CI version. The actual GPU may be Intel, AMD or
NVIDIA; hardware classification rejects SwiftShader/WARP and requires
a consistent real adapter in every experiment. Keep Windows desktop
unlocked, the browser able to open headed Chromium, and the machine
on external power if it is a laptop. Other GPU-heavy applications
should be closed. **Do not run `npm test`, `npm ci`, manual Chrome,
or each stage individually first**: the launcher handles dependency
installation, pinned Chromium, HTTP preflight and all five trials.

If `git switch` or `git pull --ff-only` refuses to proceed because
of uncommitted changes, stop and report that output. Do **not** force
the checkout, hard reset, clean or discard local work.

The five experiments include expensive full-wafer 3D workloads and
may run for a while; leave the PowerShell session and headed Chromium
windows active. A strict parity rejection normally makes the command
exit with code 1 **after still writing a valid ZIP**. An error exit
alone is not a reason to delete evidence or repeat the run.

## Deliverable: one ZIP

Look for the terminal line **`Shareable evidence ZIP:`**, normally:

```text
test-results/renderer-unified-hardware/<UTC-timestamp>.zip
```

If the terminal has scrolled, find the newest file:

```powershell
Get-ChildItem 'test-results/renderer-unified-hardware/*.zip' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
```

Upload **the complete ZIP** to the conversation. Do not send only
`summary.json` or re-encode screenshots. If the ZIP step fails, send
the preserved evidence directory as one archive and include the
terminal error. Never commit hardware screenshots or private local
machine paths to the public repository.

## Interpretation / stop criteria

- `summary.json` records both exact SHAs (pinned V3 and fetched V4), all five steps,
  classification and their report/log paths.
- `campaignComplete=true` means all five steps produced valid evidence,
  including MSAA diagnostic evidence; `passed=true` additionally means
  the standard strict parity gates passed. It is valid and useful to
  obtain `campaignComplete=true, passed=false`.
- The MSAA diagnostic is acceptable only as
  `status="diagnostic-complete"`, with actual antialias disabled and
  zero default framebuffer samples. It can **never** approve the product.
- A standard V3 result is `passed` or `blocked`. A V4 candidate
  result is `passed` or `blocked`; a failure to activate the candidate
  is `candidate-not-exercised`, not a pixel-parity result.
- Inspect the V3 baseline and MSAA comparison **within the same GPU /
  driver / experiment session**. A change from drifting to identical
  pixels is an MSAA lead, not proof of root cause; a persistent mismatch
  rejects MSAA disable as a sole fix.
- Inspect V4 A/A and B/B first, then A/B. Same-policy nondeterminism
  prevents attributing all differences to a candidate. Assess isolated
  Index and Caps separately; combined-mode evidence alone does not
  establish individual improvements.
- Missing/invalid GL phases, unsupported adapters, missing screenshots,
  HTTP failures and interrupted steps remain classified as errors.
  Valid earlier stages are preserved even if a later stage fails.
- Strict tolerance stays **zero changed pixels**. Do not change feature
  defaults, scientific geometry, shaders or approved visual baselines
  to obtain a passing capture. No merge of #166 or #174 without the
  required successful hardware evidence and explicit review.

If this one campaign completes, the next engineering task is **analyze
the ZIP, identify whether MSAA changes the fresh-context failure, and
decide the fate of isolated V4 candidates**. Do not request another
expensive hardware run unless the captured data establishes a specific,
falsifiable follow-up hypothesis.
