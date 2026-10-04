import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const commit = String(process.argv[2] || '').trim();
if (!/^[0-9a-f]{7,64}$/i.test(commit)) {
  throw new Error('Usage: node scripts/stamp-pages-assets.mjs <commit>');
}

async function javascriptFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await javascriptFiles(filename)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(filename);
    }
  }
  return files;
}

const files = await javascriptFiles('site');
const suffix = `?v=${commit}`;

for (const filename of files) {
  const source = await readFile(filename, 'utf8');
  const stamped = source.replace(
    /(from\s+['"])(\.\.?\/[^'"?]+\.js)(['"])/g,
    (_, prefix, specifier, quote) => `${prefix}${specifier}${suffix}${quote}`,
  );
  await writeFile(filename, stamped);
}
