import { readFile, readdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

const commit = String(process.argv[2] || '').trim();
if (!/^[0-9a-f]{7,64}$/i.test(commit)) {
  throw new Error('Usage: node scripts/stamp-pages-assets.mjs <commit>');
}

const files = (await readdir('site', { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => `site/${entry.name}`);
const suffix = `?v=${commit}`;

for (const filename of files) {
  const source = await readFile(filename, 'utf8');
  const stamped = source.replace(
    /(from\s+['"])(\.\.?\/[^'"?]+\.js)(['"])/g,
    (_, prefix, specifier, quote) => `${prefix}${specifier}${suffix}${quote}`,
  );
  await writeFile(filename, stamped);
}
