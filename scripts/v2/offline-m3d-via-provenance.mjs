#!/usr/bin/env node
// Read-only physical Section evidence. Publication-specific via masks are unverified.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel } from '../process-benchmarks.mjs';

const cuts = [
  { id: 'power-a', y: -5.3 },
  { id: 'power-b', y: 5.3 },
  { id: 'data', y: 0 },
];
const digest = (source) => createHash('sha256').update(source).digest('hex');
const n12 = (number) => Number(number.toFixed(12));
const normalize = (slice) => ({
  layerId: slice.layerId,
  t0: n12(slice.t0),
  t1: n12(slice.t1),
  z0: n12(slice.z0),
  z1: n12(slice.z1),
});
const order = (a, b) =>
  a.t0 - b.t0 || a.t1 - b.t1 || a.z0 - b.z0 || a.layerId.localeCompare(b.layerId);
const escapeXml = (str) =>
  String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function svg(cut, layers) {
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">',
    '<rect width="1200" height="520" fill="#fff"/>',
    `<text x="64" y="32" font-family="sans-serif" font-size="19">M3D native Section: ${cut.id} (Y=${cut.y} µm)</text>`,
    '<text x="64" y="55" font-family="sans-serif" font-size="12">X: 12–20 µm  |  Z: 1.05–1.43 µm (expanded vertical scale)</text>',
    '<defs><clipPath id="viewport"><rect x="64" y="70" width="1070" height="344"/></clipPath></defs>',
    '<rect x="64" y="70" width="1070" height="344" fill="#f8fafc" stroke="#475569"/>',
    '<g clip-path="url(#viewport)">',
  ];
  const xp = (t) => 64 + t * 1070;
  const zp = (z) => 70 + ((1.43 - z) * 344) / 0.38;
  for (const s of cut.slices) {
    const low = Math.max(s.z0, 1.05),
      high = Math.min(s.z1, 1.43);
    if (high <= low || s.t1 <= s.t0) continue;
    parts.push(
      `<rect x="${xp(s.t0)}" y="${zp(high)}" width="${xp(s.t1) - xp(s.t0)}" height="${zp(low) - zp(high)}" fill="${layers[s.layerId]?.color || '#94a3b8'}"/>`,
    );
  }
  parts.push(
    '</g>',
    '<line x1="599" x2="599" y1="70" y2="414" stroke="#be123c" stroke-dasharray="6 4"/>',
    '<text x="64" y="452" font-family="sans-serif" font-size="12">Probe x=16 µm; source Model material intervals, not SEM or author mask reconstruction</text>',
    `<text x="64" y="474" font-family="sans-serif" font-size="11">${escapeXml(cut.probeMaterials.join(' | '))}</text>`,
    '</svg>',
  );
  return parts.join('\n') + '\n';
}

export async function inspectM3dViaProvenance(output = null) {
  await loadGeometryKernel();
  const [{ readProjectFile }, { sectionSlices }, { pointInMulti }] = await Promise.all([
    import('../../site/project-io.js'),
    import('../../site/model-view-geometry.js'),
    import('../../site/vector-geometry.js'),
  ]);
  const bytes = await readFile(
    new URL('../../site/examples/m3d-selfpowered-full-replay.wafercad', import.meta.url),
  );
  const project = await readProjectFile(new Blob([bytes], { type: 'application/json' }));
  const layers = Object.fromEntries(project.model.layers.map((layer) => [layer.id, layer]));
  const results = cuts.map(({ id, y }) => {
    const slices = sectionSlices(project.model, [12, y], [20, y]).map(normalize).sort(order);
    const owner = project.model.regions.find((region) => pointInMulti([16, y], region.geom));
    if (!owner || slices.length === 0)
      throw Error(`${id}: no physical material at requested via cut`);
    const probe = owner.stack.map(({ layerId, z0, z1 }) => ({ layerId, z0: n12(z0), z1: n12(z1) }));
    const sectionProbe = slices
      .filter((s) => s.t0 <= 0.5 && s.t1 >= 0.5)
      .map(({ layerId, z0, z1 }) => ({ layerId, z0, z1 }));
    if (JSON.stringify(probe) !== JSON.stringify(sectionProbe))
      throw Error(`${id}: native Section and original physical material owner disagree`);
    return {
      id,
      y,
      slices,
      probeMaterials: probe.map((p) => layers[p.layerId]?.name || p.layerId),
      sliceCount: slices.length,
      signature: digest(JSON.stringify(slices)),
    };
  });
  const [a, b, data] = results;
  if (a.signature !== b.signature || data.signature === a.signature)
    throw Error(
      'Published power-via equality or data-via distinction changed; source requires re-audit',
    );
  if (
    !a.probeMaterials.includes('M3D Ti power via 120nm') ||
    !data.probeMaterials.includes('M3D MoS2 bridge Ni 30nm')
  )
    throw Error('Incorrect physical power/data material ownership');
  const report = {
    schema: 'wafercad-m3d-source-via-provenance-v1',
    sourceSha256: digest(bytes),
    comparisonCoordinatePrecisionUm: 1e-12,
    powerCutsEquivalent: true,
    dataCutDistinct: true,
    distinctAuthorPowerViaVerified: false,
    authorMaskVerified: false,
    semComparisonVerified: false,
    cuts: results.map(({ id, y, sliceCount, signature, probeMaterials }) => ({
      id,
      y,
      sliceCount,
      signature,
      probeMaterials,
    })),
  };
  if (output) {
    await mkdir(resolve(output), { recursive: true });
    for (const cut of results)
      await writeFile(resolve(output, `m3d-${cut.id}.svg`), svg(cut, layers));
    await writeFile(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await inspectM3dViaProvenance(
    process.argv[2] || 'test-results/m3d-offline-provenance',
  );
  console.log(JSON.stringify(report));
}
