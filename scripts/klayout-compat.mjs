import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseLayoutFile } from '../site/layout-io.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const root = path.resolve(args.get('--root') || '_klayout/testdata');
const reportPath = path.resolve(args.get('--report') || 'klayout-compat.json');
const scope = args.get('--scope') || 'all';
const coreDirs = new Set(['gds', 'oasis', 'lstream']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(?:gds|gdsii|oas|oasis)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const allFiles = (await walk(root)).sort();
const files =
  scope === 'core'
    ? allFiles.filter((file) => coreDirs.has(path.relative(root, file).split(path.sep)[0]))
    : allFiles;

const results = [];
let passed = 0;
let failed = 0;
let empty = 0;

for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  try {
    const bytes = await readFile(file);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const imported = await parseLayoutFile(buffer, relative);
    const renderable = imported.layout.elements.length + imported.layout.linework.length;
    const result = {
      path: relative,
      format: imported.format,
      status: renderable ? 'pass' : 'empty',
      cells: imported.parsed.cells.size,
      roots: imported.parsed.roots?.length || 0,
      elements: imported.layout.elements.length,
      linework: imported.layout.linework.length,
      layers: imported.layout.combos.length,
      bounds: imported.layout.bounds,
    };
    results.push(result);
    if (renderable) passed++;
    else empty++;
  } catch (error) {
    failed++;
    results.push({
      path: relative,
      format: /\.(?:oas|oasis)$/i.test(relative) ? 'OASIS' : 'GDSII',
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const summary = {
  corpus: 'KLayout/klayout testdata',
  scope,
  total: results.length,
  passed,
  empty,
  failed,
};
await writeFile(reportPath, JSON.stringify({ summary, results }, null, 2) + '\n');

console.log(JSON.stringify(summary));
for (const result of results.filter((item) => item.status !== 'pass')) {
  console.log(`${result.status.toUpperCase()}\t${result.path}\t${result.error || 'no renderable geometry'}`);
}

if (failed) process.exitCode = 1;
