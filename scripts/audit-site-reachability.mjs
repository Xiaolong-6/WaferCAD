import { readdir, readFile } from 'node:fs/promises';
import { extname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const textExtensions = new Set(['.js', '.mjs', '.html', '.css']);
const sourceExtensions = new Set(['.js', '.mjs', '.css']);
const productEntries = ['index.html', 'app.html', 'app-legacy.html', 'guide/index.html'];
const devEntries = new Set([
  'app-v2.html',
  'app-v2-main.html',
  'app-v2-mask.html',
  'app-v2-real.html',
  'ui-v2/app.html',
  'ui-v2/gallery.html',
]);
const devPrefixes = ['tests/', 'ui-v2/prototypes/', 'ui-v2/reviews/'];

async function listFiles(root) {
  const found = [];
  const walk = async (relativePath) => {
    for (const entry of await readdir(join(root, relativePath), { withFileTypes: true })) {
      const name = posix.join(relativePath, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) found.push(name);
    }
  };
  await walk('.');
  return found.sort();
}

function isDevelopment(path) {
  return devEntries.has(path) || devPrefixes.some((prefix) => path.startsWith(prefix));
}

export function resolveReference(from, reference, inventory) {
  if (!reference) return null;
  if (reference.includes(String.fromCharCode(36, 123))) return null;
  if (/^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(reference)) return null;
  const clean = reference.split(/[?#]/)[0].trim();
  if (!clean || clean.includes('\\') || /%[0-9a-f]{2}/i.test(clean)) return null;
  const path = clean.startsWith('/') ? clean.slice(1) : posix.join(posix.dirname(from), clean);
  const target = posix.normalize(path);
  if (!target || target === '.' || target === '..' || target.startsWith('../')) return null;
  if (inventory.has(target)) return target;
  if (inventory.has(target + '/index.html')) return target + '/index.html';
  return null;
}

export function extractLiteralReferences(source, extension) {
  const results = new Set();
  if (extension === '.html') {
    const htmlAttribute = /\b(?:src|href|poster|data-preview-src)\s*=\s*["']([^"']+)["']/gi;
    const references = source.matchAll(htmlAttribute);
    for (const match of references) results.add(match[1]);
  }
  if (extension === '.css' || extension === '.html') {
    const urls = source.matchAll(/url\(\s*["']?([^'"\s)]+)["']?\s*\)/gi);
    const imports = source.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi);
    for (const match of urls) results.add(match[1]);
    for (const match of imports) results.add(match[1]);
  }
  if (extension === '.js' || extension === '.mjs' || extension === '.html') {
    // A conservative approximation for static imports, workers, fetches and literal paths.
    const paths = source.matchAll(/["'\x60]((?:\.{1,2}\/|\/)[^"'\x60\n]{1,350})["'\x60]/g);
    for (const match of paths) results.add(match[1]);
    // An inline bootstrap can append a version-only suffix without changing the asset path.
    const versionedPattern = /\x60((?:\.{1,2}\/|\/)[^\x60\r\n$]{1,300}\.(?:js|css))\$\{suffix\}\x60/g;
    const versioned = source.matchAll(versionedPattern);
    for (const match of versioned) results.add(match[1]);
  }
  return [...results];
}

function reachableFrom(roots, edges) {
  const seen = new Set();
  const pending = [...roots];
  while (pending.length) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) || []) {
      if (!seen.has(next)) pending.push(next);
    }
  }
  return seen;
}

export async function auditSiteReachability(root = resolve('site')) {
  const inventory = new Set(await listFiles(root));
  const edges = new Map();
  for (const file of inventory) {
    const extension = extname(file);
    if (!textExtensions.has(extension)) continue;
    const content = await readFile(join(root, file), 'utf8');
    const targets = extractLiteralReferences(content, extension)
      .map((ref) => resolveReference(file, ref, inventory))
      .filter(Boolean);
    edges.set(file, new Set(targets));
  }
  const productionRoots = productEntries.filter((file) => inventory.has(file));
  const developerRoots = [...inventory].filter(
    (file) => isDevelopment(file) && textExtensions.has(extname(file)),
  );
  const production = reachableFrom(productionRoots, edges);
  const developer = reachableFrom(developerRoots, edges);
  const candidates = [...inventory].filter(
    (file) =>
      sourceExtensions.has(extname(file)) && !isDevelopment(file) && !file.startsWith('vendor/'),
  );
  const onlyDeveloper = (file) => !production.has(file) && developer.has(file);
  const isUnproven = (file) => !production.has(file) && !developer.has(file);
  const developerOnly = candidates.filter(onlyDeveloper);
  const unproven = candidates.filter(isUnproven);
  return {
    scannedFiles: inventory.size,
    productionRoots,
    productionReachable: production.size,
    developerReachable: developer.size,
    developerOnly,
    unproven,
    limitations: [
      'Static file-level evidence does not establish function- or export-level dead code.',
      'Computed URLs, implicit globals and dynamically constructed module paths can be missed.',
      'Unproven paths require manual review and are never automatically deleted.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditSiteReachability(resolve(process.argv[2] || 'site'));
  console.log(JSON.stringify(report, null, 2));
}
