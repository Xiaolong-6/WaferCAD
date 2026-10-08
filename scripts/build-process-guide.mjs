import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PROCESS_GUIDE } from '../site/process-guide.js';

// Generate Wiki operations from exactly the data rendered in the Process panel.
// --check is read-only and fails on drift; --write regenerates the tracked page.
export function processOperationsMarkdown(operations = PROCESS_GUIDE) {
  const lines = [
    '# Process Operations',
    '',
    '[Home](Home) · [Process and Recipes](Process-and-Recipes) · [Interactive Before → After diagrams](https://xiaolong-6.github.io/WaferCAD/guide/)',
    '',
    '> All diagrams are schematic. WaferCAD is a geometric process editor, not a calibrated process/electrical TCAD simulator.',
    '',
    'The contextual schematic under **Apply** and this page use the same Process catalog. The current Area selection and active Mask ROI still control the real operation footprint.',
    '',
  ];
  let family = '';
  for (const entry of operations) {
    if (entry.family !== family) {
      family = entry.family;
      lines.push('## ' + family, '');
    }
    lines.push('<a id="' + entry.id + '"></a>', '### ' + entry.title, '');
    lines.push('**Behavior:** ' + entry.summary, '', entry.detail, '');
    lines.push('**Inputs:** ' + entry.parameters, '');
    lines.push(
      '**Changes:** ' +
        ({
          geometry: 'canonical material geometry',
          display: 'display morphology only (ideal 2.5D stack unchanged)',
          annotation: 'non-material annotation only',
          history: 'History metadata only',
        }[entry.effect] || entry.effect),
      '',
    );
    lines.push('**Modeling boundary:** ' + entry.limits, '');
    lines.push('**Example:** ' + entry.example, '');
    lines.push(
      '[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#' + entry.id + ')',
      '',
    );
  }
  lines.push(
    '## More documentation',
    '',
    'See [Mask and ROI](Masks-and-ROI), [History and Recovery](History-Variants-and-Recovery), and [Examples and Modeling Limits](Examples-and-Modeling-Limits).',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const path = join('docs', 'wiki', 'Process-Operations.md');
  const expected = processOperationsMarkdown();
  const mode = process.argv[2] || '--check';
  if (mode === '--write') {
    await writeFile(path, expected, 'utf8');
    console.log('Wrote ' + path + ' (' + PROCESS_GUIDE.length + ' operations)');
  } else if (mode === '--check') {
    let actual;
    try {
      actual = await readFile(path, 'utf8');
    } catch {
      throw Error(path + ' missing. Run npm run docs:build.');
    }
    if (actual !== expected)
      throw Error(
        path + ' drifted from site/process-guide.js. Run npm run docs:build and commit the output.',
      );
    const pages = [
      'Home',
      'Getting-Started',
      'Workspace-and-Views',
      'Masks-and-ROI',
      'Process-and-Recipes',
      'History-Variants-and-Recovery',
      'Import-and-Export',
      'Examples-and-Modeling-Limits',
      'Troubleshooting',
      '_Sidebar',
    ];
    for (const name of pages) await access(join('docs', 'wiki', name + '.md'));
    console.log(
      'Product manual checked: ' +
        PROCESS_GUIDE.length +
        ' operation descriptions and ' +
        pages.length +
        ' product chapters',
    );
  } else throw Error('Usage: node scripts/build-process-guide.mjs --check|--write');
}

if (process.argv[1]?.endsWith('build-process-guide.mjs')) await main();
