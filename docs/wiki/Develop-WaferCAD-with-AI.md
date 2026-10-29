# Develop WaferCAD with AI

This contributor guide separates **changes to WaferCAD itself** from using its
Recipe editor to model a device. It applies to AI coding agents, reviewers,
and researchers who need reproducible source, process, geometry and visual
evidence—not just a persuasive screenshot. End users asking for Recipe and
mask prompts should read [Using WaferCAD with AI](AI-Assisted-Workflows).

The repeated **T-CMOS PR #225** details below are a _worked engineering case_;
its polygon counts, metallization tiers and validation commands are **not**
universal requirements for unrelated devices. Its uncompleted follow-ups are
tracked in [Issue #333](https://github.com/Xiaolong-6/WaferCAD/issues/333).

## 1. Define the deliverables before opening an editor

An AI agent should write a short, auditable _acceptance manifest_:

**Source provenance** — **Minimum evidence:** Source file, paper/figure, SHA-256, unchanged original layout vertices and layer names; **Insufficient proof:** Hand-copied screenshot rectangles.

**Physical 2.5D model** — **Minimum evidence:** Material stacks, XY polygons, Z spans, no unsupported voids/overlaps; **Insufficient proof:** Number of colored layers.

**Process** — **Minimum evidence:** Base, captured Mask, step-by-step Recipe outputs, real saved History and Recovery; **Insufficient proof:** Saved final geometry with invented replay log.

**Array (if the model uses instances)** — **Minimum evidence:** Cell template, instance transforms, local/world coordinate mapping and mask/physical parity; **Insufficient proof:** Visual clones without actual process or physical coverage.

**Interconnect (if the model claims connectivity)** — **Minimum evidence:** Explicit terminal positions, continuous conductor/via material, relevant short/open/spacing checks; **Insufficient proof:** A netlist graph without matching geometric material. The four-metal-tier / 19-net T-CMOS example is case-specific.

**Visual** — **Minimum evidence:** Real WaferCAD Main/Mask/3D/Section in Chromium, right stage/camera/layers, opacity/Border variations; **Insufficient proof:** Simulated HTML, standalone SVG or uninspected thumbnail.

**Artifact** — **Minimum evidence:** Final exported `.wafercad`, readback using actual IO/schema, independent geometry audit, exact tested commit; **Insufficient proof:** Generator's own JSON `pass:true`.

Keep **reported**, **source-extracted**, **model-assumed** and **display-only** dimensions separate. WaferCAD is not a dopant diffusion, TCAD or transistor I–V solver.

## 2. Recommended execution sequence

### 1. Inspect the real source first.

Collect vector SVG, GDS/OAS, image figure and supplement files. Record their provenance and available/missing fields. Never derive mask coordinates from a low-resolution image after an original source vector is available. In the **T-CMOS case**, the earlier approximate screenshot-derived Mask was replaced by a sourced eight-layer SVG carrying 232 polygons, including 218 CNT footprints.

### 2. Solve one cell structurally.

Establish substrate, region ownership, contact/via stack, actual Z interfaces and Section lines through relevant structures. Save a correctly registered File Mask separately from private process-step Draw Masks. Check for **hidden supporting dielectric** before adding fake material to “fix” a floating-looking layer.

### 3. Replay the smallest Recipe from Base.

Compare _intermediate_ states, not just final surface appearance. Validate Process parameters and the **source-specific** operation count (23 in the T-CMOS case), History/Variants, Undo/Redo and separate Recovery/Export contracts. Retain the original model as the independent baseline.

### 4. Scale to array only after the unit passes.

Convert global to local mask queries for each instance and back to physical world coordinates. Support repeated single-cell Draw Masks without materializing a giant duplicate mask; preserve exact source SVG coordinates and apply the existing process grid only where explicitly intended.

### 5. Engineer cross-cell interconnect explicitly.

Specify every intended net and **the physical terminal coordinate**. The first PR #225 route had three M4 buses but left 16 VOUTs on short local M3 stubs. Its geometry tests passed only because they did not require perimeter output landings. Later work created 16 complete M3→VIA34→M4 fanouts. Always require at least one failing negative test for a missing output run, wrong Via owner or cross-net bridge.

### 6. Check actual material, not just the routing overlay.

Validate every Via's full XY footprint inside both conductors, Z-adjacent identity, no dielectric gap, enclosure and same-layer net clearance. Independently Boolean-compare each exported metal/Via footprint to actual 2.5D material polygons. For the final illustrative T-CMOS routed variant, independent material audit checked 19 physical connectivity components and 156 Via sites; this does not validate semiconductor electronic transport or foundry DRC.

### 7. Run the real workstation in Chromium early.

Default to Playwright plus Chromium; use **Xvfb + headed mode** and pinned offline Three.js 0.179.1 when headless WebGL fails. Use the real repository's `site/` assets, not a replacement mock. Wait for `renderState=ready`, `renderPhase=complete`, a populated 3D scene and nonzero draw calls. Capture Main, File/Draw Mask, 3D and Section; vary camera, opacity and Borders ON/OFF. Inspect images autonomously and fix obvious issues before asking the owner.

### 8. Test just what you changed, then integrate.

Run relevant science, history/recovery and targeted UI tests locally. Do not repeatedly push and poll full CI for each screenshot. Consolidate fixes into the current branch. At final acceptance: align current Main, remove obsolete Legacy-test conflicts without restoring retired files, run necessary Targeted CI, full Quality and science gates. **Never merge Main without explicit owner approval.**

## 3. Fault taxonomy: which layer should be fixed?

**Wrong shape, doubled features, missing contacts** — **What to inspect first:** Source vector vs imported/processed Mask, coordinate origin, polygon Boolean; **Responsible subsystem:** Example input / Mask translation.

**Array operates on only one device or on wrong XY positions** — **What to inspect first:** Template-local vs world transforms; deferred File Mask and repeat Draw Mask; **Responsible subsystem:** Array Process bridge and model context.

**Implant appears outside silicon or after etch** — **What to inspect first:** Surviving host material; depth start/end interval; exported region semantics; **Responsible subsystem:** Qualitative Dopant/Implant model.

**Very thin films shift after save** — **What to inspect first:** Source geometry vs 0.0001 µm process-grid quantization, lossless storage; **Responsible subsystem:** Kernel/IO contract; **never silently weaken tolerance**.

**Global metal cannot cross instances as an editable step** — **What to inspect first:** Native-array template ownership vs world-space material partition; **Responsible subsystem:** Model architecture, not polygon clipping.

**“N networks pass” but output traces do not exit array** — **What to inspect first:** Explicit port coordinates and complete 3D metal, not just manifest graph; **Responsible subsystem:** Example design and incomplete acceptance tests.

**3D appears suspended or blank** — **What to inspect first:** Real supporting ILD, layer visibility, camera, ROI, opacity/Border, rendering phase; **Responsible subsystem:** Display state/Renderer **before** changing Kernel.

**File Mask exists but only gray Draw shapes appear** — **What to inspect first:** `maskSourceMode` and `selectedLayerKeys` in saved opening state; **Responsible subsystem:** App/Welcome inspection preset.

**Uploaded project fails before parsing** — **What to inspect first:** Origin storage, IndexedDB, Recovery checkpoint creation; **Responsible subsystem:** App transaction environment; **keep protection**.

**Renderer works without Worker but fails in restricted browser** — **What to inspect first:** Worker creation, exact source geometry fallback, cancellation; **Responsible subsystem:** Renderer startup recovery.

**SVG exists but won't parse** — **What to inspect first:** Real XML parser + browser render; doubled attribute quotes; **Responsible subsystem:** Example generator; test the emitted artifact.

The original approved SVG and post-process M1 material are different data products: the model's **0.1 nm process-coordinate grid** can create small raw-coordinate differences even when the grid-normalized material is identical. Report these differences, preserve source vertices, and do not increase geometric error thresholds to conceal them.

## 4. T-CMOS case study: released capabilities versus prototype artifacts

PR #225 developed reusable code for instance-aware process Mask queries, repeated Draw Mask processing, optional File Mask grid semantics, material-clipped qualitative Dopant Regions, buried Implant start depth, File Mask palette presentation and 3D ROI inspection. These are **historical change descriptions**, not current branch acceptance. Preserve data/History transaction invariants. The boolean geometry Kernel ultimately handled the final multilayer material; the main architecture bottleneck is **native process continuation across array instances**.

There are **three distinct outputs**, never conflate them:

**1×1 source T-CMOS** — eight original File Mask groups / 232 polygons / 23-step Recipe with two restorable History Variants. This is the selected Welcome entry after release gates.

**Native 4×4 replay** — 16 instances / 3,712 original polygons, native 23-step History/Recovery verified. The saved display may need File Mask and its eight source layers enabled to become intelligible.

**Illustrative 4×4 global routed candidate** — flattened real `vector-2.5d-v1` material with 17 physical layers, 156 Via columns, 19 geometric nets and independent M4 output fanouts. It is **post-Recipe**, does not have a reconstructed interconnect History and must not be advertised as full native replay or a verified foundry route.

Document intermediate differences. A scientifically correct mask/region count alone is **not** complete customer-facing acceptance.

## 5. Bypass policy: diagnostic tools versus product behavior

**`about:blank` boot + interception of real `site/` modules** — **Permitted scope:** Read-only local screenshot harness for sandbox `URLBlocklist: ["*"]`; **Must never be inferred:** Successful ordinary Origin Open/Recovery.

- **Node `readProjectFile()` then inject restored model at the supported Workstation loading
  boundary** — **Permitted scope:** Verify genuine project/model/renderer behavior in a restricted
  test; **Must never be inferred:** Permission to disable Recovery checkpoint safety.
- **Isolated page sets `Worker` unavailable to trigger an existing equivalent synchronous
  renderer** — **Permitted scope:** Debug a Worker-startup sandbox limit; **Must never be
  inferred:** Automatic retry of an already-started Process task.
- **Xvfb + headed Chromium + offline pinned Three.js** — **Permitted scope:** Actual WebGL screenshot reproducibility; **Must never be inferred:** A green CI job or mock is a visual inspection.

**Independent polygon audits of the exported project** — **Permitted scope:** Identify incorrect metal ownership, voids and geometric short/open errors; **Must never be inferred:** Electrical simulation, PDK DRC or fabrication proof.

**Global-array flattening to construct M2–M4** — **Permitted scope:** Clearly isolated engineering prototype; **Must never be inferred:** Native global Process/History feature.

Normal-Origin Open, Storage and Recovery must be independently verified before release. A failed safe checkpoint is a **correct rejection**, not permission to remove the safeguard.

## 6. Test evidence that should be checked in that order

An agent should ship: (1) source SHA and model provenance; (2) one-cell geometry/Section; (3) every significant intermediate Recipe state; (4) true array/replay state; (5) actual material Via/net/terminal audit with negative tests; (6) screenshots with camera, ROI, Layer and Border/Opacity settings; (7) exported project readback and recovery; (8) exact-HEAD CI and Main merge status.

**T-CMOS case-study commands only** (do not assume these apply to every project). Run tests only after the corresponding business change is complete and before acceptance:

```bash
node --test site/tests/tcmos-svg-metal-connectivity.test.mjs site/tests/tcmos-array-interconnect.test.mjs
node --test site/tests/tcmos-array-physical-fast.test.mjs site/tests/tcmos-array-physical-interconnect.test.mjs
node scripts/build-tcmos-array-physical-interconnect.mjs
node --test site/tests/welcome-example.test.mjs site/tests/wiki-manual.test.mjs
npm run docs:check
```

In CI failures, separate stale assertions against retired DOM/Renderer code from a real scientific regression. The initial PR #225 route also emitted an SVG with duplicate quotes; testing XML parse and an actual rendering would have caught it before review. A valid source file is not necessarily a correctly rendered artifact.

## 7. Contributor completion checklist

**Acceptance check:** Clear source provenance and explicit model assumptions

**Acceptance check:** Actual original Mask vertices preserved; native array steps and geometry consistent

**Acceptance check:** Independent full XY/Z material, Via and output-port audit plus negative cases

**Acceptance check:** Recipe, History, Recovery and portable file readback at the _claimed_ scope

**Acceptance check:** Real headed Chromium screenshots reviewed for intended viewpoints, opacity and layers

**Acceptance check:** UI starts in an intelligible state without corrupting canonical saved edit state

**Acceptance check:** Latest HEAD aligned to Main; tests have no unexplained failures

**Acceptance check:** Known workarounds and unverified boundaries documented; temporary branches cleaned

**Acceptance check:** Explicit answer: what was delivered, what passed, what is unresolved, what AI does next, and what requires owner approval

**Acceptance check:** No unapproved merge to Main and no silent Welcome/Wiki publication

**Follow-up architecture and UX tasks:** [Issue #333](https://github.com/Xiaolong-6/WaferCAD/issues/333). **Context:** [PR #225](https://github.com/Xiaolong-6/WaferCAD/pull/225) and [T-CMOS source acceptance](https://github.com/Xiaolong-6/WaferCAD/blob/main/examples/projects/tcmos-ternary-inverter-2019-candidate/FIG1_ACCEPTANCE.md).

See also [Using WaferCAD with AI](AI-Assisted-Workflows) · [Examples and Modeling Limits](Examples-and-Modeling-Limits) · [History, Variants and Recovery](History-Variants-and-Recovery) · [Troubleshooting](Troubleshooting).
