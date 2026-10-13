import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';

const roots = ['site', 'scripts'];
const extensions = new Set(['.js', '.mjs']);
const excludedPrefixes = ['site/vendor/', 'site/ui-v2/prototypes/'];
const maxParseBytes = 512 * 1024;

async function inventory(root) {
  const found = [];
  async function walk(folder) {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const file = posix.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && extensions.has(extname(file))) found.push(file);
    }
  }
  for (const folder of roots) await walk(folder);
  return found.filter((file) => !excludedPrefixes.some((prefix) => file.startsWith(prefix))).sort();
}

function bindingNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'RestElement' || node.type === 'AssignmentPattern')
    return bindingNames(node.argument || node.left);
  if (node.type === 'ArrayPattern') return node.elements.flatMap(bindingNames);
  if (node.type === 'ObjectPattern') return node.properties.flatMap((part) =>
    bindingNames(part.value || part.argument),
  );
  return [];
}

function exportedNames(declaration) {
  if (!declaration) return [];
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
    return bindingNames(declaration.id);
  if (declaration.type === 'VariableDeclaration')
    return declaration.declarations.flatMap((part) => bindingNames(part.id));
  return [];
}

function resolveModule(from, specifier, files) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
  const normalized = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (normalized.startsWith('../') || normalized === '..') return null;
  for (const path of [normalized, normalized + '.js', normalized + '.mjs', normalized + '/index.js']) {
    if (files.has(path)) return path;
  }
  return null;
}

function inspectSource(path, source) {
  const linter = new Linter();
  const exports = [];
  const imports = [];
  const collectionRule = {
    meta: { schema: [] },
    create() {
      return {
        Program(program) {
          for (const item of program.body) {
            if (item.type === 'ImportDeclaration') {
              const names = item.specifiers
                .filter((part) => part.type === 'ImportSpecifier')
                .map((part) => part.imported.name || part.imported.value);
              const wildcard = item.specifiers.some(
                (part) => part.type === 'ImportNamespaceSpecifier' ||
                  part.type === 'ImportDefaultSpecifier',
              ) || item.specifiers.length === 0;
              imports.push({ source: item.source.value, names, wildcard });
            }
            if (item.type === 'ExportNamedDeclaration') {
              for (const name of exportedNames(item.declaration))
                exports.push({ symbol: name, line: item.loc.start.line });
              for (const specifier of item.specifiers) {
                if (item.source)
                  imports.push({
                    source: item.source.value,
                    names: [specifier.local.name || specifier.local.value],
                    wildcard: false,
                  });
                exports.push({
                  symbol: specifier.exported.name || specifier.exported.value,
                  line: item.loc.start.line,
                });
              }
            }
            if (item.type === 'ExportAllDeclaration')
              imports.push({ source: item.source.value, names: [], wildcard: true });
          }
        },
        ImportExpression(node) {
          if (typeof node.source.value === 'string')
            imports.push({ source: node.source.value, names: [], wildcard: true });
        },
      };
    },
  };
  const findings = linter.verify(
    source,
    [{
      plugins: { audit: { rules: { collect: collectionRule } } },
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      rules: {
        'audit/collect': 'error',
        'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      },
    }],
    { filename: path },
  );
  const parseErrors = findings.filter((entry) => entry.fatal);
  const localUnused = findings
    .filter((entry) => entry.ruleId === 'no-unused-vars')
    .map((entry) => ({ file: path, line: entry.line, message: entry.message }));
  return { exports, imports, parseErrors, localUnused };
}

export async function auditSiteSymbols(root = resolve('.')) {
  const paths = await inventory(root);
  const files = new Set(paths);
  const parsed = new Map();
  const skippedLarge = [];
  const parseErrors = [];
  const localUnused = [];

  for (const path of paths) {
    const absolute = join(root, path);
    if ((await stat(absolute)).size > maxParseBytes) {
      skippedLarge.push(path);
      continue;
    }
    const result = inspectSource(path, await readFile(absolute, 'utf8'));
    parsed.set(path, result);
    parseErrors.push(...result.parseErrors.map((entry) => ({
      file: path,
      line: entry.line,
      message: entry.message,
    })));
    localUnused.push(...result.localUnused);
  }

  const consumers = new Map();
  for (const [from, result] of parsed) {
    for (const entry of result.imports) {
      const target = resolveModule(from, entry.source, files);
      if (!target) continue;
      const existing = consumers.get(target) || { names: new Set(), wildcard: false };
      for (const name of entry.names) existing.names.add(name);
      existing.wildcard ||= entry.wildcard;
      consumers.set(target, existing);
    }
  }

  const namedExportCandidates = [];
  for (const [path, result] of parsed) {
    if (!path.startsWith('site/') || path.startsWith('site/tests/')) continue;
    const consumer = consumers.get(path);
    for (const entry of result.exports) {
      if (!consumer?.wildcard && !consumer?.names.has(entry.symbol))
        namedExportCandidates.push({ file: path, ...entry });
    }
  }
  return {
    scannedModules: parsed.size,
    skippedLarge,
    parseErrors,
    localUnused,
    namedExportCandidates,
    limitations: [
      'Findings are review candidates; no code is removed automatically.',
      'Indirect browser global accesses and computed module specifiers cannot be proven by this scan.',
      'Re-export chains, dynamic consumers and files above the scan size cap require manual review.',
      'Only statically named imports are treated as named export consumers.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditSiteSymbols(resolve(process.argv[2] || '.'));
  console.log(JSON.stringify({
    scannedModules: report.scannedModules,
    skippedLarge: report.skippedLarge,
    parseErrors: report.parseErrors.slice(0, 12),
    localUnusedCount: report.localUnused.length,
    localUnusedExamples: report.localUnused.slice(0, 25),
    namedExportCandidateCount: report.namedExportCandidates.length,
    namedExportExamples: report.namedExportCandidates.slice(0, 40),
    limitations: report.limitations,
  }, null, 2));
}
