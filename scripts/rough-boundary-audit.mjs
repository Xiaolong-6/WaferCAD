import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const current = await import('../site/rough-mesh-geometry.js');
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const baselineRef = argument('--baseline', 'f76c8e02a2e9944dcea72ea1db3410727bb9a67d'),
  output = argument('--output', 'output/playwright/pr250-audit/geometry-cpu-performance.json'),
  original = execFileSync('git', ['show', `${baselineRef}:site/rough-mesh-geometry.js`], {
    encoding: 'utf8',
  }).replace(
    /from '(\.\/[^']+)'/g,
    (_, relative) => `from '${pathToFileURL(path.resolve('site', relative)).href}'`,
  ),
  baseline = await import(
    `data:text/javascript;base64,${Buffer.from(original).toString('base64')}`
  ),
  ring = (radius) =>
    Array.from({ length: 33 }, (_, index) => [
      radius * Math.cos((index * Math.PI) / 16),
      radius * Math.sin((index * Math.PI) / 16),
    ]),
  base = current.roughCapBaseTriangles(THREE, 0, 1, [[ring(2), ring(1).reverse()]]),
  task = {
    z: 0,
    normal: 1,
    closeToIdeal: false,
    gpuDisplacement: true,
    appearance: {
      kind: 'rough',
      morphology: 'stochastic',
      polarity: 'inverted',
      featureSize: 0.1,
      meanHeight: 0.1,
      etchDepth: 0.2,
      featureCv: 0.2,
      heightCv: 0.1,
      seed: 21,
    },
    lodZones: base.triangles.map((triangle, index) => ({
      baseTriangles: [triangle],
      edges: current.roughBoundaryEdgesFromTriangles([triangle]),
      maxEdge: base.maxEdge,
      triangleBudget: index % 2 ? 16 : 256,
      lodContext: {
        distance: 1,
        viewportWidth: 1100,
        viewportHeight: 800,
        visibleFraction: 1,
        roiFraction: 1,
        screenPriority: 1,
        maxDepth: 4,
      },
    })),
  },
  report = {
    node: process.version,
    platform: process.platform,
    baselineRef,
    fixture: {
      shape: '32-edge-ring',
      innerRadiusUm: 1,
      outerRadiusUm: 2,
      zoneBudgets: [16, 256],
      appearance: task.appearance,
      iterations: 25,
      warmup: 5,
    },
    results: {},
  };

// This isolates CPU mesh preparation. Browser frame, worker and GPU costs are
// independently measured by the renderer product acceptance suite.
for (const [name, module] of [
  ['before', baseline],
  ['after', current],
]) {
  const durations = [];
  let result;
  for (let iteration = 0; iteration < 25; iteration++) {
    const start = performance.now();
    result = module.roughMeshDataFromPreparedCap(task);
    if (iteration >= 5) durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  report.results[name] = {
    medianMs: durations[10],
    p95Ms: durations[18],
    triangles: result.positions.length / 9,
    conformingExtraTriangles: result.metadata.roughConformingExtraTriangles || 0,
    typedBufferBytes: [
      'positions',
      'normals',
      'gpuDisplace',
      'roughBorderPositions',
      'roughBoundaryPositions',
    ].reduce((sum, key) => sum + (result[key]?.byteLength || 0), 0),
  };
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
