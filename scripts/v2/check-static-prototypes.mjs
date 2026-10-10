// Lightweight file/link/syntax check + native Chrome DOM load. No Playwright or screenshots.
import { readFile, access, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Script } from 'node:vm';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
const run = promisify(execFile);
const root = resolve('site/ui-v2/prototypes');
const files = process.argv.includes('--round2')
  ? ['index.html', 'a-full/index.html', 'a-full/fonts.html']
  : [
      'index.html',
      ...['a', 'b', 'c'].flatMap((l) =>
        ['process', 'recipe', 'history'].map((s) => `${l}-${s}.html`),
      ),
      'a-full/index.html',
      'a-full/fonts.html',
    ];
const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const results = [];
for (const file of files) {
  const path = join(root, file),
    html = await readFile(path, 'utf8');
  const child = html.match(/srcdoc="([\s\S]*?)"/);
  const documents = [html, ...(child ? [decode(child[1])] : [])];
  for (const document of documents) {
    for (const [, script] of document.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script);
    for (const [, url] of document.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (url.startsWith('data:') || url.startsWith('#')) continue;
      await access(fileURLToPath(new URL(decode(url), pathToFileURL(path))));
    }
    for (const [, url] of document.matchAll(/url\(['"]?(\.\/[^)'"\s]+)['"]?\)/g))
      await access(fileURLToPath(new URL(url, pathToFileURL(path))));
  }
  results.push({ file, links: 'valid', syntax: 'valid' });
}
const chrome =
  process.env.WAFERCAD_REVIEW_CHROME ||
  'C:/Users/liux16/AppData/Local/Google/Chrome/Application/chrome.exe';
const profileRoot = await mkdtemp(join(tmpdir(), 'wafercad-m15-static-'));
for (let offset = 0; offset < files.length; offset += 3) {
  await Promise.all(
    files.slice(offset, offset + 3).map(async (file, index) => {
      const { stdout, stderr } = await run(
        chrome,
        [
          '--headless=new',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${join(profileRoot, String(offset + index))}`,
          '--disable-background-networking',
          '--disable-extensions',
          '--enable-logging=stderr',
          '--virtual-time-budget=1200',
          '--dump-dom',
          pathToFileURL(join(root, file)).href,
        ],
        { windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 },
      );
      const ready =
        file === 'index.html' || file === 'a-full/fonts.html' || /data-ready="true"/.test(stdout);
      const error =
        /data-errors="[1-9]/.test(stdout) ||
        /CONSOLE.*(?:Uncaught|[Ee]rror|Failed|blocked)/.test(stderr);
      if (!ready || error) throw new Error(`${file}: load=${ready}, pageError=${error}`);
      const row = results.find((r) => r.file === file);
      row.load = 'ready';
      row.pageErrors = 0;
    }),
  );
}
console.log(
  JSON.stringify(
    { pages: results.length, results, playwright: false, screenshots: false, profileRoot },
    null,
    2,
  ),
);
