import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { serializeGDS, serializeOASIS } = await import('../site/layout-export.js');

const output = path.resolve(process.argv[2] || 'test-results/klayout-export');
await mkdir(output, { recursive: true });

const elements = [
  {
    kind: 'polygon',
    layer: 1,
    datatype: 0,
    points: [
      [-5, -4],
      [7, -4],
      [7, 6],
      [-5, 6],
    ],
  },
  {
    kind: 'polygon',
    layer: 7,
    datatype: 3,
    points: [
      [10, 2],
      [14, 2],
      [14, 8],
      [10, 8],
    ],
  },
  {
    kind: 'path',
    layer: 4,
    datatype: 2,
    width: 0.8,
    points: [
      [-3, 10],
      [3, 12],
      [9, 10],
    ],
  },
];

await writeFile(path.join(output, 'wafercad-export.gds'), serializeGDS(elements));
await writeFile(path.join(output, 'wafercad-export.oas'), serializeOASIS(elements));
console.log(output);
