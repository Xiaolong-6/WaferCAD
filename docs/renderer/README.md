# Renderer engineering

The canonical **current implementation contract** is
[Renderer, Section and capture](RENDERER_CONTRACT.md). It documents
material ownership, progressive preview/exact handoff,
Section consistency, rough LOD, transparency/Border, ROI and
physical GLB versus WYSIWYG PNG. [Architecture](../ARCHITECTURE.md)
is the cross-module map.

## Current contracts and open work

- [Renderer, Section and capture](RENDERER_CONTRACT.md) — present behavior and safety boundaries.
- [3D Border Inspector](BORDER_INSPECTOR.md) — shared visible contour ownership.
- Capture transaction and resource-retirement rules are in the [current Renderer contract](RENDERER_CONTRACT.md); the [original v3/v4 correctness backport](../archive/renderer/RENDERER_LIFECYCLE_CORRECTNESS_2026-10-12.md) preserves dated implementation and hardware diagnostics.
- [Transparency and LOD roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) — **open performance debt**, not current latency certification.

## Historical evidence at its recorded revision

- [PR #250 renderer audit](../archive/renderer/PR250_RENDERER_AUDIT_2026-10-15.md).
- [PR #250 acceptance and GPU diagnostics](../archive/renderer/PR250_RENDERER_ACCEPTANCE_2026-10-15.md).
- [Foreground-first PR #186 checkpoint](FOREGROUND_RENDERING_P0_2026-10-12.md) — merged on 2026-10-13; this file remains discoverable at its old path because the **manual-only historical workflow** still references it. Its Draft instructions are not current merge requirements. Outstanding interaction/LOD work belongs to the [transparency roadmap](RENDERER_TRANSPARENCY_ROADMAP.md).
- [Rough boundary investigation](../archive/renderer/THREE_ROUGH_BOUNDARY_AUDIT_2026-10-15.md).
- [Outline/depth investigation](../archive/renderer/THREE_OUTLINE_DEPTH_AUDIT_2026-10-15.md).

Scientific correctness is independently owned by
[scientific contracts](../science/README.md); browser and GPU gates remain
governed by [testing](../testing.md). Merged PRs
[#353](https://github.com/Xiaolong-6/WaferCAD/pull/353),
[#359](https://github.com/Xiaolong-6/WaferCAD/pull/359),
[#365](https://github.com/Xiaolong-6/WaferCAD/pull/365),
[#367](https://github.com/Xiaolong-6/WaferCAD/pull/367)
and [#368](https://github.com/Xiaolong-6/WaferCAD/pull/368)
are source history, not independent approval of current screenshots.
