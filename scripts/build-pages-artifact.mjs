import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Developer fixtures are versioned in Git but are not part of the public application.
const excludedDirectories = ['tests/', 'ui-v2/prototypes/', 'ui-v2/reviews/', 'experimental/microdisk/'];
const excludedFiles = new Set([
  // Archived Legacy source must never be republished as executable UI.
  'app-legacy.html',
  'app.js',
  'workstation.css',
  // Experimental science oracles belong to tests/preview, not the shipped v2 bundle.
  'isotropic-release-topology.js',
  'experimental/physical-facets/physical-facet-coating.js',
  'experimental/physical-facets/physical-facet-coating-section.js',
  // Retired browser-only modules retained in Git, not imported by the v2 product.
  'workstation-ui.js',
  'controllers/build-controller.js',
  'controllers/startup-controller.js',
  'controllers/view-popover-controller.js',
  'app-v2.html',
  'app-v2-main.html',
  'app-v2-mask.html',
  'app-v2-real.html',
  'ui-v2/app.html',
  'ui-v2/gallery.html',
  'ui-v2/history-tree.js',
  'ui-v2/mock-data.js',
  'ui-v2/mock-domain-panels.js',
  'ui-v2/mock-views.js',
  'ui-v2/mock-workspace.js',
  'ui-v2/production-workspace.js',
  'ui-v2/live-preview.js',
  'ui-v2/shell-preview.js',
  'ui-v2/real-view-bridge.js',
  'ui-v2/real-view-bridge.css',
  'ui-v2/real-section-controls.js',
]);

export function shouldPublishSitePath(siteRelativePath) {
  const path = String(siteRelativePath).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!path || path === '.') return true;
  if (path.startsWith('/') || path.split('/').includes('..')) return false;
  return (
    !excludedFiles.has(path) &&
    !excludedDirectories.some((dir) => path === dir.slice(0, -1) || path.startsWith(dir))
  );
}

export async function stagePagesAssets({
  source = resolve('site'),
  destination = resolve('build/pages'),
} = {}) {
  const sourceRoot = resolve(source);
  const destinationRoot = resolve(destination);
  const nested = relative(sourceRoot, destinationRoot);
  if (!nested || (!nested.startsWith('..' + sep) && nested !== '..' && !isAbsolute(nested))) {
    throw new Error('Pages output must be outside the site source directory.');
  }

  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(dirname(destinationRoot), { recursive: true });
  await cp(sourceRoot, destinationRoot, {
    recursive: true,
    filter: (path) => shouldPublishSitePath(relative(sourceRoot, path)),
  });
  // Keep historical bookmarks working without shipping an executable Legacy UI.
  // Preserve the same-origin query string for old Example/Open links, but never
  // instantiate the old editor or touch saved Workspace/Recovery data here.
  await writeFile(
    join(destinationRoot, 'app-legacy.html'),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WaferCAD — Workspace moved</title>
  <script>location.replace('./app.html' + location.search + location.hash);</script>
</head>
<body><p>WaferCAD has moved to the <a href="./app.html">current workstation</a>.</p></body>
</html>
`,
  );
  return destinationRoot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = await stagePagesAssets();
  console.log(`Staged public Pages assets in ${destination}`);
}
