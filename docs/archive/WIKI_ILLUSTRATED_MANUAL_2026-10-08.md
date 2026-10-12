# Illustrated Wiki consolidation — 2026-10-08

## Scope and branch

- Repository: `Xiaolong-6/WaferCAD`.
- Branch: `docs/wiki-illustrated-manual`, based on main `bad705c406ebb57a84f3a0ac66340b63e92bcf0c`.
- This is **branch-only** work. No merge into main, Wiki synchronization, or Pages deployment is claimed by this document.

## Single-source operation diagrams

- `site/process-guide.js`: the 18 canonical operation descriptions and IDs remain the authority.
- `site/process-guide-svg.js`: the in-app Before/After shape generator remains unchanged.
- `scripts/build-wiki-diagrams.mjs`: composes this exact renderer's two SVGs into each tracked `docs/wiki/assets/process/<id>.svg`.
- `scripts/build-process-guide.mjs`: generates `docs/wiki/Process-Operations.md` with an embedded figure per operation and runs the diagram generation/check in the existing `npm run docs:build` / `npm run docs:check` commands. No `package.json` change is required.
- Images link to versioned `main`-branch `raw.githubusercontent.com` assets from the GitHub Wiki. The Wiki sync job copies only Markdown as before; the image files remain in the app repository and are checked by the docs gate.

## Illustrated onboarding and shipped examples

- Home, Getting Started, Workspace, Mask, Process, History/Recovery, I/O, Troubleshooting and both Recipe tutorials have added visual examples or Mermaid flows.
- The six Welcome example families use their real `site/examples/thumbnails/*-three.webp` assets. These are example-preview images, not proof of a freshly rerun full process.
- The Wiki retains provenance and distinctions between physical Kernel geometry, display-only rough/pyramid morphology, and annotation/history-only operations.

## Navigation migration

- Process panel `Guide ↗` navigates directly to the corresponding `https://github.com/Xiaolong-6/WaferCAD/wiki/Process-Operations#<id>` anchor.
- `site/guide/index.html` stays as a lightweight backward-compatible redirect for old `/guide/#<id>` links; the separate atlas UI and maintenance logic are removed.
- README, docs map, documentation architecture, Wiki home/sidebar and usage describe a single illustrated product manual.

## Source-level verification performed on this branch

- The generated Process Markdown was compared directly against the catalog generator: exact match (18 operation descriptions and 18 sanitized SVG references).
- Each of the 18 tracked SVG assets was compared byte-for-byte against `processWikiDiagramSvg(id)`: **18/18 match**.
- A tree-aware link audit inspected all 13 Wiki Markdown files: 33 embedded images and 2 Mermaid diagrams before UI screenshots were added; no missing raw-asset paths or stale standalone-atlas links were found. The four approved UI screenshots added here are tracked in `tests/visual-baselines/windows-chromium/`.
- The six Welcome `*-three.webp` preview files were confirmed present.
- These are source-level checks executed through the GitHub connector. The local Node/Prettier/ESLint suite and published GitHub Wiki browser rendering have **not** been executed or validated in this session.

## Acceptance and limitations

Checks intended for the implementation revision:

1. `npm run docs:check` — generated Markdown, 18 SVG snapshots, links and documentation navigation.
2. `node --test site/tests/process-guide.test.mjs site/tests/wiki-manual.test.mjs site/tests/documentation.test.mjs`.
3. `npm run format:check` and `npm run lint`, correcting formatting issues only.
4. Browser: change several Process Action/Coverage/Profile combinations and verify both inline figure and deep-linked Wiki anchor, plus an old Guide fragment redirect.
5. **After main merge only:** verify Wiki synchronization and on-page images (including SVG/WebP rendering) using an actual browser, at narrow and desktop widths. The source revision alone cannot prove hosted Wiki rendering.
6. Full 625-site/M3D Kernel replay is not required for documentation-only image migration; the current pre-existing scientific acceptance remains revision-specific.

Do not claim any command or hosted-browser check passed unless its output has actually been observed. If GitHub Wiki SVG/WebP rendering proves unsupported, migrate those particular published figures to PNG/JPEG while retaining the SVG drawing engine as canonical.
