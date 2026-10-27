import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGDS, flattenGDS } from '../site/gds.js';

const decode = (b) => b.toString('ascii').replace(/\0+$/, '').trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');

function rec(type, datatype, data = Buffer.alloc(0)) {
  const output = Buffer.alloc(4 + data.length);
  output.writeUInt16BE(output.length, 0);
  output[2] = type;
  output[3] = datatype;
  data.copy(output, 4);
  return output;
}
function textRecord(type, s) {
  const b = Buffer.from(s, 'ascii');
  return rec(type, 6, b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b);
}
function records(bytes) {
  const result = [];
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 4 > bytes.length) throw Error('Truncated GDS record.');
    const len = bytes.readUInt16BE(offset);
    if (len < 4 || offset + len > bytes.length)
      throw Error('Invalid GDS record at ' + offset + '.');
    result.push({
      type: bytes[offset + 2],
      dataType: bytes[offset + 3],
      bytes: bytes.subarray(offset, offset + len),
    });
    offset += len;
  }
  return result;
}
function structures(source) {
  const input = records(source);
  const first = input.findIndex((r) => r.type === 0x05);
  const last = input.findIndex((r) => r.type === 0x04);
  if (first < 0 || last < 0) throw Error('Incomplete GDS library.');
  const cells = new Map();
  let i = first;
  while (i < last) {
    if (input[i].type !== 0x05) throw Error('Expected BGNSTR.');
    const a = i++;
    while (i < last && input[i].type !== 0x07) i++;
    if (i >= last) throw Error('Unterminated GDS structure.');
    const entries = input.slice(a, i + 1);
    const r = entries.find((r) => r.type === 0x06);
    if (!r) throw Error('Missing STRNAME.');
    const name = decode(r.bytes.subarray(4));
    if (cells.has(name)) throw Error('Duplicate cell: ' + name);
    cells.set(name, entries);
    i++;
  }
  return { prefix: input.slice(0, first), footer: input.slice(last), cells };
}
function elements(cell) {
  const out = [];
  for (let i = 0; i < cell.length; i++) {
    const t = cell[i].type;
    if (![0x08, 0x09, 0x0a, 0x0b].includes(t)) continue;
    const start = i++;
    while (i < cell.length && cell[i].type !== 0x11) i++;
    if (i >= cell.length) throw Error('Unterminated GDS element.');
    const part = cell.slice(start, i + 1);
    const pick = (type) => part.find((e) => e.type === type)?.bytes;
    const target = pick(0x12);
    out.push({
      kind: t,
      entries: part,
      name: target && decode(target.subarray(4)),
      xy: pick(0x10),
    });
  }
  return out;
}
function boundsOfXY(element) {
  if (!element.xy) throw Error('Boundary is missing XY.');
  const xy = element.xy;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (let i = 4; i + 7 < xy.length; i += 8) {
    const x = xy.readInt32BE(i) / 1000;
    const y = xy.readInt32BE(i + 4) / 1000;
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  }
  return [x1, y1, x2, y2];
}
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const bytesOf = (records) => records.map((r) => r.bytes);

/**
 * Original GDS 2/0 polygons within a Q2 search box plus the original Q2 JJ SREF.
 * Polygons intersecting the ROI are kept whole, not clipped or redrawn.
 * The original reticle-to-chip transform is not applied.
 */
export function extractQ2ROI(
  source,
  { chip = 'chip2', junction = 'jj_width0p18', center = [1400, 2513], radius = 500 } = {},
) {
  if (!Number.isFinite(radius) || radius <= 0) throw Error('ROI radius must be positive.');
  if (center.length !== 2 || !center.every(Number.isFinite)) throw Error('Invalid Q2 center.');
  const parsed = parseGDS(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.length),
  );
  if (parsed.units.metersPerDbu !== 1e-9) throw Error('Expected author GDS 1 nm DBU.');
  const { prefix, footer, cells } = structures(source);
  const parent = cells.get(chip);
  if (!parent) throw Error('Missing chip cell ' + chip);
  const parentRefs = elements(parent).filter((e) => e.kind === 0x0a || e.kind === 0x0b);
  const jjRef = parentRefs.find(
    (e) =>
      e.name === junction &&
      e.xy &&
      e.xy.readInt32BE(4) / 1000 === center[0] &&
      e.xy.readInt32BE(8) / 1000 === center[1],
  );
  if (!jjRef) throw Error('Junction ref/position mismatch: do not guess Q2.');
  const field = 'Unnamed_b0465f83';
  const baseRef = parentRefs.find((e) => e.name === field);
  if (!baseRef) throw Error('Expected original Nb-gap/perforation source reference.');
  if (boundsOfXY(baseRef)[0] !== 0 || boundsOfXY(baseRef)[1] !== 0)
    throw Error('Base reference has unexpected transform.');
  const data = cells.get(field);
  if (!data) throw Error('Missing mask background cell.');
  const area = [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius];
  const candidates = elements(data);
  const chosen = candidates.filter((e) => e.kind === 0x08 && overlap(boundsOfXY(e), area));
  if (!chosen.length) throw Error('No original Nb-mask polygons in ROI.');
  const selected = new Map();
  const visit = (name, lineage = new Set()) => {
    if (lineage.has(name)) throw Error('Recursive GDS cell: ' + name);
    if (selected.has(name)) return;
    const cell = cells.get(name);
    if (!cell) throw Error('Missing referenced junction cell: ' + name);
    const ancestry = new Set([...lineage, name]);
    for (const elem of elements(cell)) if (elem.name) visit(elem.name, ancestry);
    selected.set(name, cell);
  };
  visit(junction);

  const bgName = 'Q2_NB_OPENINGS_ROI';
  const bg = [
    data[0],
    { type: 0x06, bytes: textRecord(0x06, bgName) },
    ...chosen.flatMap((e) => e.entries),
    data.at(-1),
  ];
  const rootName = 'TRANSMON_Q2_ORIGINAL_ROI';
  const root = [
    parent[0],
    { type: 0x06, bytes: textRecord(0x06, rootName) },
    ...baseRef.entries.map((r) =>
      r.type === 0x12 ? { type: 0x12, bytes: textRecord(0x12, bgName) } : r,
    ),
    ...jjRef.entries,
    parent.at(-1),
  ];
  const output = Buffer.concat([
    ...bytesOf(prefix),
    ...bytesOf(bg),
    ...[...selected.values()].flatMap(bytesOf),
    ...bytesOf(root),
    ...bytesOf(footer),
  ]);
  const parsedOut = parseGDS(
    output.buffer.slice(output.byteOffset, output.byteOffset + output.length),
  );
  const flat = flattenGDS(parsedOut, rootName);
  const counts = {};
  for (const e of flat.elements) {
    const key = e.layer + '/' + e.datatype;
    counts[key] = (counts[key] || 0) + 1;
  }
  const originalJJ = flattenGDS(parsed, junction);
  const jjCounts = {};
  for (const e of originalJJ.elements) {
    const key = e.layer + '/' + e.datatype;
    jjCounts[key] = (jjCounts[key] || 0) + 1;
  }
  if (
    counts['2/0'] !== chosen.length ||
    Object.entries(jjCounts).some(([key, n]) => counts[key] !== n)
  ) {
    throw Error('ROI GDS polygon/cell counts differ from original source.');
  }
  return {
    bytes: output,
    report: {
      sourceSha256: sha(source),
      outputSha256: sha(output),
      root: rootName,
      chip,
      junction,
      q2CenterUm: center,
      requestedSearchBoxUm: area,
      noGeometryClipping: true,
      sourceBackgroundPolygons: candidates.length,
      keptBackgroundPolygons: chosen.length,
      cells: parsedOut.cells.size,
      polygonCounts: counts,
      exportedBoundsUm: flat.bounds,
      sourceRawStructureIntegrity:
        'All retained boundary and junction polygon records are byte-identical to the author GDS',
    },
  };
}
function argValue(args, opt, fallback) {
  const i = args.indexOf(opt);
  return i >= 0 ? args[i + 1] : fallback;
}
async function main(args) {
  const srcPath = argValue(args, '--input');
  const outPath = argValue(args, '--output');
  if (!srcPath || !outPath || resolve(srcPath) === resolve(outPath)) {
    throw Error(
      'Usage: --input ORIGINAL.gds --output Q2_ROI.gds [--radius 500] [--report report.json]',
    );
  }
  const source = await readFile(srcPath);
  const expected = argValue(args, '--expected-sha256');
  if (expected && expected !== sha(source)) throw Error('Author GDS SHA-256 mismatch.');
  const result = extractQ2ROI(source, {
    radius: Number(argValue(args, '--radius', 500)),
  });
  await writeFile(outPath, result.bytes);
  const report = argValue(args, '--report');
  if (report) await writeFile(report, JSON.stringify(result.report, null, 2) + '\n');
  console.log(JSON.stringify(result.report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
