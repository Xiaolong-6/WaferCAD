// Production native-v2 release ownership for the retired executable Legacy editor.
// Historical DOM suites remain immutable at the verified legacy-frozen Git tag.
// Each scientific owner runs on the real published v2 application and fails closed.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_V2_OWNERS = Object.freeze({
  interaction: Object.freeze([
    'scripts/v2/check-main-view.mjs',
    'scripts/v2/check-mask-view.mjs',
    'scripts/v2/check-open-mask-unit-editor.mjs',
    'scripts/v2/check-unit-roi-alignment-lifecycle.mjs',
    'scripts/v2/check-mask-process-area.mjs',
    'scripts/v2/check-source-sunset-draw-process.mjs',
    'scripts/v2/check-review-interactions.mjs',
  ]),
  examples: Object.freeze([
    'scripts/v2/check-m4-projects.mjs',
    'scripts/v2/check-metalens-recipe-science.mjs',
  ]),
  process: Object.freeze([
    'scripts/v2/check-physical-process-units.mjs',
    'scripts/v2/check-manual-both.mjs',
    'scripts/v2/check-recipe-preflight-atomicity.mjs',
    'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    'scripts/v2/check-worker-fault-parity.mjs',
    'scripts/v2/check-mask-process-area.mjs',
    'scripts/v2/check-sync.mjs',
    'scripts/v2/check-three-export-abort.mjs',
  ]),
  recipe: Object.freeze([
    'scripts/v2/check-recipe-preflight-atomicity.mjs',
    'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    'scripts/v2/check-worker-fault-parity.mjs',
    'scripts/v2/check-history-replay-rollback.mjs',
  ]),
  transaction: Object.freeze([
    'scripts/v2/check-worker-fault-parity.mjs',
    'scripts/v2/check-recipe-preflight-atomicity.mjs',
    'scripts/v2/check-recovery-failure-atomicity.mjs',
    'scripts/v2/check-history-replay-rollback.mjs',
  ]),
  io: Object.freeze([
    'scripts/v2/check-legacy-project-recovery.mjs',
    'scripts/v2/check-klayout-mask-process.mjs',
    'scripts/v2/check-report-export.mjs',
    'scripts/v2/check-three-export-abort.mjs',
    'scripts/v2/check-m4-projects.mjs',
  ]),
  array: Object.freeze([
    'scripts/v2/check-array-625-science.mjs',
    'scripts/v2/check-array-6400-worker-replay.mjs',
    'scripts/v2/check-array-renderer-isolation.mjs',
  ]),
  layout: Object.freeze([
    'scripts/v2/check-m2-live-parity.mjs',
    'scripts/v2/check-main-view.mjs',
    'scripts/v2/check-mask-view.mjs',
    'scripts/v2/check-tooltips.mjs',
    'scripts/v2/check-desktop-docking.mjs',
  ]),
  renderer: Object.freeze([
    'scripts/v2/check-three-view.mjs',
    'scripts/v2/check-array-renderer-isolation.mjs',
    'scripts/v2/check-three-export-abort.mjs',
  ]),
  rendererArray: Object.freeze([
    'scripts/v2/check-array-renderer-isolation.mjs',
    'scripts/v2/check-source-sunset-renderer-stress.mjs',
    'scripts/v2/check-three-view.mjs',
  ]),
  rendererEdge: Object.freeze([
    'scripts/v2/check-source-sunset-edge-on.mjs',
    'scripts/v2/check-array-renderer-isolation.mjs',
  ]),
  klayout: Object.freeze(['scripts/v2/check-klayout-mask-process.mjs']),
  fig3: Object.freeze([
    'scripts/v2/check-sync.mjs',
    'scripts/v2/check-physical-process-units.mjs',
    'scripts/v2/check-three-export-abort.mjs',
  ]),
});

export const RELEASE_SCIENTIFIC_TESTS = Object.freeze({
  interaction: Object.freeze([
    'site/tests/mask-roi-geometry.test.mjs',
    'site/tests/roi-editor.test.mjs',
    'site/tests/layout-export.test.mjs',
  ]),
  examples: Object.freeze([
    'site/tests/example-literature-fidelity.test.mjs',
    'site/tests/example-structure.test.mjs',
    'site/tests/example-recipe-audit.test.mjs',
  ]),
  process: Object.freeze([
    'site/tests/conformal-process.test.mjs',
    'site/tests/rough-process.test.mjs',
    'site/tests/isotropic-release.test.mjs',
    'site/tests/liftoff-scale.test.mjs',
    'site/tests/photodetector-rough-conformal.test.mjs',
    'site/tests/section-surface-rendering.test.mjs',
  ]),
  recipe: Object.freeze([
    'site/tests/process-recipe-preflight.test.mjs',
    'site/tests/history-replay.test.mjs',
  ]),
  transaction: Object.freeze([
    'site/tests/process-task-abort-fault.test.mjs',
    'site/tests/history-recovery-fault-matrix.test.mjs',
  ]),
  io: Object.freeze([
    'site/tests/project-import-validation.test.mjs',
    'site/tests/layout-export.test.mjs',
    'site/tests/morphology-export.test.mjs',
  ]),
  array: Object.freeze([
    'site/tests/array-instance-invariants.test.mjs',
    'site/tests/array-6400-history.test.mjs',
    'site/tests/model-array.test.mjs',
  ]),
  layout: Object.freeze([
    'site/tests/example-mask-export.test.mjs',
    'site/tests/layout-export.test.mjs',
  ]),
  renderer: Object.freeze([
    'site/tests/rough-boundary-profile.test.mjs',
    'site/tests/three-outline-geometry.test.mjs',
    'site/tests/section-surface-rendering.test.mjs',
  ]),
  rendererArray: Object.freeze([
    'site/tests/transparent-array-lod.test.mjs',
    'site/tests/renderer-geometry-cache.test.mjs',
  ]),
  rendererEdge: Object.freeze([
    'site/tests/three-outline-geometry.test.mjs',
    'site/tests/rough-display-lod.test.mjs',
  ]),
  klayout: Object.freeze(['site/tests/layout-export.test.mjs']),
  fig3: Object.freeze([
    'site/tests/fig3-native-conformal.test.mjs',
    'site/tests/isotropic-release.test.mjs',
    'site/tests/process-both-face.test.mjs',
  ]),
});

export function runNativeReleaseOwner(domain) {
  const owners = RELEASE_V2_OWNERS[domain];
  const science = RELEASE_SCIENTIFIC_TESTS[domain];
  if (!owners?.length || !science?.length) {
    throw new Error(`No native-v2 browser and scientific contract owner for ${domain}`);
  }
  const env = {
    ...process.env,
    WAFERCAD_V2_BASE:
      process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL || 'http://127.0.0.1:4173',
  };
  const commands = [
    { name: 'Node scientific invariants', args: ['--test', ...science] },
    ...owners.map((name) => ({ name, args: [name] })),
  ];
  for (const { name, args } of commands) {
    console.log(`NATIVE_RELEASE_OWNER ${domain}: ${name}`);
    const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const status = result.status ?? 'signal';
      throw new Error(`Native Release ${domain} owner failed: ${name} (${status})`);
    }
  }
  console.log(`Native v2 ${domain} release-science owner PASS`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runNativeReleaseOwner(process.argv[2]);
}
