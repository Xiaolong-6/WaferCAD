import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROCESS_GUIDE } from '../site/process-guide.js';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const posix = (path) => path.replaceAll('\\', '/');
const withoutFences = (text) => {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      if (fence) {
        if (new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$').test(line))
          fence = null;
        return '';
      }
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opening) {
        fence = { char: opening[1][0], length: opening[1].length };
        return '';
      }
      return line;
    })
    .join('\n');
};

export function headingAnchors(text) {
  const prose = withoutFences(text),
    anchors = new Set(),
    counts = new Map();
  for (const match of prose.matchAll(/<a\s+[^>]*?(?:id|name)=["']([^"']+)["']/g))
    anchors.add(match[1]);
  for (const match of prose.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[`*]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/ /g, '-');
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    anchors.add(slug + (count ? '-' + count : ''));
  }
  return anchors;
}

export function markdownDestinations(text) {
  const prose = withoutFences(text).replace(/`+[^`\n]*`+/g, '');
  return [
    ...prose.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)/g),
    ...prose.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s+(<[^>]+>|\S+)/gm),
    ...prose.matchAll(/(?:href|src)=["']([^"']+)["']/g),
  ].map((match) => match[1].replace(/^<|>$/g, ''));
}

function internalTarget(source, destination) {
  const url = new URL(destination, 'https://repository.invalid/' + source);
  if (url.hostname === 'repository.invalid') {
    let path = decodeURIComponent(url.pathname).slice(1);
    if (source.startsWith('docs/wiki/') && !extname(path)) path += '.md';
    return { path, fragment: decodeURIComponent(url.hash.slice(1)) };
  }
  const repo = '/Xiaolong-6/WaferCAD/';
  if (url.hostname === 'github.com') {
    if (url.pathname === repo + 'wiki' || url.pathname.startsWith(repo + 'wiki/'))
      return {
        path:
          'docs/wiki/' +
          (decodeURIComponent(url.pathname.slice((repo + 'wiki/').length)) || 'Home') +
          '.md',
        fragment: decodeURIComponent(url.hash.slice(1)),
      };
    for (const mode of ['blob/main/', 'tree/main/'])
      if (url.pathname.startsWith(repo + mode))
        return {
          path: decodeURIComponent(url.pathname.slice((repo + mode).length)),
          fragment: decodeURIComponent(url.hash.slice(1)),
        };
  }
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith(repo + 'main/'))
    return {
      path: decodeURIComponent(url.pathname.slice((repo + 'main/').length)),
      fragment: decodeURIComponent(url.hash.slice(1)),
    };
  if (url.hostname === 'xiaolong-6.github.io' && url.pathname.startsWith('/WaferCAD/')) {
    const suffix = decodeURIComponent(url.pathname.slice('/WaferCAD/'.length));
    return {
      path: 'site/' + suffix,
      operation: suffix === 'guide/' ? decodeURIComponent(url.hash.slice(1)) : '',
      example: url.searchParams.get('example'),
    };
  }
  return null;
}

export async function auditDocumentation({ rootDir = repositoryRoot, files } = {}) {
  const paths =
    files ||
    execFileSync(
      'git',
      [
        '-c',
        'safe.directory=' + posix(rootDir),
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
      ],
      { cwd: rootDir, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean);
  const markdown = paths.filter((path) => path.endsWith('.md'));
  const texts = new Map(
    await Promise.all(
      markdown.map(async (path) => [path, await readFile(resolve(rootDir, path), 'utf8')]),
    ),
  );
  const graph = new Map(),
    errors = [],
    knownPaths = new Set(paths),
    lowerPaths = new Map(paths.map((path) => [path.toLowerCase(), path]));
  const operationIds = new Set(PROCESS_GUIDE.map((entry) => entry.id)),
    exampleIds = new Set(BUNDLED_EXAMPLES.map((entry) => entry.id));
  let links = 0,
    moduleReferences = 0;
  for (const [source, text] of texts) {
    const targets = [];
    graph.set(source, targets);
    for (const destination of markdownDestinations(text)) {
      let target;
      try {
        target = internalTarget(source, destination);
      } catch {
        errors.push(`${source}: invalid destination ${destination}`);
        continue;
      }
      if (!target) continue;
      links++;
      const path = posix(relative(rootDir, resolve(rootDir, target.path)));
      if (path === '..' || path.startsWith('../')) {
        errors.push(`${source}: destination escapes repository: ${destination}`);
        continue;
      }
      try {
        await access(resolve(rootDir, path));
      } catch {
        errors.push(`${source}: missing target ${destination}`);
        continue;
      }
      if (!knownPaths.has(path) && lowerPaths.has(path.toLowerCase()))
        errors.push(`${source}: filename case must be ${lowerPaths.get(path.toLowerCase())}`);
      if (texts.has(path)) {
        targets.push(path);
        if (target.fragment && !headingAnchors(texts.get(path)).has(target.fragment))
          errors.push(`${source}: missing heading ${destination}`);
      }
      if (target.operation && !operationIds.has(target.operation))
        errors.push(`${source}: unknown Process atlas operation ${target.operation}`);
      if (target.example && !exampleIds.has(target.example))
        errors.push(`${source}: unknown Welcome example ${target.example}`);
    }
  }
  const reached = new Set(),
    pending = ['docs/README.md'];
  while (pending.length) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    pending.push(...(graph.get(path) || []));
  }
  for (const path of markdown.filter((path) => path.startsWith('docs/')))
    if (!reached.has(path)) errors.push(`${path}: unreachable from docs/README.md`);
  const architecture = texts.get('docs/ARCHITECTURE.md') || '';
  for (const match of architecture.matchAll(
    /`((?:site|scripts)\/[\w./-]+\.(?:js|mjs|css|html))`/g,
  )) {
    moduleReferences++;
    if (!knownPaths.has(match[1])) errors.push(`docs/ARCHITECTURE.md: missing module ${match[1]}`);
  }
  return {
    markdownFiles: markdown.length,
    internalLinks: links,
    reachableDocs: [...reached].filter((path) => path.startsWith('docs/')).length,
    moduleReferences,
    errors,
  };
}

export async function checkDocumentation() {
  const result = await auditDocumentation();
  if (result.errors.length)
    throw new Error('Documentation audit failed:\n' + result.errors.join('\n'));
  console.log(
    `Documentation checked: ${result.markdownFiles} Markdown files, ${result.internalLinks} internal links, ${result.reachableDocs} reachable docs, ${result.moduleReferences} Architecture module references.`,
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await checkDocumentation();
