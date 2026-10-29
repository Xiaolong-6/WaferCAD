# Product manual and GitHub Wiki publishing

## Source of truth

- `docs/wiki/*.md`: complete product user manual (Welcome/Getting Started, views, mask, Process, the English Recipe Code Tutorial and AI-assisted workflows guide, History, Variants, Recovery, I/O, examples, limits and troubleshooting).
- `site/bundled-examples.js`: canonical Welcome project catalog. Keep `docs/wiki/Examples-and-Modeling-Limits.md` aligned with every promoted example ID/title; do not count unpromoted development fixtures as Welcome examples.
- `site/process-guide.js`: canonical metadata for the 20 Process operation variants.
- `site/process-guide-svg.js`: the paired Before → After diagrams.
- `docs/wiki/assets/process/*.svg`: generated, version-controlled Before → After diagrams embedded directly in the Process wiki chapter.
- `site/guide/index.html`: compatibility redirect only; old fragment bookmarks resolve into Wiki headings.
- `docs/wiki/Process-Operations.md`: **generated** by `npm run docs:build`. Do not edit it manually; edits will be overwritten.
- All actively maintained product documentation is in **English**. Legacy localized URLs may be retained as short English pointers so existing links still resolve.

To change an operation description, update the catalog and diagram, then run `npm run docs:build` and `npm run docs:check`. Commit the catalog, regenerated Markdown and any changed SVG assets together. `docs:check` checks images byte-for-byte against the in-app renderer. The tests check every defined operation ID and the exact operation-document snapshot. The [documentation architecture](DOCUMENTATION.md) owns navigation, authority and authored-versus-generated boundaries.

GitHub Wiki copies each `docs/wiki/*.md` page to the Wiki root. Link between pages by Wiki slug (for example `(Getting-Started)`); use an absolute `https://github.com/.../blob/main/docs/...` link when pointing to repository documents outside the Wiki. A `../io/` or other repository-relative Markdown link can work inside the source checkout but break after publication.

## Figure and screenshot policy

Wiki illustrations must be **relevant to the adjacent procedure**. Prefer exact, shipped WaferCAD example screenshots tied to the named example, or Before → After SVGs generated from the same `site/process-guide.js` catalog as the Process UI. When explaining ROI selection, workflows or History rather than a particular screen state, use a narrowly scoped Mermaid flowchart instead of unrelated imagery. Do not add stock, random microscopy, speculative AI renderings or publication figures without provenance and rights. Every manually inserted image needs descriptive alt text, an immediate caption identifying **actual app output / saved capture / conceptual guide schematic**, and a limitation where warranted. A green link check proves only that the asset path exists. Before adding any raster screenshot, inspect the **actual image content**, native dimensions, text/geometry legibility at the intended display width, correctness of the depicted UI version, and relevance to the adjacent task. Old 480 × 300 blurred `docs/archive/example-previews/` JPEGs and catalog-sized 3D covers are **not** instructional screenshots. Prefer a precisely matched Process SVG or Mermaid diagram when no readable current capture exists. Older UI captures belong in dated audit records; never label one as the current workstation. See the [content/pixel audit](archive/WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md).

See [Wiki content and visual audit](archive/WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) for the page-level inventory and decisions.

## Native UI screenshot promotion gate

Use screenshot evidence **from the actual product**, not mock HTML,
generated shell-only previews or hand-drawn copies of interface controls.
The first choice is a real Chromium/Playwright capture from an exact-SHA
source checkout and valid normal Origin. A pre-existing GitHub Actions
capture for that exact main SHA may be **reused** for a documentation
review without running CI again. Its artifact, run ID, filename, test
model and viewport must be recorded, and the pixels independently
inspected before any crop is promoted.

For each screenshot inserted into a current Wiki page:

1. Check the depicted **product revision**, exact named Example,
   active History Step/Variant, selected views, ROI, Z scaling and
   opacity/Border mode. Confirm all relevant UI labels are actually
   visible and legible at the Wiki's display width.
2. Verify whether the captured state is **preview** or exact painted
   scene. A real screenshot of an early approximate 3D frame is
   insufficient to illustrate exact 3D, export, Section/3D agreement or
   paper-figure fidelity.
3. Save the reviewed screenshot as a **version-controlled image**
   under `docs/wiki/assets/` (or use an already version-controlled,
   accurately labeled first-party image). Embed via a stable repository
   `main` raw URL. Do **not** embed ephemeral Actions artifact URLs,
   `sandbox:` links, issue attachments, personal storage, or local
   filesystem paths in published Wiki Markdown.
4. Supply adjacent, specific alt text and a caption stating which
   view, Example, Step, source SHA and important display limitation
   the image illustrates. A screenshot of a real photodetector or
   metalens is **not** the resulting image of the beginner
   oxide-window exercise.
5. Compare the rendered Wiki page (desktop and narrow screens) after
   the image reaches `main`. Keep separate approved visual regression
   baselines untouched; documentation figures are not a substitute
   for tests or release acceptance.

**Current capture priorities:** desktop four-view Overview, compact
Edit/View navigation, the real Draw Mask/Mask ROI editor, Main 3D ROI,
Section Z Break, 3D Display (opacity, Z scale, Show Origin, Border),
the actual beginner Deposit/Etch stages, and History
Step 0/Edit/Variant/Recovery. A screenshot only covering one of these
must not be captioned as proof of the other controls. Where no
matching checked-in capture exists, prefer the already verified
Process Guide SVG or a purpose-specific Mermaid diagram until a
real image is ready.

## Pre-publication PR verification

Documentation changes are checked locally through `node scripts/local-verification.mjs run draft` (or a current `full` receipt), including the focused documentation contracts. The [Documentation and Wiki targeted checks](../.github/workflows/documentation-wiki-targeted.yml) workflow is **manual-dispatch only** under the 2026-10-22 CI policy; it has read-only repository permissions and cannot publish Wiki or Pages. Automatic Draft `Quality` verifies exact-source-bound local evidence **without rerunning lint, formatting, or `docs:check` remotely**. Ready and Main release use their separately governed gates; see [CI routing](CI.md).

## Deploy workflow

`.github/workflows/product-manual-wiki.yml` runs after **every push to main**, with no path filters, and can also be started manually. It:

1. Checks that generated Process docs match runtime data, validates repository internal links/documentation reachability, and runs the guide, Wiki catalog/tutorial and documentation regression tests.
2. Compares user-facing code changes with changes to the manual and emits a visible Action warning if docs review may be missing. This heuristic cannot determine scientific correctness.
3. Checks Markdown image links against repository files, then clones the **GitHub Wiki** Git repository, compares every managed Markdown page to the tracked source, and pushes a commit only if there is an actual change. Images resolve from this repository's `main` via `raw.githubusercontent.com` and are not redundantly copied to `.wiki.git`.
4. Removes obsolete pages only when recorded as previously managed by the automation, leaving unmanaged Wiki pages intact.
5. Fails visibly if the Wiki is unavailable or authentication/push fails. No silent skip means a green sync job really inspected the remote Wiki.

`site/` is separately deployed through the existing Pages workflow when site assets change. The wiki is not updated from a feature branch: merge to main first.

The change-coverage warning includes the production v2 Workstation shell, desktop docking, compact navigation and selected public controllers as well as the older source owners. It is **heuristic only**: a matching Wiki edit suppresses the warning, and a silent result cannot prove that screenshots, navigation instructions or scientific descriptions still match the implementation. Review those against the current production UI before acceptance.

## GitHub prerequisites (one-time setup)

1. In repository **Settings → Features**, ensure **Wikis** is enabled.
2. Create the Wiki's first **Home** page in the GitHub UI, initializing `WaferCAD.wiki.git`.
3. The sync job tries GitHub Actions' scoped token by default. If GitHub does not grant it write access to `.wiki.git`, create a repository Actions secret named `WIKI_PUSH_TOKEN` whose credential can write this Wiki. Use a dedicated account/token with the minimum permissions compatible with your Wiki setup. Never store tokens in the codebase.

The workflow reports actionable error details when this setup is missing. GitHub Wiki is a separately hosted Git repository: a GitHub Pages deploy does not automatically initialize it.

## Verification

- `npm run docs:check`
- `node --test site/tests/documentation-suite.test.mjs`
- Push/merge to `main`, inspect **Product manual and Wiki sync** in Actions. The log should say either **already up to date** or **Published updated product manual**.
- Recheck `https://github.com/Xiaolong-6/WaferCAD/wiki/Process-Operations` and that at least one image from `docs/wiki/assets/process/` renders. The old `/WaferCAD/guide/#operation-id` route should redirect to the matching Wiki operation.

The Wiki pages are versioned product documentation; older dated audits/handoffs are historical evidence. Do not silently promote illustrative photodetector reconstruction dimensions to sourced experimental facts.
