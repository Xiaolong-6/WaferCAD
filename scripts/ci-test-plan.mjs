import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

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
const DEPENDENCY_FILES = new Set(['package-lock.json']);
// This script is an explicitly opt-in renderer stress diagnostic, not a Workstation
// or Main/Mask product source owner. Its owning Node regression and manually
// dispatched renderer stress remain available without starting unrelated UI CI.
const CI_ONLY_V2_SCRIPTS = new Set(['scripts/v2/check-source-sunset-renderer-stress.mjs']);
const V2_WORKSPACE_PATHS = [/^site\/ui-v2\//, /^scripts\/v2\//];
const V2_CROSS_UI_PATHS = [
  /^site\/ui-v2\/(?:workstation-(?:entry|runtime|workflow)|project-mask-panels)\.js$/,
  /^site\/app(?:-legacy)?\.html$/,
  /^scripts\/v2\/(?:check-startup|check-cross-ui-recovery|check-sync|check-m4-projects)\.mjs$/,
];

const WORKSTATION_PATHS = [
  /^site\/app\.(?:js|html)$/,
  /^site\/workstation\.css$/,
  /^site\/controllers\/(?:startup|project|tool-tabs|workspace-view|workspace-actions)-controller\.js$/,
  /^site\/bundled-examples\.js$/,
  /^site\/welcome\.js$/,
  /^scripts\/workstation-regression\.mjs$/,
];

const RESILIENCE_PATHS = [/^site\/three-/, /^scripts\/resilience-regression\.mjs$/];

const HISTORY_PATHS = [
  /^site\/state-equality\.js$/,
  /^site\/workspace-snapshots\.js$/,
  /^site\/history-/,
  /^site\/controllers\/history-/,
  /^site\/controllers\/project-controller\.js$/,
  /^site\/controllers\/process-panel-controller\.js$/,
  /^site\/bundled-example-history\.js$/,
  /^scripts\/history-regression\.mjs$/,
];

const PERSISTENCE_PATHS = [
  /^site\/state-equality\.js$/,
  /^site\/(?:model-array|mask-instance-index)/,
  /^scripts\/(?:array-runtime-regression|build-wafer-array-example)\.mjs$/,
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
  /^site\/(?:selection-geometry|mask-instance-index)\.js$/,
  /^site\/app(?:-legacy)?\.html$/,
  /^site\/(?:style|workstation)\.css$/,
  /^site\/controllers\/(?:base-controls|draw-mask|export|main-canvas|mask-|plan-view|roi|section-|view-maximize|view-popover)-controller\.js$/,
  /^site\/(?:draw-mask|mask-|roi-|plan-)/,
  /^scripts\/interaction-regression\.mjs$/,
];

const PROCESS_PATHS = [
  /^site\/process-(?:recipe|recipe-preflight|numerical-contract|face-execution)\.js$/,
  /^site\/(?:model-array|mask-instance-index)/,
  /^site\/process-(?:boundary-index|topology)\.js$/,
  /^site\/controllers\/process-task-controller\.js$/,
  /^site\/advanced-process-operations\.js$/,
  /^scripts\/array-runtime-regression\.mjs$/,
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
  /^scripts\/array-renderer-regression\.mjs$/,
  /^scripts\/renderer-pipeline-benchmark\.mjs$/,
  /^scripts\/pr250-(?:renderer-audit|audit-fixtures|audit-compare)\.mjs$/,
  /^scripts\/rough-boundary-audit\.mjs$/,
  /^scripts\/test-helpers\/pr250-/,
  /^site\/(?:model-array|mask-instance-index)/,
  /^scripts\/array-runtime-regression\.mjs$/,
  /^site\/model-view-geometry\.js$/,
  /^site\/polygon-triangulation\.js$/,
  /^site\/(?:three|section|render|glb)/,
  /^site\/(?:annotation-rendering|plan-renderers|rough-boundary-profile|rough-mesh(?:-geometry|-worker)?|surface-rendering)\.js$/,
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
  /^site\/example-asset\.js$/,
  /^site\/examples\//,
  /^examples\/(?!.*\/(?:README|PROVENANCE)\.md$)/,
  /^site\/bundled-examples\.js$/,
  /^site\/bundled-example-history\.js$/,
  /^scripts\/example-regression\.mjs$/,
];

const PRODUCT_LAYOUT_PATHS = [
  /^site\/app(?:-legacy)?\.html$/,
  /^site\/(?:style|workstation)\.css$/,
  /^site\/controllers\/(?:base-controls|main-canvas|section-|tool-tabs|view-maximize|view-popover|workspace-view)-controller\.js$/,
  ...LAYOUT_PATHS,
];

// Stable release gates supplement the browser suite planner. They are selected
// by changed source ownership and are all enabled for manual/full releases.
// A skipped gate can be treated as not applicable only if its plan says false.
export const RELEASE_GATES = Object.freeze(['main_mask', 'klayout', 'recipe']);
const MAIN_MASK_RELEASE_PATHS = [
  /^site\/(?:model|model-view-geometry|plan-renderers|selection-geometry|mask-|roi-|draw-mask)/,
  /^site\/(?:layout-|gds|oasis|vector-geometry|process-worker|process-face-execution)/,
  /^site\/controllers\/(?:mask-[\w-]+|main-canvas|draw-mask|roi|section-[\w-]+|process-panel)-controller\.js$/,
  /^site\/ui-v2\//,
  /^scripts\/v2\//,
  /^\.github\/workflows\/ui-v2-main-mask\.yml$/,
];
const KLAYOUT_RELEASE_PATHS = [
  /^site\/(?:gds|oasis)\.js$/,
  /^site\/(?:layout-|project-(?:schema|io|worker|geometry-storage))/,
  /^site\/controllers\/(?:mask-import|export)-controller\.js$/,
  /^scripts\/klayout-/,
  /^\.github\/workflows\/klayout-compat\.yml$/,
];
const RECIPE_RELEASE_PATHS = [
  /^site\/(?:model|process-(?:recipe|numerical|face-execution|worker|topology)|history-|workspace-snapshots)/,
  /^site\/controllers\/(?:process-|history-mutation|workspace-persistence)-controller\.js$/,
  /^scripts\/process-(?:recipe|transaction|geometry)-/,
  /^\.github\/workflows\/process-recipe-safety\.yml$/,
];

function buildReleaseGates(paths, full = false) {
  return {
    main_mask:
      full ||
      paths.some(
        (path) => !CI_ONLY_V2_SCRIPTS.has(path) && matchesAny(path, MAIN_MASK_RELEASE_PATHS),
      ),
    klayout: full || paths.some((path) => matchesAny(path, KLAYOUT_RELEASE_PATHS)),
    recipe: full || paths.some((path) => matchesAny(path, RECIPE_RELEASE_PATHS)),
  };
}

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

// Only the addition of a dedicated preview command is safe to de-scope.
// Unrecognized changes, including missing Git history, remain full-suite.
export function isPreviewOnlyPackageChange(before, after) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    return false;
  }
  const { scripts: oldScripts = {}, ...oldPackage } = before;
  const { scripts: newScripts = {}, ...newPackage } = after;
  if (
    !oldScripts ||
    !newScripts ||
    typeof oldScripts !== 'object' ||
    typeof newScripts !== 'object'
  ) {
    return false;
  }
  const { 'preview:visual': previewCommand, ...otherScripts } = newScripts;
  return (
    !Object.hasOwn(oldScripts, 'preview:visual') &&
    previewCommand === 'node scripts/v2/capture-visual-first.mjs' &&
    isDeepStrictEqual(oldPackage, newPackage) &&
    isDeepStrictEqual(oldScripts, otherScripts)
  );
}

export function buildCiTestPlan(
  changedPaths = [],
  { full = false, packageBefore = null, packageAfter = null } = {},
) {
  const paths = [...new Set(changedPaths.map((path) => String(path).trim()).filter(Boolean))],
    plan = emptyPlan();

  enable(plan, 'smoke');

  if (full) {
    enableAll(plan);
    return { full: true, paths, suites: plan, release: buildReleaseGates(paths, true) };
  }

  if (
    paths.some((path) => DEPENDENCY_FILES.has(path) || matchesAny(path, COMMON_TEST_INFRA)) ||
    (paths.includes('package.json') && !isPreviewOnlyPackageChange(packageBefore, packageAfter))
  ) {
    enableAll(plan);
    return { full: true, paths, suites: plan, release: buildReleaseGates(paths, true) };
  }

  for (const path of paths) {
    // The dedicated Stage C/M4 job owns real v2 behavior on main and PRs.
    // Legacy cross-interface owners still guard shared recovery and History.
    if (!CI_ONLY_V2_SCRIPTS.has(path) && matchesAny(path, V2_WORKSPACE_PATHS))
      enable(plan, 'workstation');
    if (matchesAny(path, V2_CROSS_UI_PATHS))
      enable(plan, 'workstation', 'history', 'persistence', 'interaction');
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

  return { full: false, paths, suites: plan, release: buildReleaseGates(paths) };
}

function packageAtRevision(ref) {
  if (!/^[0-9a-f]{40}$/i.test(ref || '')) return null;
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${ref}:package.json`], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
    );
  } catch {
    return null;
  }
}

async function stdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function writeGithubOutputs(plan) {
  if (!process.env.GITHUB_OUTPUT) return;
  const heavy = ['workstation', 'interaction', 'examples', 'product_layout', 'renderer'];
  const selected = heavy.filter((suite) => plan.suites[suite]);
  const lines = [
    `full=${plan.full}`,
    ...BROWSER_SUITES.map((suite) => `${suite}=${plan.suites[suite]}`),
    ...RELEASE_GATES.map((gate) => `${gate}=${plan.release[gate]}`),
    `extended=${selected.length > 0}`,
    `extended_matrix=${JSON.stringify(selected.length > 0 ? selected : ['none'])}`,
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
  const baseRef = args.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const headRef = args.find((arg) => arg.startsWith('--head='))?.slice('--head='.length);
  const needPackage = paths.includes('package.json') && !full;
  const plan = buildCiTestPlan(paths, {
    full,
    packageBefore: needPackage ? packageAtRevision(baseRef) : null,
    packageAfter: needPackage ? packageAtRevision(headRef) : null,
  });
  await writeGithubOutputs(plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
