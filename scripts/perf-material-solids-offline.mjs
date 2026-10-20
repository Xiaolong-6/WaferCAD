#!/usr/bin/env node
// Exact published-project topology profiler. Offline Node only: these numbers
// exclude Workstation bootstrap, 3D mesh assembly, WebGL and first paint.
// Usage: node scripts/perf-material-solids-offline.mjs --example m3d-selfpowered-full-replay
//        --expected-sha256 <full-plan-hash> [--mode plan|solids]
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function argumentsForRun(args) {
  const options = {
    site: resolve(dirname(fileURLToPath(import.meta.url)), '../site'),
    example: 'm3d-selfpowered-full-replay',
    mode: 'plan',
    expected: null,
  };
  const names = {
    '--site': 'site',
    '--example': 'example',
    '--mode': 'mode',
    '--expected-sha256': 'expected',
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    if (!key || i + 1 >= args.length) throw new Error(`Invalid argument: ${args[i]}`);
    options[key] = args[i + 1];
  }
  if (!['plan', 'solids'].includes(options.mode)) throw new Error('Mode must be plan or solids.');
  if (!/^[a-z0-9-]+$/.test(options.example)) throw new Error('Example must be a safe catalog ID.');
  if (options.expected && !/^[0-9a-f]{64}$/i.test(options.expected)) {
    throw new Error('Expected SHA-256 must be 64 hex characters.');
  }
  options.site = resolve(options.site);
  return options;
}

function inputStats(operands) {
  let polygons = 0,
    points = 0;
  for (const geom of operands) {
    polygons += geom.length;
    for (const polygon of geom) {
      for (const ring of polygon) points += ring.length;
    }
  }
  return { polygons, points };
}

const options = argumentsForRun(process.argv.slice(2));
const vendor = await readFile(join(options.site, 'vendor/polygon-clipping.umd.js'), 'utf8');
const module = { exports: {} };
new Function('module', 'exports', vendor)(module, module.exports);

const kernel = module.exports;
const metrics = Object.fromEntries(
  ['union', 'difference', 'intersection'].map((operation) => [
    operation,
    {
      calls: 0,
      kernelMs: 0,
      maxMs: 0,
    },
  ]),
);
const slowest = [];
for (const operation of Object.keys(metrics)) {
  const original = kernel[operation];
  kernel[operation] = (...operands) => {
    const start = performance.now();
    try {
      return original(...operands);
    } finally {
      const elapsed = performance.now() - start;
      const stat = metrics[operation];
      stat.calls += 1;
      stat.kernelMs += elapsed;
      stat.maxMs = Math.max(stat.maxMs, elapsed);
      if (slowest.length < 10 || elapsed > slowest.at(-1).ms) {
        const { polygons, points } = inputStats(operands);
        slowest.push({
          operation,
          ms: elapsed,
          operands: operands.length,
          polygons,
          points,
        });
        slowest.sort((a, b) => b.ms - a.ms);
        if (slowest.length > 10) slowest.pop();
      }
    }
  };
}
globalThis.polygonClipping = kernel;

const { expandProjectStorage } = await import(pathToFileURL(join(options.site, 'project-io.js')));
const { migrateProjectFile } = await import(pathToFileURL(join(options.site, 'project-schema.js')));
const { buildRenderSurfacePlan } = await import(
  pathToFileURL(join(options.site, 'renderer-geometry.js'))
);
const { materialSolidsFromTopology } = await import(
  pathToFileURL(join(options.site, 'process-topology.js'))
);
const file = join(options.site, 'examples', `${options.example}.wafercad`);
const projectBytes = await readFile(file);
const projectSha256 = createHash('sha256').update(projectBytes).digest('hex');
const model = migrateProjectFile(
  expandProjectStorage(JSON.parse(projectBytes.toString('utf8'))),
).model;

const gc = { events: 0, observedMs: 0 };
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gc.events++;
    gc.observedMs += entry.duration;
  }
});
observer.observe({ entryTypes: ['gc'] });
const start = performance.now();
const output =
  options.mode === 'plan' ? buildRenderSurfacePlan(model) : materialSolidsFromTopology(model);
const elapsedMs = performance.now() - start;
// V8 delivers GC performance entries asynchronously; flush them before
// computing the output hash, which is deliberately outside the timed stage.
// GC timings are approximate and overlap with measured Boolean wall time.
await new Promise((resolve) => setTimeout(resolve, 25));
observer.disconnect();
const sha256 = createHash('sha256').update(JSON.stringify(output)).digest('hex');
const report = {
  example: options.example,
  mode: options.mode,
  inputSha256: projectSha256,
  outputSha256: sha256,
  matchesExpected: options.expected ? sha256 === options.expected : null,
  elapsedMs,
  rssMiB: process.memoryUsage().rss / 1048576,
  gc,
  counts:
    options.mode === 'plan'
      ? {
          caps: output.caps.length,
          sidewalls: output.sidewalls.length,
          borderLines: output.borderLines.length,
        }
      : {
          materials: output.length,
          slabs: output.reduce((n, item) => n + item.slabs.length, 0),
        },
  kernelMetrics: metrics,
  slowestKernelCalls: slowest,
};
console.log(JSON.stringify(report, null, 2));
if (report.matchesExpected === false) process.exitCode = 1;
