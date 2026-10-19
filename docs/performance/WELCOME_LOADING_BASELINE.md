# Welcome Example loading baseline

This is a **performance measurement**, not a geometry/physics/Recovery gate or
an authorization to tune scientific tolerances. The source catalog is
`site/bundled-examples.js`; all released Welcome full-project files (currently
nine) are measured, rather than just the small preview documents shown on cards.

## Reproduce

From a complete checkout of the target revision, with pinned `npm ci` dependencies
and an installed Chromium:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
# In another shell, if Linux headed Chromium needs Xvfb:
WAFERCAD_BENCH_HEADFUL=1 WAFERCAD_THREE_DIR="$PWD/node_modules/three" \
  WAFERCAD_PERF_REPEATS=3 xvfb-run -a \
  node scripts/perf-workstation-cold-open.mjs --welcome
node scripts/summarize-welcome-loading.mjs test-results/welcome-load-baseline
```

The benchmark leaves the original T-CMOS-compatible no-argument mode intact.
For parallel CI, set `WAFERCAD_PERF_SHARD_INDEX` to 0, 1, or 2 and
`WAFERCAD_PERF_SHARD_COUNT=3`; merge the resulting shard JSON files in one
folder before summarizing. Do not independently merge results from different
source SHAs or different Welcome catalogs.

## Stage definitions

- **Disk read / JSON parse:** standalone Node measurements, from the actual
  shipped `.wafercad` byte stream, captured once per project before repeats.
- **Chromium boot:** new browser process and context for every sample, recorded
  separately from app startup. Browser and OS caches are **not** forcibly
  cold, so do not report this as a cold OS-cache benchmark.
- **Workstation ready:** navigation to `app.html?start=empty` until the actual
  production v2 readiness marker.
- **Project opened:** native UI file input and confirmation through the real
  Project Worker until Workstation's loaded model/name are visible.
- **Worker phases:** from the production Worker message: dynamic module load,
  parsing, storage expansion, migration plus strict validation, and total
  pre-send work. Clock origin is the Worker, not the main page.
- **Post-worker / History:** elapsed time from actual Worker `done` message to
  Workstation snapshot; available performance measures whose names begin
  `wafercad:history:` are also recorded. A post-worker interval is **not**
  pure History time and includes message delivery, state application and UI.
- **3D:** immediate switch after Open, waiting for `renderState=ready`,
  `renderPhase=complete`, no build failure and at least one visible object.
  Separate renderer dataset measurements identify topology, smooth caps,
  sidewalls, annotation, assembly, roughness and draw statistics when exposed.
- **Main / Mask / Section:** view switch to actual visible nonzero-size
  canvas and two animation frames, **after 3D**. These are warm view costs,
  not independent cold launches or a guarantee every deferred detail is built.
- **Navigation to 3D:** Workstation navigation start through actual completed
  first 3D frame. This includes the Project Open and is comparable within the
  same methodology, but not to a standalone Worker validation time.

Raw data store each sample, byte count, input SHA-256, Chromium version, visible
objects and completion/failure state. Report medians, minima, maxima and the raw
numbers (not an unqualified single fastest sample). The first sample of each
project also captures genuine production 3D and Section screenshots. All nine
projects and all repetitions must pass the completeness checker; missing or
failed data cannot be reported as a green baseline. A missing renderer metric
is reported as **not instrumented**, never zero.

The dedicated workflow is triggered only when benchmark instrumentation is
changed in its PR. It does **not** run on every ordinary Main push and does
not constitute an end-user Windows / hardware GPU SLA. Compare repeated runs
only after recording the OS, browser, sample count, release source SHA and
project artifact SHA. Do not tune production geometry just to improve timings.