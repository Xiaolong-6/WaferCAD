import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { parseLayoutFile } from '../site/layout-io.js';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const valueAfter = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const root = path.resolve(valueAfter('--root', '_klayout/testdata'));
const reportPath = path.resolve(valueAfter('--report', 'klayout-compat.json'));
const scope = valueAfter('--scope', 'all');
const singleFile = valueAfter('--file');
const coreDirs = new Set(['gds', 'oasis', 'lstream']);

async function inspectFile(file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  try {
    const bytes = await readFile(file);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const imported = await parseLayoutFile(buffer, relative);
    const renderable = imported.layout.elements.length + imported.layout.linework.length;
    return {
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
  } catch (error) {
    return {
      path: relative,
      format: /\.(?:oas|oasis)$/i.test(relative) ? 'OASIS' : 'GDSII',
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

if (singleFile) {
  console.log(JSON.stringify(await inspectFile(path.resolve(singleFile))));
  process.exit(0);
}

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
for (const file of files) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--max-old-space-size=512', new URL(import.meta.url).pathname, '--root', root, '--file', file],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    results.push(JSON.parse(stdout.trim()));
  } catch (error) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const stderr = String(error.stderr || error.message || '').trim();
    results.push({
      path: relative,
      format: /\.(?:oas|oasis)$/i.test(relative) ? 'OASIS' : 'GDSII',
      status: error.killed ? 'timeout' : 'crash',
      error: stderr.slice(-1200) || 'isolated parser process failed',
    });
  }
}

const counts = Object.fromEntries(
  ['pass', 'empty', 'fail', 'timeout', 'crash'].map((status) => [
    status,
    results.filter((item) => item.status === status).length,
  ]),
);
const summary = {
  corpus: 'KLayout/klayout testdata',
  klayoutCommit: '5fa733e1680212e4ceda532ca5fa6ea707c654de',
  scope,
  total: results.length,
  ...counts,
};
await writeFile(reportPath, JSON.stringify({ summary, results }, null, 2) + '\n');

console.log(JSON.stringify(summary));
for (const result of results.filter((item) => !['pass', 'empty'].includes(item.status))) {
  console.log(`${result.status.toUpperCase()}\t${result.path}\t${result.error || ''}`);
}

if (counts.fail || counts.timeout || counts.crash) process.exitCode = 1;
