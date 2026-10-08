// Render the Wiki operation diagrams using the same SVG source as the Process panel.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROCESS_GUIDE } from '../site/process-guide.js';
import { processGuideSvg } from '../site/process-guide-svg.js';

export const PROCESS_WIKI_ASSET_DIR = join('docs', 'wiki', 'assets', 'process');

export function processWikiDiagramSvg(id) {
  const before = processGuideSvg(id, false).replace('<svg ', '<svg x="14" y="36" width="220" height="124" ');
  const after = processGuideSvg(id, true).replace('<svg ', '<svg x="266" y="36" width="220" height="124" ');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 174" role="img" aria-label="Process before and after">',
    '<rect width="500" height="174" rx="12" fill="#ffffff"/>',
    '<text x="124" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#45596b">BEFORE</text>',
    '<text x="376" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#45596b">AFTER</text>',
    '<path d="M243 93H258M253 87L259 93L253 99" stroke="#8398aa" stroke-width="2" fill="none"/>',
    before,
    after,
    '</svg>',
    '',
  ].join('\n');
}

async function main() {
  const mode = process.argv[2] || '--check';
  if (!['--check', '--write'].includes(mode))
    throw Error('Usage: node scripts/build-wiki-diagrams.mjs --check|--write');
  if (mode === '--write') await mkdir(PROCESS_WIKI_ASSET_DIR, { recursive: true });
  const expectedNames = new Set(PROCESS_GUIDE.map((entry) => entry.id + '.svg'));
  const existing = await readdir(PROCESS_WIKI_ASSET_DIR);
  const unexpected = existing.filter((name) => name.endsWith('.svg') && !expectedNames.has(name));
  if (unexpected.length) throw Error('Obsolete Process diagrams: ' + unexpected.join(', '));
  for (const entry of PROCESS_GUIDE) {
    const filename = join(PROCESS_WIKI_ASSET_DIR, entry.id + '.svg');
    const expected = processWikiDiagramSvg(entry.id);
    if (mode === '--write') await writeFile(filename, expected);
    else if ((await readFile(filename, 'utf8')) !== expected)
      throw Error(filename + ' is stale; run npm run docs:build and commit its result.');
  }
  console.log('Wiki diagrams ' + mode.slice(2) + ': ' + PROCESS_GUIDE.length + ' variants');
}

if (process.argv[1]?.endsWith('build-wiki-diagrams.mjs')) await main();
