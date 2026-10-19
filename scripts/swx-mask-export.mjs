/** First-pass SWX mask GDS/SVG export using the production layout writer.
 *  IMPORTANT: this is a geometry-DRAFT, not author mask or a process replay.
 *  node scripts/swx-mask-export.mjs [output-directory]
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { buildSwxMaskLayout, renderSwxMaskSvg } from './swx-mask-blueprint.mjs';
import { serializeGDS } from '../site/layout-export.js';
import { parseGDS, flattenGDS } from '../site/gds.js';

export async function exportSwxDraft(outDir = 'test-results/swx-mask-draft') {
  const mask = buildSwxMaskLayout();
  const polygons = mask.elements.map(({ kind, layer, datatype, points }) => ({
    kind, layer, datatype, points,
  }));
  assert.ok(polygons.length > 300);
  assert.equal(polygons.filter((p) => p.layer === 2).length, 0);
  assert.equal(polygons.filter((p) => p.layer === 3).length, 21);
  for (const name of ['GROUND_METAL_PAD','SIGNAL_METAL_PAD']) {
    assert.equal(mask.elements.filter((p) => p.name === name && p.layer === 3).length, 1,
      'missing source-labelled peripheral pad '+name);
  }
  for (const id of ['GROUND_UPPER','GROUND_LEFT','GROUND_LOWER','SIGNAL_RIGHT']) {
    assert.equal(mask.elements.filter(e => e.name === 'PERIMETER_'+id+'_CR_AU' &&
      e.layer === 3).length, 1, 'missing broad supported pad '+id);
  }
  const raw = serializeGDS(polygons, { cellName: 'SWX_UNIT_MASK_V0' });
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const parsed = parseGDS(ab);
  const roundtrip = flattenGDS(parsed, parsed.root);
  assert.ok(roundtrip.units?.hasPhysicalUnits, 'GDS must have real physical units');
  assert.equal(roundtrip.elements.length, polygons.length, 'GDS polygon count must survive');
  const byLayer = (entries, layer) => entries.filter((e) => e.layer === layer).length;
  for (const layer of [1, 3]) {
    assert.equal(byLayer(roundtrip.elements, layer), byLayer(polygons, layer));
  }
  // Minimum source feature: SWT pitch=290 nm, lateral depth=300 nm,
  // stopper final ON air gap=15 nm: reject any future DBU too coarse for 15 nm.
  assert.ok(roundtrip.units.dbuToMicron <= 0.001, 'GDS precision must be <= 1 nm');
  const target = resolve(outDir);
  await mkdir(target, { recursive: true });
  await Promise.all([
    writeFile(join(target, 'swx-unit-off-mask-draft.gds'), raw),
    writeFile(join(target, 'swx-unit-off-mask-draft.svg'), renderSwxMaskSvg(mask)),
    writeFile(join(target, 'manifest.json'), JSON.stringify({
      sourceDoi: mask.paper.doi,
      kind: 'engineering reconstruction; not author mask',
      units: roundtrip.units,
      counts: mask.combos,
      bounds: mask.bounds,
      statusChecks: mask.statusChecks,
      limitations: ['No full wafer process', 'No selective BOX release', 'No mechanical FEM',
        'No real native Chromium acceptance', 'No FDTD', 'No authors GDS'],
    }, null, 2) + '\n')
  ]);
  return { target, mask, elements: polygons.length, precisionUm: roundtrip.units.dbuToMicron };
}

if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  exportSwxDraft(process.argv[2]).then(x =>
    process.stdout.write(JSON.stringify({ output: x.target, elements: x.elements,
      precisionUm: x.precisionUm }, null, 2) + '\n')
  ).catch(e => { process.stderr.write(String(e.stack || e) + '\n'); process.exitCode = 1; });
}
