import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const BROWSER_SUITES = Object.freeze([
  'smoke',
  'workstation',
  'resilience',
  'history',
  'persistence',
  'interaction',
  'examples',
  'product_layout',
  'renderer',
  'process',
]);

const COMMON_TEST_INFRA = [
  /^scripts\/test-helpers\/ui\.mjs$/,
  /^scripts\/test-helpers\/product-scientific\.mjs$/,
];
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json']);
const WORKSTATION_PATHS = [
  /^site\/app\.(?:js|html)$/,
  /^site\/workstation\.css$/,
  /^site\/controllers\/(?:startup|tool-tabs|workspace-view|workspace-actions)-controller\.js$/,
  /^site\/bundled-examples\.js$/,
  /^site\/welcome\.js$/,
  /^scripts\/workstation-regression\.mjs$/,
];

const RESILIENCE_PATHS = [/^site\/three-/, /^scripts\/resilience-regression\.mjs$/];

const HISTORY_PATHS = [
  /^site\/workspace-snapshots\.js$/,
  /^site\/history-/,
  /^site\/controllers\/history-/,
  /^site\/controllers\/project-controller\.js$/,
  /^site\/controllers\/process-panel-controller\.js$/,
  /^site\/bundled-example-history\.js$/,
  /^scripts\/history-regression\.mjs$/,
];

const PERSISTENCE_PATHS = [
  /^site\/workspace-persistence/,
  /^site\/workspace-(?:storage-worker|dirty-domains)\.js$/,
  /^site\/controllers\/project-state-controller\.js$/,
  /^site\/project-(?:io|schema|storage|geometry-storage|worker)/,
  /^site\/polygon-boolean\.js$/,
  /^site\/controllers\/project-controller\.js$/,
  /^site\/controllers\/startup-controller\.js$/,
  /^scripts\/persistence-regression\.mjs$/,
  /^scripts\/project-io-runtime-regression\.mjs$/,
];

const INTERACTION_PATHS = [
  /^site\/app\.html$/,
  /^site\/(?:style|workstation)\.css$/,
  /^site\/controllers\/(?:base-controls|draw-mask|export|main-canvas|mask-|plan-view|roi|section-|view-maximize|view-popover)-controller\.js$/,
  /^site\/(?:draw-mask|mask-|roi-|plan-)/,
  /^scripts\/interaction-regression\.mjs$/,
];

const PROCESS_PATHS = [
  /^site\/model\.js$/,
  /^site\/project-(?:io|schema|geometry-storage)\.js$/,
  /^scripts\/project-io-runtime-regression\.mjs$/,
  /^site\/model-view-geometry\.js$/,
  /^site\/process-worker\.js$/,
  /^site\/vector-geometry\.js$/,
  /^site\/polygon-boolean\.js$/,
  /^site\/controllers\/process-/,
  /^site\/(?:rough|surface|conformal|isotropic)/,
  /^scripts\/process-geometry-regression\.mjs$/,
  /^scripts\/process-benchmarks\.mjs$/,
];

const RENDERER_PATHS = [
  /^site\/model-view-geometry\.js$/,
  /^site\/polygon-triangulation\.js$/,
  /^site\/(?:three|section|render|glb)/,
  /^site\/(?:annotation-rendering|plan-renderers|rough-mesh(?:-geometry|-worker)?|surface-rendering)\.js$/,
  /^scripts\/renderer-product-regression\.mjs$/,
  /^scripts\/renderer-product-cases\.mjs$/,
];

const LAYOUT_PATHS = [
  /^site\/(?:gds|oasis)\.js$/,
  /^site\/layout-/,
  /^scripts\/product-layout-regression\.mjs$/,
  /^scripts\/product-layout-cases\.mjs$/,
];

const PRODUCT_REVIEW_PATHS = [
  /^scripts\/product-regression\.mjs$/,
  /^scripts\/test-helpers\/(?:product|product-layout|product-scientific)\.mjs$/,
];

const EXAMPLE_PATHS = [
  /^site\/examples\//,
  /^examples\//,
  /^site\/bundled-examples\.js$/,
  /^site\/bundled-example-history\.js$/,
  /^scripts\/example-regression\.mjs$/,
];

const PRODUCT_LAYOUT_PATHS = [
  /^site\/app\.html$/,
  /^site\/(?:style|workstation)\.css$/,
  /^site\/controllers\/(?:base-controls|main-canvas|section-|tool-tabs|view-maximize|view-popover|workspace-view)-controller\.js$/,
  ...LAYOUT_PATHS,
];

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function emptyPlan() {
  return Object.fromEntries(BROWSER_SUITES.map((suite) => [suite, false]));
}

function enable(plan, ...suites) {
  for (const suite of suites) plan[suite] = true;
}

function enableAll(plan) {
  enable(plan, ...BROWSER_SUITES);
}

export function buildCiTestPlan(changedPaths = [], { full = false } = {}) {
  const paths = [...new Set(changedPaths.map((path) => String(path).trim()).filter(Boolean))],
    plan = emptyPlan();

  enable(plan, 'smoke');

  if (full) {
    enableAll(plan);
    return { full: true, paths, suites: plan };
  }

  if (paths.some((path) => DEPENDENCY_FILES.has(path) || matchesAny(path, COMMON_TEST_INFRA))) {
    enableAll(plan);
    return { full: true, paths, suites: plan };
  }

  for (const path of paths) {
    if (matchesAny(path, WORKSTATION_PATHS)) enable(plan, 'workstation');
    if (matchesAny(path, RESILIENCE_PATHS)) enable(plan, 'resilience');
    if (matchesAny(path, HISTORY_PATHS)) enable(plan, 'history');
    if (matchesAny(path, PERSISTENCE_PATHS)) enable(plan, 'persistence');
    if (matchesAny(path, INTERACTION_PATHS)) enable(plan, 'interaction');
    if (matchesAny(path, PRODUCT_LAYOUT_PATHS)) enable(plan, 'product_layout');
    if (matchesAny(path, PRODUCT_REVIEW_PATHS)) enable(plan, 'product_layout', 'renderer');
    if (matchesAny(path, EXAMPLE_PATHS)) enable(plan, 'examples');
    if (matchesAny(path, RENDERER_PATHS)) enable(plan, 'renderer');
    if (matchesAny(path, PROCESS_PATHS)) enable(plan, 'process');
    if (matchesAny(path, LAYOUT_PATHS)) enable(plan, 'interaction', 'product_layout');
  }

  return { full: false, paths, suites: plan };
}

async function stdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function writeGithubOutputs(plan) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = [
    `full=${plan.full}`,
    ...BROWSER_SUITES.map((suite) => `${suite}=${plan.suites[suite]}`),
  ];
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

async function main() {
  const args = process.argv.slice(2),
    full = args.includes('--full'),
    useStdin = args.includes('--stdin');
  let paths = args.filter((arg) => !arg.startsWith('--'));
  if (useStdin) {
    paths = (await stdinText())
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);
  }
  const plan = buildCiTestPlan(paths, { full });
  await writeGithubOutputs(plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
