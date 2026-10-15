import { readFile } from 'node:fs/promises';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

// Render-only morphology: every project keeps the ideal region-stack geometry.
export async function pr250AuditFixtures() {
  await loadGeometryKernel();
  const { applyOperation, createModel } = await import('../site/model.js');
  const { CURRENT_PROJECT_VERSION } = await import('../site/project-schema.js');
  const { circleMulti, difference, rectMulti } = await import('../site/vector-geometry.js');
  const fixtures = [];
  const specs = ['rect', 'ring'].flatMap((shape) =>
    ['stochastic', 'pyramid'].map((morphology) => ({ shape, morphology, face: 'front' })),
  );
  if (process.env.WAFERCAD_AUDIT_EXTENDED === '1') {
    for (const shape of ['polygon', 'sector'])
      for (const morphology of ['smooth', 'stochastic', 'pyramid'])
        specs.push({ shape, morphology, face: 'front' });
    for (const shape of ['rect', 'ring'])
      specs.push({ shape, morphology: 'smooth', face: 'front' });
    for (const face of ['back', 'both'])
      specs.push({ shape: 'rect', morphology: 'stochastic', face });
  }
  for (const { shape, morphology, face } of specs) {
    const model = createModel({ shape: 'rect', width: 20, height: 14, thickness: 4 });
    const area =
      shape === 'ring'
        ? difference(circleMulti(15, 15, 64), circleMulti(7, 7, 48))
        : shape === 'polygon'
          ? [
              [
                [
                  [-7, -5],
                  [4, -6],
                  [7, 0],
                  [3, 6],
                  [-6, 4],
                  [-7, -5],
                ],
              ],
            ]
          : shape === 'sector'
            ? [
                [
                  [
                    [0, 0],
                    ...Array.from({ length: 49 }, (_, i) => {
                      const angle = ((-120 + i * 5) * Math.PI) / 180;
                      return [7 * Math.cos(angle), 7 * Math.sin(angle)];
                    }),
                    [0, 0],
                  ],
                ],
              ]
            : rectMulti(12, 14);
    applyOperation(model, {
      type: 'etch',
      face,
      thickness: 0.9,
      area,
      surface:
        morphology === 'smooth'
          ? undefined
          : {
              kind: 'rough',
              morphology,
              polarity: 'normal',
              featureSize: 0.7,
              meanHeight: 0.35,
              etchDepth: 0.9,
              featureCv: 0.25,
              heightCv: 0.3,
              seed: 20261015,
              geometryMode: 'ideal',
            },
    });
    const project = projectForBenchmark({ model, section: { a: [-9, 0], b: [9, 0] } });
    const name = `${shape}-${morphology}${face === 'front' ? '' : `-${face}`}`;
    fixtures.push({ name: `${name}-exposed`, project, clip: null });
    const buried = structuredClone(model);
    applyOperation(buried, {
      type: 'add',
      name: 'Audit coat',
      thickness: 0.6,
      face,
      area,
      growth: 'direct',
    });
    fixtures.push({
      name: `${name}-roi`,
      project: projectForBenchmark({ model: buried, section: project.section }),
      clip: rectMulti(15, 8, 0, -2),
    });
  }
  if (process.env.WAFERCAD_AUDIT_PHOTODETECTOR === '1') {
    const { expandProjectStorage } = await import('../site/project-io.js');
    const stored = JSON.parse(
      await readFile(
        new URL('../site/examples/photodetector-literature-examples.wafercad', import.meta.url),
        'utf8',
      ),
    );
    const example = expandProjectStorage(stored);
    fixtures.push({
      name: 'photodetector-blacksi-final-roi',
      project: projectForBenchmark({
        model: example.model,
        section: example.section,
      }),
      clip: rectMulti(800, 300, 2400, 0),
    });
    // Twelve-micrometre patch straddling the black-Si active-ring boundary.
    // It provides a physically meaningful 0.3 um feature-size reference without
    // changing the full-scale project or increasing the global triangle budget.
    fixtures.push({
      name: 'photodetector-blacksi-final-micro-roi',
      project: projectForBenchmark({
        model: example.model,
        section: example.section,
      }),
      clip: rectMulti(12, 12, 2495, 0),
    });
  }
  for (const fixture of fixtures) fixture.project.version = CURRENT_PROJECT_VERSION;
  return fixtures;
}
