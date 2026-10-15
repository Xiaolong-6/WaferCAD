// Inventory live Legacy test owners and the experimental D1 bridge before deletion.
// An occurrence is evidence of a dependency, not proof that it is safe to remove.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scanRoots = ['scripts', 'site/tests', 'site/ui-v2'];
const legacyHelper = /\bnewLegacyUi(?:Context|Page)\b/;
const legacyEditor = /(?:app-legacy\.html|\bworkstation\.css\b)/;
const oldD1Bridge = /(?:real-view-bridge\.(?:js|css)|app-v2-real\.html)/;

async function listSources(root, directory) {
  const entries = [];
  const walk = async (path) => {
    for (const item of await readdir(join(root, path), { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isDirectory()) await walk(child);
      else if (item.isFile() && /\.(?:mjs|js|html)$/.test(item.name)) entries.push(child);
    }
  };
  await walk(directory);
  return entries;
}

export function classifyLegacyOwner(path, content) {
  const testOwner = path.startsWith('scripts/') || path.startsWith('site/tests/');
  const helpers = legacyHelper.test(content);
  const editor = legacyEditor.test(content);
  const bridge = oldD1Bridge.test(content);
  return { path, testOwner, helpers, editor, bridge, requiresReview: helpers || editor || bridge };
}

export async function auditLegacyRetirementOwners(root = resolve('.')) {
  const paths = [
    'site/app-v2-real.html',
    ...(await Promise.all(scanRoots.map((dir) => listSources(root, dir)))).flat(),
  ]
    .filter(
      (path) =>
        !path.endsWith('legacy-retirement-owner-audit.mjs') &&
        !path.endsWith('legacy-retirement-owner-audit.test.mjs'),
    )
    .sort();
  const owners = [];
  for (const path of paths) {
    const portable = relative(root, resolve(root, path)).split(sep).join('/');
    const content = await readFile(join(root, path), 'utf8');
    const classification = classifyLegacyOwner(portable, content);
    if (classification.requiresReview) owners.push(classification);
  }
  return {
    version: 1,
    owners,
    counts: {
      files: owners.length,
      tests: owners.filter((owner) => owner.testOwner).length,
      helpers: owners.filter((owner) => owner.helpers).length,
      editor: owners.filter((owner) => owner.editor).length,
      bridge: owners.filter((owner) => owner.bridge).length,
    },
    warnings: [
      'This is a source reference inventory, not a validated test-equivalence matrix.',
      'Dynamic imports, generated URLs and science scenarios without literal references require separate review.',
      'Retire each owner only after a production-v2 or canonical scientific assertion has equivalent evidence.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await auditLegacyRetirementOwners(), null, 2));
}
