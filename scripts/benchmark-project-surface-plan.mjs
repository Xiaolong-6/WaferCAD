// Strict saved-project surface-plan benchmark: real portable Project IO and the
// same material topology path as the Workstation renderer. Does not edit files.
// Pass 1x1/4x4/Microdisk .wafercad paths as arguments; run a fresh Node process
// for each repeat to distinguish warm process cache from actual cold starts.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadGeometryKernel } from './process-benchmarks.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/benchmark-project-surface-plan.mjs project.wafercad [...]');
  process.exitCode = 2;
} else {
  await loadGeometryKernel();
  const [{ readProjectFile }, { buildRenderSurfacePlan }] = await Promise.all([
    import('../site/project-io.js'),
    import('../site/renderer-geometry.js'),
  ]);
  for (const file of files) {
    const bytes = await readFile(file);
    const begin = performance.now();
    const project = await readProjectFile(new Blob([bytes]));
    const projectReady = performance.now();
    const plan = buildRenderSurfacePlan(project.model);
    const planReady = performance.now();
    const geometrySha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    console.log(
      JSON.stringify({
        file,
        projectBytes: bytes.length,
        projectReadMs: Math.round(projectReady - begin),
        surfacePlanMs: Math.round(planReady - projectReady),
        caps: plan.caps.length,
        sidewalls: plan.sidewalls.length,
        borderLines: plan.borderLines.length,
        geometrySha256,
      }),
    );
  }
}
