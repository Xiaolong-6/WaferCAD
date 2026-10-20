#!/usr/bin/env node
// Per-layer exact material topology cost attribution, never a browser/first-paint metric.
// Usage: node scripts/perf-material-layer-offline.mjs [--example <catalog-id>]
//        [--layer <layer-id>] [--verify] [--boolean-stats]
//        [--expected-sha256 <64 hex digits>]
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadGeometryKernel } from './process-benchmarks.mjs';

const options = {
  example: 'm3d-selfpowered-full-replay',
  layer: null,
  verify: false,
  booleanStats: false,
  expected: null,
};
const names = { '--example': 'example', '--layer': 'layer', '--expected-sha256': 'expected' };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--verify' || arg === '--boolean-stats') {
    options[arg === '--verify' ? 'verify' : 'booleanStats'] = true;
    continue;
  }
  if (!names[arg] || i + 1 >= process.argv.length) throw new Error('Invalid option: ' + arg);
  options[names[arg]] = process.argv[++i];
}
if (
  !/^[a-z0-9-]+$/.test(options.example) ||
  (options.layer && !/^[a-zA-Z0-9_-]+$/.test(options.layer))
) {
  throw new Error('Example and layer must be safe catalog/entity identifiers.');
}
if (options.expected && !/^[a-f0-9]{64}$/i.test(options.expected)) {
  throw new Error('Expected SHA-256 must be 64 hexadecimal characters.');
}

await loadGeometryKernel();
// Optional operation-level timings only, with the real production Boolean
// functions and no changed source geometry. Instrumented wall times include
// profiler overhead and should not be compared to non-instrumented runs.
const booleanMetrics = options.booleanStats
  ? Object.fromEntries(
      ['union', 'difference', 'intersection'].map((name) => [
        name,
        { calls: 0, kernelMs: 0, maxMs: 0 },
      ]),
    )
  : null;
const slowestBooleanCalls = [];
if (booleanMetrics) {
  const kernel = globalThis.polygonClipping;
  for (const operation of Object.keys(booleanMetrics)) {
    const original = kernel[operation];
    kernel[operation] = (...operands) => {
      const started = performance.now();
      try {
        return original(...operands);
      } finally {
        const ms = performance.now() - started;
        const current = booleanMetrics[operation];
        current.calls++;
        current.kernelMs += ms;
        current.maxMs = Math.max(current.maxMs, ms);
        if (slowestBooleanCalls.length < 5 || ms > slowestBooleanCalls.at(-1).ms) {
          slowestBooleanCalls.push({
            operation,
            ms,
            polygons: operands.reduce(
              (total, geom) => total + (Array.isArray(geom) ? geom.length : 0),
              0,
            ),
          });
          slowestBooleanCalls.sort((a, b) => b.ms - a.ms);
          if (slowestBooleanCalls.length > 5) slowestBooleanCalls.pop();
        }
      }
    };
  }
}
const { expandProjectStorage } = await import('../site/project-io.js');
const { migrateProjectFile } = await import('../site/project-schema.js');
const { materialSolidsFromTopology } = await import('../site/process-topology.js');
const file = new URL('../site/examples/' + options.example + '.wafercad', import.meta.url);
const bytes = await readFile(file);
const inputSha256 = createHash('sha256').update(bytes).digest('hex');
const model = migrateProjectFile(expandProjectStorage(JSON.parse(bytes.toString('utf8')))).model;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids = [
  ...new Set(model.regions.flatMap((region) => region.stack.map((segment) => segment.layerId))),
];
if (options.layer && !ids.includes(options.layer))
  throw new Error('Layer is absent: ' + options.layer);

function layerModel(layerId) {
  // Preserve source region iteration order, geometry identities and physical Z.
  // No Boolean shortcuts or fabricated geometry are used by this diagnostic.
  return {
    ...model,
    regions: model.regions.flatMap((region) => {
      const stack = region.stack.filter((segment) => segment.layerId === layerId);
      return stack.length ? [{ ...region, stack }] : [];
    }),
  };
}

const measurements = [];
for (const layerId of options.layer ? [options.layer] : ids) {
  if (booleanMetrics) {
    for (const stats of Object.values(booleanMetrics)) {
      stats.calls = 0;
      stats.kernelMs = 0;
      stats.maxMs = 0;
    }
    slowestBooleanCalls.length = 0;
  }
  const source = layerModel(layerId);
  const started = performance.now();
  const result = materialSolidsFromTopology(source);
  const elapsedMs = performance.now() - started;
  if (result.length !== 1 || result[0].layerId !== layerId) {
    throw new Error('Isolated topology did not return exactly one ' + layerId + ' material.');
  }
  measurements.push({
    layerId,
    regions: source.regions.length,
    slabs: result[0].slabs.length,
    caps: result[0].caps.length,
    sha256: hash(result[0]),
    elapsedMs,
    ...(booleanMetrics
      ? {
          booleanMetrics: structuredClone(booleanMetrics),
          slowestBooleanCalls: structuredClone(slowestBooleanCalls),
        }
      : {}),
  });
}

let fullVerification = null;
if (options.verify) {
  const start = performance.now();
  const full = materialSolidsFromTopology(model);
  const fullByLayer = new Map(full.map((item) => [item.layerId, hash(item)]));
  for (const item of measurements) {
    if (fullByLayer.get(item.layerId) !== item.sha256) {
      throw new Error('Per-layer derivation differs from full material solids: ' + item.layerId);
    }
  }
  if (!options.layer && measurements.length !== full.length) {
    throw new Error('Layer attribution omitted a material from the complete topology.');
  }
  fullVerification = { matches: true, elapsedMs: performance.now() - start, sha256: hash(full) };
}
if (
  options.expected &&
  (measurements.length !== 1 || measurements[0].sha256 !== options.expected)
) {
  throw new Error('Selected layer SHA-256 does not match the expected full-precision receipt.');
}
console.log(
  JSON.stringify(
    {
      example: options.example,
      inputSha256,
      fullVerification,
      layers: measurements,
      totalIsolatedMs: measurements.reduce((sum, item) => sum + item.elapsedMs, 0),
      peakRssMiB: process.resourceUsage().maxRSS / (process.platform === 'darwin' ? 1048576 : 1024),
    },
    null,
    2,
  ),
);
