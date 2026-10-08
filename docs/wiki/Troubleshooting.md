# Troubleshooting

[Home](Home) · [First 10 Minutes](First-10-Minutes) · [Getting Started](Getting-Started)

**Start with the observable symptom.** Check the **Section A–B** view and the currently selected **Mask**, **Front/Back** face, **Area** and **XYZ unit** before repeating an operation. Clicking **Apply** again may create another film or remove additional material.

| What you see | First checks | Safe next action |
| --- | --- | --- |
| **Apply does nothing / the wrong location changes** | Is the active Mask source **File** or **Draw**? Is **Area** set to **Selected mask**, **Invert mask** or **Whole face**? Is the active face correct? Is the Mask ROI restricting the operation? | Inspect the chosen mask in **Mask** and check the on-screen error. Correct the selection **before** another Apply. |
| **The entire substrate or oxide is etched away** | Was Etch **Material** left at **All exposed materials**? Is **Whole face** selected? Is the Z etch depth too large? | **Undo** if available; choose the intended material and mask. |
| **The opening is visible in Main/3D but missing in Section** | Does the **A–B line actually cross the opening**? | In Main, move/edit A and B to cross the feature. Do not conclude it is a Kernel error from a different slice. |
| **A film looks far too thick/thin** | Check the global **XYZ unit** (nm/µm/mm) and Section **Auto** versus **1:1**. | Inspect the actual entered length; **Auto** can exaggerate Z for visibility. |
| **Conformal film is missing from sidewalls** | **Directional** covers exposed horizontal faces; **Conformal** covers real sidewalls as well. | Confirm **Coverage = Conformal** and inspect Section along a real step. |
| **A drawn rectangle has no process effect** | Does the Mask header say **Draw**, does the rectangle overlap the substrate, and is the Area **Selected mask**? | Clear an unintended Mask ROI and retry **once**, after Undo if necessary. |
| **3D changes when I set an ROI, but the process does not** | A **Main ROI** clips the 3D view/GLB; a **Mask ROI** clips selected/inverted-mask operations. | Use **Mask ROI** for Process limitations; use **Main ROI** only for inspection. |
| **Run All gives duplicated layers** | Did you use **Continue current model** on an already processed device? | Export a backup, then choose **Rebuild Base first (new Main)** and handle History confirmation explicitly. |
| **I cannot find my changes after opening another browser** | **Save** is browser-local; it is not a portable file. | **Export** a `.wafercad` file and import it on the second device. |

![Schematic of conformal coverage](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-conformal.svg?sanitize=true)

_Illustrative geometry, not a prediction of the current project's coating._

## Visual artifacts versus actual geometry

If you see an unexplained **black line**, toggle **3D Border** once to see whether the outline is merely visual. **That alone does not prove the geometry is correct.** Check a Section crossing the same XY location, and inspect the layer structure with different 3D opacity/ROI. A genuine thin sheet, seam or buried void that persists without Border deserves investigation; do not hide it by changing outline color or visibility. Save an exported project with the exact History step and the relevant Mask state when reporting it.

**Why can a conformal shell look wider in Section?** Section **Auto** may exaggerate Z; compare **1:1**. A real sidewall coating also has a physical XY normal offset equal to its thickness.

**Why does isotropic/undercut release remove material laterally beyond an opening?** Lateral removal is the point of these profiles. Use **Directional Etch** for a vertical-only footprint. Confirm the sacrificial target material.

**Why do rough or pyramidal surfaces differ between Section and 3D?** These are deterministic **display morphologies**, sampled at different visual resolutions; adaptive 3D detail does not change the canonical ideal material stack. For closer inspection, adjust **Fast/Quality** and the 3D ROI.

**Why does Record annealing not grow oxide, or an Implant not create actual dopant diffusion?** Record stores chronology only, and Implant/Electrical are geometric annotations. WaferCAD does not calculate chemical, electrical or thermal evolution.

**Why is an implant hidden in opaque 3D?** It is an internal annotation. An ROI cut may expose its colored cut face; lower opacity can show the buried annotation volume without removing material.

## Recipe and saved-state safety

- **Recipe template selection** only previews replacement. Use **Load template** to apply; review the confirmation before **Replace Recipe**. An in-session Recipe Undo cannot replace a long-term backup.
- **Replay 1 → Step** means replay from Step 1 to the selected step, **not** resume from that step.
- **Stop** preserves process steps already committed. It is not a rollback.
- **Save/Recovery** stays in the current browser profile; **Export** is the portable archive. Browsing a clean History state does not itself create a Recovery checkpoint.
- If a process cannot be reproduced, retain the exported `.wafercad`, current active Mask source, any Mask ROI, the exact step name, and screenshots of Main **and** Section. These make a geometry report actionable.

For a complete safe beginner exercise, use [First 10 Minutes](First-10-Minutes). For advanced dependencies, use [Process and Recipes](Process-and-Recipes) and the [Recipe Code Tutorial](Recipe-Code-Tutorial).
