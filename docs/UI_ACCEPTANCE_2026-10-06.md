# UI acceptance - 2026-10-06

The Z-collapse editor uses a 560 px horizontal layout with two control columns and a compact ruler. It fits the short desktop Section dock without vertical scrolling; narrow containers retain a stacked, scrollable layout. The toolbar button has a slider SVG, an accessible name, and visible focus/active states. Existing control IDs and interactions are preserved.

Both tandem project copies now open with centered Main/Mask framing, a 32 x 32 um ROI, a 32 um Section cut, a selected oblique camera, and a narrow Detail ROI around the front pyramid coatings. Only current view metadata changes: canonical geometry, materials and every History/Variant state remain identical. Native import retains saved camera position/target/FOV; Welcome previews retain its orientation and fit the card dimensions.

3D display magnification and camera clipping use the visible ROI extent. Previously a 25 mm wafer viewed through a 40 um ROI inherited whole-wafer vertical amplification, producing an excessively tall slab. ROI changes now affect display scale only; the renderer contract asserts that exported physical geometry remains unchanged and removing ROI restores the full-view scale.

## Real Chrome acceptance

Installed Chrome 154.0.8037.98 on Windows, Node 24.19.0, Playwright 1.55.1, pinned Three 0.179.1. The four Welcome views, front/back views at matched inclination, and the Section Detail were visually inspected. Front/back use the same 4.5 um pyramid height and 6.4 um feature size, with independent seeds; their film stacks differ. Thus identical magnification is required, rather than identical textured pixels.

- Linked: Section front/back both 15.8348039375 px/um; 3D multipliers both 1.
- Unlocked 2:1: Section 20.7883730101 / 10.3941865050; 3D 2 / 1.
- Unlocked 1:2: Section 10.7240374376 / 21.4480748752; 3D 1 / 2.
- Relocked: original 1:1 scaling returns. Section canvas raster and 3D screenshot are identical to their initial states. Full DOM Section screenshots can differ due to focus/Detail overlays; no pixel baseline was regenerated.

Maximize starts an asynchronous morphology rebuild. The acceptance script waits for visible material caps as well as the detailed render state before taking the front/back inspection captures.

The transactional test injects an overlapping region into only a cloned worker request and clicks the normal historical-Step Apply / Create Variant UI. The real worker computes and strictly rejects the candidate. The status explains rejection and preservation; model, History and bookmarks remain exactly equal, Steps remain 2 and Variants remain 1. The next normal Apply succeeds, producing Step 3 and Variant 2. No empty Variant is left by rejection.

## Local checks and reproduction

Full Node inventory: 374 passed, zero failed/skipped. ESLint passed. Responsive product layout passed with 48 captures; renderer product checks passed with 15 captures (extended literature review disabled). All example browser checks passed, including native camera preservation, ROI/Detail persistence, physical export and the tandem GLB 32 um clip. Changed product files and new scripts pass Prettier; the full formatting inventory retains 13 pre-existing warnings. Approved visual baselines are unchanged.

Run the ordinary local Node/lint/example/product commands from package.json. For the explicit Chrome checks:

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
$env:WAFERCAD_CHROMIUM = 'C:/Users/liux16/AppData/Local/Google/Chrome/Application/chrome.exe'
$env:WAFERCAD_HEADFUL = '1'
node scripts/tandem-visual-acceptance.mjs
node scripts/process-transaction-ui-regression.mjs
```

Machine-readable evidence is in tests/fixtures/project-io/ui-acceptance-windows-chrome.json. Captures remain local under test-results/ui-acceptance. Feature-branch commits use [skip ci]; no CI, main merge or deployment is requested.

The six-project size/timing results are recorded separately in EXAMPLE_STORAGE_OPTIMIZATION_2026-10-06.md. Tandem framing adds one byte to each storage-only file measured there. Native Fig3 ILD2 and T3 now pass through Chrome, and the completed 40-Step single-site reconstruction is a Welcome example (see NATIVE_CONFORMAL_FOLLOWUP_2026-10-06.md and NATIVE_FIG3_EXAMPLE_2026-10-06.md). Final Node inventory after these additions is 376 passing tests.
