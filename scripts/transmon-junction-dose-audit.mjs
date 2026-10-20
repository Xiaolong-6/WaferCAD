import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGeometryKernel } from './process-benchmarks.mjs';
import { flattenGDS, parseGDS } from '../site/gds.js';

const AUTHOR_SHA256 = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';
const Q2_REF = [1400, 2513];
const CANDIDATE_LAYER = 8;
const round = (x) => Number(x.toFixed(6));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function polygonArea(ring) {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}
function multiArea(geometry) {
  return geometry.reduce(
    (sum, polygon) =>
      sum +
      polygonArea(polygon[0]) -
      polygon.slice(1).reduce((holes, ring) => holes + polygonArea(ring), 0),
    0,
  );
}
function keyFor(polygon) {
  const vertices = polygon.points.map(([x, y]) => round(x) + ',' + round(y)).sort();
  return polygon.layer + '/' + polygon.datatype + ':' + vertices.join(';');
}
function selectedShape(polygon) {
  return polygon.layer === CANDIDATE_LAYER && [0, 1].includes(polygon.datatype);
}

/** Strictly audits geometry and reticle transforms; process-dose labels are a hypothesis. */
export async function auditAuthorQ2Junction(bytes, options = {}) {
  await loadGeometryKernel();
  const { intersection, unionGeometries } = await import('../site/vector-geometry.js');
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = parseGDS(input);
  if (
    parsed.units.hasPhysicalUnits !== true ||
    Math.abs(parsed.units.metersPerDbu - 1e-9) > 1e-21
  ) {
    throw new Error('Author Q2 junction must have physical 1 nm database units.');
  }
  const chip = parsed.cells.get(options.chip || 'chip2');
  const junctionName = options.junction || 'jj_width0p18';
  if (!chip || !parsed.cells.has(junctionName))
    throw new Error('Missing expected author Q2 chip or junction cell.');
  const matchingRefs = chip.elements.filter(
    (e) =>
      e.kind === 'sref' &&
      e.name === junctionName &&
      e.xy?.[0] === Q2_REF[0] &&
      e.xy?.[1] === Q2_REF[1],
  );
  if (matchingRefs.length !== 1) throw new Error('Expected one unambiguous Q2 junction SREF.');
  const reference = matchingRefs[0];
  if (reference.angle !== 90 || reference.reflect || reference.mag !== 1) {
    throw new Error('Q2 junction reticle reference transform changed.');
  }
  const local = flattenGDS(parsed, junctionName).elements.filter(selectedShape);
  const retained = local.filter((e) => e.datatype === 0);
  const main = local.filter((e) => e.datatype === 1);
  if (!retained.length || !main.length) throw new Error('Both EBL dose datatypes must be present.');
  const geometry = (objects) => unionGeometries(objects.map((e) => [[e.points]]));
  const a = geometry(retained),
    b = geometry(main);
  const area0 = multiArea(a),
    area1 = multiArea(b);
  const overlap = multiArea(intersection(a, b));
  if (overlap > 1e-8) throw new Error('Original EBL exposure data types overlap unexpectedly.');
  const flatChip = flattenGDS(parsed, options.chip || 'chip2');
  const inLocalQ2 = flatChip.elements.filter(
    (e) =>
      selectedShape(e) &&
      e.points.some(([x, y]) => Math.abs(x - Q2_REF[0]) <= 25 && Math.abs(y - Q2_REF[1]) <= 25),
  );
  const expectedKeys = local
    .map((e) =>
      keyFor({
        ...e,
        points: e.points.map(([x, y]) => [Q2_REF[0] - y, Q2_REF[1] + x]),
      }),
    )
    .sort();
  const observedKeys = inLocalQ2.map(keyFor).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(observedKeys)) {
    throw new Error(
      'Q2 90-degree GDS rotation or absolute placement does not match chip hierarchy.',
    );
  }
  const counts = (objects) => ({
    layer: CANDIDATE_LAYER,
    polygons: objects.length,
    sourceCells: [...new Set(objects.map((e) => e.sourceCell))].sort(),
  });
  return {
    sourceSha256: sha256(bytes),
    sourceCells: parsed.cells.size,
    chipCell: options.chip || 'chip2',
    junctionCell: junctionName,
    junctionReferenceXYUm: Q2_REF,
    junctionReferenceRotationDeg: reference.angle,
    gdsDatabaseUnitNm: 1,
    localJunctionPolygons: local.length,
    selectedAbsoluteChipPolygons: inLocalQ2.length,
    layer8Datatype0: { ...counts(retained), areaUm2: round(area0) },
    layer8Datatype1: { ...counts(main), areaUm2: round(area1) },
    datatypesOverlapAreaUm2: round(overlap),
    maskWidthFromPaperNm: 180,
    interpretation: {
      layer8Datatype1: 'Likely high-dose 1000 µC/cm² junction strips; not author-confirmed',
      layer8Datatype0: 'Likely lower-dose 400 µC/cm² end undercuts; not author-confirmed',
      confidence:
        'geometry and Supplementary Fig. 1 support hypothesis; exposure layer map unverified',
    },
    scientificScope:
      'Source GDS geometry and transform only; no resist relief, evaporation or lift-off simulated',
  };
}

async function main(args) {
  const value = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? null : args[i + 1];
  };
  const input = value('--input'),
    output = value('--report');
  if (!input)
    throw new Error('Usage: --input Zenodo_files/sample.gds [--report Q2-exposure-audit.json]');
  const bytes = await readFile(input);
  if (sha256(bytes) !== AUTHOR_SHA256) throw new Error('Source GDS SHA-256 mismatch.');
  const report = await auditAuthorQ2Junction(bytes);
  if (
    report.localJunctionPolygons !== 17 ||
    report.layer8Datatype0.polygons !== 8 ||
    report.layer8Datatype1.polygons !== 9 ||
    report.selectedAbsoluteChipPolygons !== 17
  ) {
    throw new Error('Original Q2 Josephson-junction polygon baseline has changed.');
  }
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
