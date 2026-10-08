# Workspace and Views

[Home](Home) · [Masks and ROI](Masks-and-ROI)

## Primary views

![Actual fully textured tandem 3D preview from the Welcome catalog](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/fully-textured-perovskite-silicon-tandem-three.webp)

*Real saved example preview. Rough/Pyramid display morphology is visual metadata, so use Section and the scientific modeling limits when interpreting physical layer boundaries.*

![WaferCAD desktop Main view screenshot](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/tests/visual-baselines/windows-chromium/wide-main-panel.png)

*Real desktop UI visual baseline captured on 2026-10-05; inspect the running app for current control placement.*

- **Overview** shows Main, Mask, and 3D together for quick inspection.
- **Main** is a planar view of the Front/Back surface and provides A–B and 3D ROI editing.
- **Mask** shows either the imported layout (**File**) or local editable primitives (**Draw**). Mask opacity changes visualization, not physical coverage.
- **3D** shows extruded vector structure, rough/pyramid relief, material transparency and ROI cut faces. Switch Fast/Quality for mesh detail.
- **Split** gives side-by-side primary views.
- **Section A–B** below the main workspace shows the material stack sampled along the chosen A–B path.

## Toolbar states

Border, Pan and Detail use the shared selected color when enabled. The 3D Border label stays **Border**; its checkbox remains accessible to keyboard and screen-reader users. File/Draw, Fast/Quality and Auto/1:1 highlight the mode currently named on the button. Opacity and ROI controls highlight while their popover is open.

## Section geometry and Z exaggeration

**Auto** fits the XY length and Z height independently and reports Z scaling; **1:1** uses a common physical pixel scale. A film that appears wide in Auto may be thin in actual units. Section boundaries use the canonical geometry, while rough/pyramid surface relief is generated as a display field.

## 3D ROI versus Section A–B

Main ROI clips only the visible 3D inspection volume; it does not constrain Process. Section is evaluated along A–B. The ROI edge and A–B can cross different physical locations, so a 3D sidewall does not necessarily match the Section unless those paths are aligned.

## Visibility

Material opacity controls whether buried regions show through in 3D. Implant and Electrical Region overlays are annotations. A cut face can expose an otherwise buried implant, but that does not mean the original material was removed.

## Performance

Use **Fast** mode or a smaller Main ROI for large repeated arrays or fine rough features. Switching Quality changes only rendering detail, not material geometry, saved project dimensions, or the physical export.
