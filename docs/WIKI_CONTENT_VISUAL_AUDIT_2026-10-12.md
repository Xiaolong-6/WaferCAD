# Wiki Content and Visual Audit — 2026-10-12

**Scope:** The tracked `docs/wiki/` manual on `docs/ai-assisted-workflows-20261012`, audited against the current `site/bundled-examples.js`, Process Guide source, v2 Workstation UI implementation, and existing repository assets. This is a **source and documentation audit**, not a new browser acceptance run or a pixel review of every binary image.

## Editorial rule

Every illustration must answer a specific question in the adjacent paragraph. Prefer, in order:

1. A **matching WaferCAD capture or shipped example thumbnail**, tied to the exact named example and with a caption saying what it actually demonstrates.
2. A **canonical in-app Process Guide schematic** for the named operation, explicitly labeled conceptual and not a screenshot or fabricated physics result.
3. A **task-specific Mermaid diagram** for selection logic, workflows, view relationships or troubleshooting where a screenshot would obscure the important facts.

Do not add stock photography, random microscopy, generic semiconductor renders, unrelated device previews or purported research-article figures simply to increase illustration count. Original publication figures require appropriate usage permission, attribution and explicit figure provenance. Caption each image immediately below it, identify the source/type (actual app output vs. schematic vs. workflow logic), and explain scientific/visualization limitations. Figure alt text must describe the example or mechanism, rather than repeat “sample image.”

## Page-by-page findings and corrections

| Page | Audit and action |
| --- | --- |
| `Home.md` | Retain the real, relevant photodetector preview as an example entry image. Correct the operation illustration count from 18 to the actual **19** in the shared Guide catalog. |
| `First-10-Minutes.md` | Keep the matched directional-deposit and selective-etch guide schematics. Add a diagram of the exact exercise sequence. Align controls and defaults with current v2 (Project → Base → Rebuild Base; Manual; Direct coverage; Thickness/depth; **Also add to Recipe → No**). Fix six → eight Welcome examples. |
| `Getting-Started.md` | Retain the clearly labeled shipped example preview and appropriate directional schematic. Fix six → eight examples, v2 Base/Process labels, default manual Recipe capture, and differentiate Manual Front/Back from supported Recipe Both. |
| `Workspace-and-Views.md` | Replace a generic tandem 3D hero with paired **3D and Section** reference captures from the **same MAGIC-1000 example**. Add a view-relationship diagram. Z-break captions distinguish display compression from a physical cavity. |
| `Masks-and-ROI.md` | Retain the application-owned Mask visualization reference. Add explicit diagrams for selected/inverted/full-face clipping by Mask ROI and for the different responsibilities of Mask ROI, Main ROI and Section A–B. |
| `Process-and-Recipes.md` | Move the conformal schematic next to Conformal's specific explanation. Add the actual canonical Lift-off schematic next to Lift-off. Correct seven → eight Recipe commands and document supported Both/unsupported combinations. |
| `Recipe-Code-Tutorial.md` | Relocate conformal illustration into the relevant command section, and add the canonical selective-etch figure next to File Mask instructions. Document Recipe `face: 'both'`, two independent deposited Layer IDs, and current **Process → Code** navigation. |
| `Process-Operations.md` | All **19** canonical Process Guide variants already have corresponding generated before/after SVGs. **Do not edit generated Markdown or replace images manually.** |
| `Examples-and-Modeling-Limits.md` | Keep example-specific assets sourced from the actual Welcome catalog. Repair the split eighth table row, remove stale “candidate branch / awaiting merge” language, and correct the 3D/Section caption pairing. Give each preview meaningful example-specific alt text/caption with scientific caveats. |
| `AI-Assisted-Workflows.md` | Add the missing task visuals: human-reviewed paper/mask/Recipe handoff diagram, real paper-derived example output, code-related conformal Guide figure, application-owned Mask reference, explicitly illustrative TiO₂ meta-atom schematic, and debugging decision tree. Every figure states what it does **not** prove. |
| `Troubleshooting.md` | Move the formerly disconnected conformal schematic to **“A conformal coating has no sidewalls”**, its relevant symptom. Add a decision tree separating Section geometry and 3D presentation problems. |
| `Import-and-Export.md` | Existing Mermaid diagram directly describes project, Mask and view export paths. Keep it; adding a random export screenshot would contribute no new information. |
| `History-Variants-and-Recovery.md` | Existing History/Variant/Recovery Mermaid lineage diagram is directly relevant. Keep it, without decorative photography. |
| `_Sidebar.md` | English-only navigation already includes the AI guide. No illustration belongs in navigation. |
| `Recipe-Code-Tutorial-zh-CN.md` | Preserve the previously established short English compatibility pointer; do not expand localized content or translate historical audit documents. |

## Claims and acceptance boundaries

- The **eight** Welcome entries were checked against `BUNDLED_EXAMPLES`, not a handwritten count.
- The **19** operation illustrations are generated from `PROCESS_GUIDE`; they are scientifically scoped schematics, not screen captures.
- The live v2 UI owns current button names. Legacy UI controls are only mentioned explicitly as legacy equivalents; Process Recipe Code remains a restricted literal language.
- Images whose filenames and originating catalog prove their source were verified at the **repository-path/reference level**. This audit did **not** visually review the binary pixel contents and cannot certify all prior screenshots as up-to-date UI baselines. Older binary images remain labeled as saved example/pre-existing captures, with no claim that they depict the latest live controls.
- No visual baseline, source-science code, Process Guide generator, third-party photo, workflow trigger, example geometry or product UI was changed as part of the Wiki edits.

## Reproducible gates

Before integration, run in a checked-out repository:

```bash
npm ci
npm run docs:check
node --test site/tests/wiki-manual.test.mjs site/tests/documentation.test.mjs site/tests/process-guide.test.mjs
npm run format:check
git diff --check
```

The Wiki image regression validates image existence, trusted first-party asset paths, descriptive alt text, immediate provenance captions, and the 19-variant count; it cannot replace a human review of screenshot pixels or the actual Wiki rendering. The eight-example catalog test now also requires one contiguous Markdown table.

**Execution note:** This GitHub-connected editing environment could inspect and update repository files but did not have an executable checkout or reliable access to binary screenshot pixels. The commands above were **not executed locally** in this audit. Verify their results from a real checkout or CI before merging, then inspect the synced GitHub Wiki after merging to main. No PR or main merge was requested.
