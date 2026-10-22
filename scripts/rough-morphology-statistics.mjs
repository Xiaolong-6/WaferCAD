// Deterministic scientific diagnostics for the saved rough heightfield.
// This is a spatial sampling audit, not a renderer or Section/3D visual substitute.
import { pathToFileURL } from 'node:url';
import { roughProfileOffsetAtPoint } from '../site/surface-rendering.js';

export function profileSpatialStatistics(
  appearance,
  { x = 2491.8, y = -3.2, samples = 256, pitch = 0.025, lags = [1, 2, 4, 8, 16, 32] } = {},
) {
  if (!Number.isInteger(samples) || samples < 8 || samples > 512) {
    throw Error('Spatial samples must be an integer from 8 to 512');
  }
  if (!(Number.isFinite(pitch) && pitch > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw Error('Spatial sample coordinates and pitch must be finite');
  }
  if (lags.some((lag) => !Number.isInteger(lag) || lag < 1 || lag >= samples)) {
    throw Error('Spatial lags must fit the sample grid');
  }
  if (appearance?.kind !== 'rough') throw Error('A physical rough appearance is required');

  const heights = new Float64Array(samples * samples);
  let sum = 0,
    sum2 = 0,
    lowest = Infinity,
    highest = -Infinity;
  for (let row = 0; row < samples; row++) {
    for (let col = 0; col < samples; col++) {
      const value = roughProfileOffsetAtPoint(x + col * pitch, y + row * pitch, appearance);
      if (!Number.isFinite(value)) throw Error('Non-finite physical rough height');
      heights[row * samples + col] = value;
      sum += value;
      sum2 += value * value;
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
  }
  const total = heights.length,
    mean = sum / total,
    stddev = Math.sqrt(Math.max(0, sum2 / total - mean * mean)),
    correlations = lags.map((lag) => {
      const axisCorrelation = (stepX, stepY) => {
        let a = 0,
          b = 0,
          aa = 0,
          bb = 0,
          ab = 0,
          count = 0;
        for (let row = 0; row < samples - stepY; row++) {
          for (let col = 0; col < samples - stepX; col++) {
            const v = heights[row * samples + col],
              w = heights[(row + stepY) * samples + col + stepX];
            a += v;
            b += w;
            aa += v * v;
            bb += w * w;
            ab += v * w;
            count++;
          }
        }
        const covariance = ab - (a * b) / count,
          varianceA = aa - (a * a) / count,
          varianceB = bb - (b * b) / count;
        return varianceA > 0 && varianceB > 0
          ? Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceA * varianceB)))
          : 1;
      };
      return {
        distanceUm: lag * pitch,
        x: axisCorrelation(lag, 0),
        y: axisCorrelation(0, lag),
      };
    });
  return {
    morphology: appearance.morphology,
    featureSizeUm: appearance.featureSize,
    featureCv: appearance.featureCv,
    heightCv: appearance.heightCv,
    seed: appearance.seed,
    grid: { xUm: x, yUm: y, samples, pitchUm: pitch },
    height: { meanUm: mean, standardDeviationUm: stddev, minUm: lowest, maxUm: highest },
    correlations,
  };
}

async function runCli(args) {
  if (args.length > 1 || (args.length && args[0].startsWith('-'))) {
    throw Error('Usage: node scripts/rough-morphology-statistics.mjs [photodetector.wafercad]');
  }
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const { loadGeometryKernel } = await import('./process-benchmarks.mjs');
  await loadGeometryKernel();
  const { expandProjectStorage } = await import('../site/project-io.js');
  const path = args[0] || 'site/examples/photodetector-literature-examples.wafercad';
  const projectBytes = await readFile(resolve(path));
  const { createHash } = await import('node:crypto');
  const model = expandProjectStorage(JSON.parse(projectBytes.toString())).model;
  const profile = model.regions
    .flatMap((region) => region.stack || [])
    .map((segment) => segment.frontSurface)
    .find((surface) => surface?.kind === 'rough');
  if (!profile) throw Error('Project contains no front-side rough profile');
  const before = JSON.stringify(model);
  const results = ['stochastic', 'stochastic-v2'].map((morphology) =>
    profileSpatialStatistics({ ...profile, morphology }),
  );
  if (JSON.stringify(model) !== before) throw Error('Read-only sampling modified the model');
  console.log(
    JSON.stringify(
      {
        project: path,
        projectSha256: createHash('sha256').update(projectBytes).digest('hex'),
        originalMorphology: profile.morphology,
        results,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
