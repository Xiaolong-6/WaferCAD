# Product manual and GitHub Wiki publishing

## Source of truth

- `docs/wiki/*.md`: complete product user manual (Welcome/Getting Started, views, mask, Process, the English/Chinese Recipe Code Tutorial, History, Variants, Recovery, I/O, examples, limits and troubleshooting).
- `site/bundled-examples.js`: canonical Welcome project catalog. Keep `docs/wiki/Examples-and-Modeling-Limits.md` aligned with every promoted example ID/title; do not count unpromoted development fixtures as Welcome examples.
- `site/process-guide.js`: canonical metadata for the 18 Process operation variants.
- `site/process-guide-svg.js`: the paired Before → After diagrams.
- `site/guide/index.html`: public interactive atlas served by GitHub Pages.
- `docs/wiki/Process-Operations.md`: **generated** by `npm run docs:build`. Do not edit it manually; edits will be overwritten.

To change an operation description, update the catalog and diagram, then run `npm run docs:build` and `npm run check`. Commit the catalog and regenerated reference together. The tests check every defined operation ID and the exact operation-document snapshot. The [documentation architecture](DOCUMENTATION.md) owns navigation, authority and authored-versus-generated boundaries.

## Deploy workflow

`.github/workflows/product-manual-wiki.yml` runs after **every push to main**, with no path filters, and can also be started manually. It:

1. Checks that generated Process docs match runtime data, validates repository internal links/documentation reachability, and runs the guide, Wiki catalog/tutorial and documentation regression tests.
2. Compares user-facing code changes with changes to the manual and emits a visible Action warning if docs review may be missing. This heuristic cannot determine scientific correctness.
3. Clones the **GitHub Wiki** Git repository, compares every managed Markdown page to the tracked source, and pushes a commit only if there is an actual change.
4. Removes obsolete pages only when recorded as previously managed by the automation, leaving unmanaged Wiki pages intact.
5. Fails visibly if the Wiki is unavailable or authentication/push fails. No silent skip means a green sync job really inspected the remote Wiki.

`site/` is separately deployed through the existing Pages workflow when site assets change. The wiki is not updated from a feature branch: merge to main first.

## GitHub prerequisites (one-time setup)

1. In repository **Settings → Features**, ensure **Wikis** is enabled.
2. Create the Wiki's first **Home** page in the GitHub UI, initializing `WaferCAD.wiki.git`.
3. The sync job tries GitHub Actions' scoped token by default. If GitHub does not grant it write access to `.wiki.git`, create a repository Actions secret named `WIKI_PUSH_TOKEN` whose credential can write this Wiki. Use a dedicated account/token with the minimum permissions compatible with your Wiki setup. Never store tokens in the codebase.

The workflow reports actionable error details when this setup is missing. GitHub Wiki is a separately hosted Git repository: a GitHub Pages deploy does not automatically initialize it.

## Verification

- `npm run docs:check`
- `node --test site/tests/process-guide.test.mjs site/tests/wiki-manual.test.mjs site/tests/documentation.test.mjs`
- Push/merge to `main`, inspect **Product manual and Wiki sync** in Actions. The log should say either **already up to date** or **Published updated product manual**.
- Recheck `https://github.com/Xiaolong-6/WaferCAD/wiki` and the public `/WaferCAD/guide/` atlas.

The Wiki pages are versioned product documentation; older dated audits/handoffs are historical evidence. Do not silently promote illustrative photodetector reconstruction dimensions to sourced experimental facts.
