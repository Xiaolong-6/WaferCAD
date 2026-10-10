// M0 inventory only: never loads or rewrites application modules.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import { format, resolveConfig } from 'prettier';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(repo, 'docs/ui-v2');
const check = process.argv.includes('--check');
const normalize = (path) => path.replaceAll('\\', '/');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
const voidTags = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' '),
);
const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

// Quote-aware tag scanner; ignores comments and script/style bodies. This is a
// source inventory, not an HTML validator or a replacement for browser parsing.
function elementsIn(text) {
  const elements = [];
  const stack = [];
  const tags = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  for (let match; (match = tags.exec(text));) {
    const raw = match[0];
    if (raw.startsWith('<!')) continue;
    const tag = /^<\/?([\w-]+)/.exec(raw)[1].toLowerCase();
    if (raw.startsWith('</')) {
      const index = stack.findLastIndex((element) => element.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const attributes = {};
    const attributeSource = raw.slice(raw.indexOf(tag) + tag.length, -1);
    for (const attr of attributeSource.matchAll(attributePattern)) {
      attributes[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    const element = {
      tag,
      line: lineAt(text, match.index),
      offset: match.index,
      attributes,
      parent: stack.at(-1)?.attributes.id || stack.at(-1)?.tag || null,
    };
    elements.push(element);
    if (!voidTags.has(tag) && !raw.endsWith('/>')) stack.push(element);
    if (tag === 'script' || tag === 'style') {
      const close = text.toLowerCase().indexOf(`</${tag}`, tags.lastIndex);
      if (close >= 0) tags.lastIndex = close;
    }
  }
  return elements;
}

async function filesIn(directory) {
  const paths = [];
  for (const entry of await readdir(resolve(repo, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (path === 'site/vendor') continue;
    if (entry.isDirectory()) paths.push(...(await filesIn(path)));
    else if (/\.(?:js|mjs|cjs|html|css|json|svg|ps1|sh)$/.test(path)) paths.push(path);
  }
  return paths.sort();
}

function property(node) {
  return node?.type === 'MemberExpression'
    ? node.computed
      ? node.property.value
      : node.property.name
    : null;
}

function patterns(node) {
  if (!node) return [];
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node.type === 'TemplateLiteral') {
    return [node.quasis.map((part, index) => (index ? '${…}' : '') + part.value.cooked).join('')];
  }
  if (node.type === 'ConditionalExpression')
    return [...patterns(node.consequent), ...patterns(node.alternate)];
  if (node.type === 'LogicalExpression') return [...patterns(node.left), ...patterns(node.right)];
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = patterns(node.left),
      right = patterns(node.right);
    return (left.length ? left : ['${…}']).flatMap((a) =>
      (right.length ? right : ['${…}']).map((b) => a + b),
    );
  }
  return [];
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit, node));
    else if (value && typeof value === 'object') walk(value, visit, node);
  }
}

const paths = (await Promise.all([filesIn('site'), filesIn('scripts')])).flat();
const sources = await Promise.all(
  paths.map(async (path) => ({
    path,
    text: (await readFile(resolve(repo, path), 'utf8')).replaceAll('\r\n', '\n'),
  })),
);
const appSource = sources.find((source) => source.path === 'site/app.html');
const elements = elementsIn(appSource.text);
const ids = elements
  .filter((element) => element.attributes.id)
  .map((element) => ({
    id: element.attributes.id,
    tag: element.tag,
    inputType: element.attributes.type || null,
    line: element.line,
    parent: element.parent,
    attributes: element.attributes,
    references: [],
  }));
const operations = [];
const classMap = new Map();
const dynamicIds = [];
const datasetUsages = [];
const htmlAttributes = (list) =>
  list.flatMap((element) =>
    Object.entries(element.attributes)
      .filter(([name]) => name.startsWith('data-') || name === 'role' || name === 'aria-controls')
      .map(([name, value]) => ({
        name,
        value,
        tag: element.tag,
        id: element.attributes.id || null,
        line: element.line,
      })),
  );

function addClass(value, location, kind) {
  for (const name of value.split(/\s+/).filter(Boolean)) {
    const key = name;
    if (!classMap.has(key))
      classMap.set(key, { name, pattern: name.includes('${'), occurrences: [] });
    classMap.get(key).occurrences.push({ ...location, kind });
  }
}

const scriptUnits = [];
for (const source of sources) {
  if (source.path === 'scripts/ui-contract-extract.mjs') continue;
  const lines = source.text.split('\n');
  // Textual references deliberately include test strings and CSS selectors.
  // They are candidates to inspect, not proof that a runtime binding exists.
  for (const entry of ids) {
    const escaped = entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`);
    lines.forEach((line, index) => {
      if (pattern.test(line))
        entry.references.push({ file: source.path, line: index + 1, source: line.trim() });
    });
  }
  if (/\.(?:js|mjs|cjs)$/.test(source.path)) scriptUnits.push({ ...source, lineOffset: 0 });
  if (source.path.endsWith('.html')) {
    for (const match of source.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (
        /\btype\s*=\s*["'](?:importmap|application\/[^"']+)["']/i.test(match[1]) ||
        !match[2].trim()
      )
        continue;
      const offset = match.index + match[0].indexOf('>') + 1;
      scriptUnits.push({
        path: source.path,
        text: match[2],
        lineOffset: lineAt(source.text, offset) - 1,
      });
    }
  }
}

for (const source of scriptUnits) {
  const ast = parse(source.text, {
    ecmaVersion: 'latest',
    sourceType: source.path.endsWith('.cjs') ? 'script' : 'module',
    loc: true,
    range: true,
  });
  const slice = (node) => source.text.slice(...node.range);
  const location = (node) => ({ file: source.path, line: node.loc.start.line + source.lineOffset });
  const record = (kind, node, values = []) => {
    const entry = { ...location(node), kind, values, source: slice(node) };
    operations.push(entry);
    return entry;
  };
  const domVariables = new Set();
  const helperReturns = new Map();
  const isDomCall = (node) =>
    node?.type === 'CallExpression' &&
    (['createElement', 'createElementNS', 'getElementById', 'querySelector'].includes(
      property(node.callee),
    ) ||
      (node.callee.type === 'Identifier' &&
        ['make', 'makeButton', 'textInput', 'selectInput'].includes(node.callee.name)));
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isDomCall(node.init))
      domVariables.add(node.id.name);
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      isDomCall(node.right)
    )
      domVariables.add(node.left.name);
    if (
      node.type === 'AssignmentExpression' &&
      property(node.left) === 'className' &&
      node.left.object.type === 'Identifier'
    )
      domVariables.add(node.left.object.name);
    if (node.type === 'FunctionDeclaration' && node.id) {
      const values = [];
      walk(node.body, (child) => {
        if (child.type === 'ReturnStatement') values.push(...patterns(child.argument));
      });
      helperReturns.set(node.id.name, values);
    }
  });
  walk(ast, (node, parent) => {
    if (node.type === 'CallExpression') {
      const name = property(node.callee);
      if (name === 'createElement' || name === 'createElementNS') {
        record(name, node, patterns(node.arguments[name === 'createElementNS' ? 1 : 0]));
      }
      if (
        [
          'append',
          'appendChild',
          'prepend',
          'insertBefore',
          'replaceWith',
          'replaceChildren',
          'insertAdjacentHTML',
          'insertAdjacentElement',
        ].includes(name)
      ) {
        record(name, node);
        if (name === 'insertAdjacentHTML') {
          for (const value of patterns(node.arguments[1])) {
            for (const element of elementsIn(value)) {
              if (element.attributes.class)
                addClass(element.attributes.class, location(node), name);
            }
          }
        }
      }
      if (
        ['add', 'toggle', 'remove', 'replace'].includes(name) &&
        property(node.callee.object) === 'classList'
      ) {
        const args = name === 'toggle' ? node.arguments.slice(0, 1) : node.arguments;
        const values = args.flatMap(patterns);
        record(`classList.${name}`, node, values);
        values.forEach((value) => addClass(value, location(node), `classList.${name}`));
      }
      if (name === 'setAttribute') {
        const attr = patterns(node.arguments[0])[0];
        if (attr === 'class')
          patterns(node.arguments[1]).forEach((value) =>
            addClass(value, location(node), 'setAttribute'),
          );
        if (attr === 'id')
          dynamicIds.push({
            ...location(node),
            patterns: patterns(node.arguments[1]),
            source: slice(node),
          });
      }
      if (node.callee.type === 'Identifier' && ['make', 'makeButton'].includes(node.callee.name)) {
        const index = node.callee.name === 'make' ? 2 : 1;
        const values = patterns(node.arguments[index]);
        record(`helper.${node.callee.name}`, node, values);
        values.forEach((value) => addClass(value, location(node), `helper.${node.callee.name}`));
      }
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'fieldRow' &&
        source.path.endsWith('/draw-mask-controller.js')
      ) {
        dynamicIds.push({
          ...location(node),
          tag: 'input',
          patterns: patterns(node.arguments[1]),
          source: slice(node),
        });
      }
    }
    if (node.type === 'AssignmentExpression') {
      const name = property(node.left);
      if (name === 'innerHTML') {
        const values = patterns(node.right);
        record('innerHTML', node, values);
        for (const value of values) {
          for (const element of elementsIn(value)) {
            if (element.attributes.class)
              addClass(element.attributes.class, location(node), 'innerHTML');
            if (element.attributes.id)
              dynamicIds.push({
                ...location(node),
                tag: element.tag,
                patterns: [element.attributes.id],
                source: element.attributes.id,
              });
          }
        }
      }
      if (name === 'className') {
        const values = patterns(node.right);
        if (
          !values.length &&
          node.right.type === 'CallExpression' &&
          node.right.callee.type === 'Identifier'
        )
          values.push(...(helperReturns.get(node.right.callee.name) || []));
        record('className', node, values);
        values.forEach((value) => addClass(value, location(node), 'className'));
      }
      if (
        name === 'id' &&
        node.left.object.type === 'Identifier' &&
        domVariables.has(node.left.object.name)
      )
        dynamicIds.push({ ...location(node), patterns: patterns(node.right), source: slice(node) });
    }
    if (node.type === 'MemberExpression' && property(node) === 'dataset') {
      datasetUsages.push({
        ...location(node),
        source: slice(parent || node),
        key: property(parent),
        kind: parent?.type || node.type,
      });
      record('dataset', parent || node);
    }
    if (node.type === 'Property' && (node.key.name || node.key.value) === 'dataset') {
      datasetUsages.push({
        ...location(node),
        source: slice(node),
        key: null,
        kind: 'helper dataset object',
      });
      record('dataset.helper', node);
    }
  });
}

const sorted = (items) =>
  items.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || (a.kind || '').localeCompare(b.kind || ''),
  );
const classes = [...classMap.values()].sort((a, b) => a.name.localeCompare(b.name));
const dynamicReferenceCache = new Map(ids.map((entry) => [entry.id, entry.references]));
for (const entry of dynamicIds) {
  entry.references = [];
  for (const id of entry.patterns.filter((value) => value && !value.includes('${'))) {
    if (!dynamicReferenceCache.has(id)) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`);
      const references = [];
      for (const source of sources) {
        if (source.path === 'scripts/ui-contract-extract.mjs') continue;
        source.text.split('\n').forEach((line, index) => {
          if (pattern.test(line))
            references.push({ file: source.path, line: index + 1, source: line.trim() });
        });
      }
      dynamicReferenceCache.set(id, references);
    }
    entry.references.push(...dynamicReferenceCache.get(id));
  }
}
const runtime = (entry) => entry.file.startsWith('site/') && !entry.file.startsWith('site/tests/');
const attrs = htmlAttributes(elements);
const ariaTargets = attrs
  .filter((attr) => attr.name === 'aria-controls')
  .flatMap((attr) =>
    attr.value.split(/\s+/).map((target) => ({
      ...attr,
      target,
      existsInStaticHtml: ids.some((entry) => entry.id === target),
    })),
  );
const duplicateIds = ids
  .map((entry) => entry.id)
  .filter((id, index, all) => all.indexOf(id) !== index);
const contract = {
  schemaVersion: 1,
  source: 'site/app.html',
  auditedBase: execFileSync('git', ['rev-parse', 'origin/main'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  sourceSha256: hash(appSource.text),
  scope: {
    roots: ['site/**', 'scripts/**'],
    excluded: ['site/vendor/**', 'scripts/ui-contract-extract.mjs'],
    referenceKind: 'textual candidates (including CSS and tests)',
    analysis:
      'Espree AST plus quote-aware HTML source scan; computed expressions are explicitly unresolved; no runtime reachability claim',
  },
  counts: {
    staticIds: ids.length,
    uniqueStaticIds: new Set(ids.map((entry) => entry.id)).size,
    dataAttributes: attrs.filter((attr) => attr.name.startsWith('data-')).length,
    roleAttributes: attrs.filter((attr) => attr.name === 'role').length,
    ariaControls: ariaTargets.length,
    dynamicClasses: classes.filter((entry) => !entry.pattern && entry.occurrences.some(runtime))
      .length,
    dynamicClassPatterns: classes.filter(
      (entry) => entry.pattern && entry.occurrences.some(runtime),
    ).length,
    dynamicOperations: operations.filter(runtime).length,
    dynamicIdDeclarations: dynamicIds.filter(runtime).length,
    unresolvedOperations: operations.filter(
      (entry) =>
        runtime(entry) &&
        ['className', 'createElement', 'innerHTML'].includes(entry.kind) &&
        !entry.values.length,
    ).length,
  },
  duplicateIds,
  ids,
  attributes: attrs,
  ariaTargets,
  dynamicClasses: classes,
  dynamicIds: sorted(dynamicIds),
  datasetUsages: sorted(datasetUsages),
  dynamicOperations: sorted(operations),
};

const cell = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
const loc = (entry) => `${entry.file}:${entry.line}`;
const preview = (items) =>
  `${items.length}: ${items.slice(0, 2).join(', ')}${items.length > 2 ? ', …' : ''}`;
const doc = [
  '# UI v2 DOM contract — M0 inventory',
  '',
  `Audited main: \`${contract.auditedBase}\`. Generated with \`node scripts/ui-contract-extract.mjs\`; verify with \`--check\`.`,
  '',
  'This inventories the legacy entry at the recorded main revision. IDs/ARIA/data attributes come from app.html; references are textual candidates across site and scripts (vendor excluded). JavaScript operations use the locked ESLint Espree parser. Runtime-site counts include ui-v2 previews and prototypes and exclude test-only evidence; they are not legacy-only counts. Computed classes/IDs are patterns or unresolved operations, not fabricated concrete names. This does not establish v2 coverage or runtime reachability.',
  '',
  '## Counts',
  '',
  ...Object.entries(contract.counts).map(([key, value]) => `- ${key}: ${value}`),
  '',
  `Duplicate static IDs: ${duplicateIds.length ? duplicateIds.join(', ') : 'none'}. Missing static aria-controls targets: ${
    ariaTargets
      .filter((entry) => !entry.existsInStaticHtml)
      .map((entry) => entry.target)
      .join(', ') || 'none'
  }.`,
  '',
  '## Static IDs and referencing files',
  '',
  '| ID | Element / type | Source line / parent | Referencing files (count / first two; complete list in contract.json) |',
  '| --- | --- | --- | --- |',
  ...ids.map(
    (entry) =>
      `| ${cell(entry.id)} | ${entry.tag}${entry.inputType ? ' / ' + entry.inputType : ''} | ${entry.line} / ${cell(entry.parent)} | ${cell(preview([...new Set(entry.references.map((ref) => ref.file))]))} |`,
  ),
  '',
  '## data-* / role / aria-controls',
  '',
  '| Source line / element | Attribute | Value |',
  '| --- | --- | --- |',
  ...attrs.map(
    (entry) =>
      `| ${entry.line} / ${cell(entry.id || entry.tag)} | ${entry.name} | ${cell(entry.value)} |`,
  ),
  '',
  '## Dynamic classes',
  '',
  '| Class or computed pattern | Runtime creation/state sites (count / first two; complete list in contract.json) |',
  '| --- | --- |',
  ...classes
    .filter((entry) => entry.occurrences.some(runtime))
    .map(
      (entry) =>
        `| ${cell(entry.name)} | ${cell(preview([...new Set(entry.occurrences.filter(runtime).map(loc))]))} |`,
    ),
  '',
  '## Dynamic IDs',
  '',
  'Concrete dynamic IDs also include all referencing files/lines in contract.json; repeated declarations are conditional creation sites, not a claim of simultaneous duplicate nodes.',
  '',
  '| Pattern (blank = unresolved) | Creation site | Element where known |',
  '| --- | --- | --- |',
  ...dynamicIds
    .filter(runtime)
    .map(
      (entry) =>
        `| ${cell(entry.patterns.join(', '))} | ${loc(entry)} | ${entry.tag || 'see source'} |`,
    ),
  '',
  '## Dynamic structure and dataset sites',
  '',
  'Every innerHTML assignment, createElement call, className/classList state change, dataset access, helper-class invocation and append/prepend/replace operation is recorded with the complete source expression in contract.json. No inferred parent is asserted for computed assembly. Review helper calls with variable arguments and unresolved operations before migrating a domain.',
  '',
  '| Runtime module | Operation count | Kinds |',
  '| --- | --- | --- |',
  ...[...new Set(operations.filter(runtime).map((entry) => entry.file))].sort().map((file) => {
    const own = operations.filter((entry) => entry.file === file);
    return `| ${file} | ${own.length} | ${[...new Set(own.map((entry) => entry.kind))].join(', ')} |`;
  }),
  '',
  'Known limits: helper arguments stored in variables, class maps, computed dataset keys and IDs assembled from live values need manual verification. Inline HTML JavaScript is parsed with original source line offsets; import maps are excluded. CSS content and scientific SVG classes are outside dynamic UI-class counts. The static parser ignores script/style text and never executes application code.',
  '',
].join('\n');

const formatting = await resolveConfig(resolve(repo, '.prettierrc.json'));
const generated = [
  ['contract.json', await format(JSON.stringify(contract), { ...formatting, parser: 'json' })],
  ['CONTRACT.md', await format(doc, { ...formatting, parser: 'markdown' })],
];
if (!check) await mkdir(output, { recursive: true });
for (const [name, value] of generated) {
  const path = resolve(output, name);
  if (check) {
    if ((await readFile(path, 'utf8')) !== value)
      throw new Error(`${normalize(relative(repo, path))} is stale; regenerate the M0 inventory.`);
  } else await writeFile(path, value);
}
console.log(JSON.stringify({ check, ...contract.counts, duplicateIds }, null, 2));
