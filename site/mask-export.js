import { drawMaskGeometry } from './draw-mask-geometry.js';
import { bufferPolyline, intersection, isEmpty, lineIntervalsInMulti } from './vector-geometry.js';

const DBU_PER_MICRON = 1000;
const GDS_MAX_COORD = 2147483647;

function transformPoint([x, y], transform) {
  const scale = Number(transform?.scale) || 1,
    angle = ((Number(transform?.rotation) || 0) * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    sx = x * scale,
    sy = y * scale;
  return [
    sx * c - sy * s + (Number(transform?.x) || 0),
    sx * s + sy * c + (Number(transform?.y) || 0),
  ];
}

function layerKey(layer, datatype) {
  return `${Number(layer) || 0}|${Number(datatype) || 0}`;
}

function openRing(ring) {
  if (!Array.isArray(ring)) return [];
  const points = ring.map(([x, y]) => [Number(x), Number(y)]);
  if (
    points.length > 1 &&
    points[0][0] === points.at(-1)[0] &&
    points[0][1] === points.at(-1)[1]
  ) {
    points.pop();
  }
  return points;
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function oriented(points, positive) {
  const out = points.map((point) => [...point]);
  if ((signedArea(out) > 0) !== positive) out.reverse();
  return out;
}

// GDSII/OASIS polygons do not carry explicit hole rings. Represent a polygon
// with holes as a conventional zero-width keyhole boundary so the exported
// area remains topologically equivalent when imported by layout tools.
function keyholePolygon(poly) {
  let outer = oriented(openRing(poly?.[0]), true);
  if (outer.length < 3) return [];
  const holes = (poly || []).slice(1).map((ring) => oriented(openRing(ring), false));

  const bridges = holes
    .filter((hole) => hole.length >= 3)
    .map((hole) => {
      let bestOuter = 0,
        bestHole = 0,
        bestDistance = Infinity;
      for (let oi = 0; oi < outer.length; oi++) {
        for (let hi = 0; hi < hole.length; hi++) {
          const dx = outer[oi][0] - hole[hi][0],
            dy = outer[oi][1] - hole[hi][1],
            distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestOuter = oi;
            bestHole = hi;
          }
        }
      }
      return { outerIndex: bestOuter, hole, holeIndex: bestHole };
    })
    .sort((a, b) => b.outerIndex - a.outerIndex);

  for (const bridge of bridges) {
    const hole = bridge.hole,
      h = bridge.holeIndex,
      o = outer[bridge.outerIndex],
      cycle = [];
    for (let offset = 0; offset < hole.length; offset++) {
      cycle.push(hole[(h + offset) % hole.length]);
    }
    cycle.push(hole[h], o);
    outer.splice(bridge.outerIndex + 1, 0, ...cycle);
  }
  return outer;
}

function boundaryRecordsFromMulti(geometry, layer, datatype) {
  const records = [];
  for (const poly of geometry || []) {
    const points = keyholePolygon(poly);
    if (points.length >= 3) records.push({ kind: 'boundary', layer, datatype, points });
  }
  return records;
}

function clipZeroWidthPath(points, roiGeometry) {
  if (!roiGeometry) return [points];
  const clipped = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    for (const [t0, t1] of lineIntervalsInMulti(a, b, roiGeometry)) {
      if (!(t1 > t0)) continue;
      clipped.push([
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
      ]);
    }
  }
  return clipped;
}

export function buildMaskExportRecords({
  layout,
  maskSourceMode,
  drawMask,
  maskTransform,
  roiGeometry = null,
  selectedCells = new Set(),
  selectedLayers = new Set(),
}) {
  const records = [];
  if (maskSourceMode === 'draw') {
    let geometry = drawMaskGeometry(drawMask);
    if (roiGeometry) geometry = intersection(geometry, roiGeometry);
    return boundaryRecordsFromMulti(geometry, 1, 0);
  }

  const transform = maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 },
    root = layout?.root || 'ROOT',
    accepts = (element) =>
      selectedCells.has(element.sourceCell || root) &&
      selectedLayers.has(layerKey(element.layer, element.datatype));

  for (const element of layout?.elements || []) {
    if (!accepts(element) || !Array.isArray(element.points)) continue;
    const points = element.points.map((point) => transformPoint(point, transform));
    let geometry = [];
    if (element.kind === 'polygon') {
      geometry = [[points]];
    } else if (element.kind === 'path' && Number(element.width) > 0) {
      geometry = bufferPolyline(
        points,
        (Number(element.width) * Math.abs(Number(transform.scale) || 1)) / 2,
        28,
        false,
      );
    }
    if (roiGeometry && !isEmpty(geometry)) geometry = intersection(geometry, roiGeometry);
    records.push(
      ...boundaryRecordsFromMulti(
        geometry,
        Number(element.layer) || 0,
        Number(element.datatype) || 0,
      ),
    );
  }

  for (const element of layout?.linework || []) {
    if (!accepts(element) || !Array.isArray(element.points) || element.points.length < 2) continue;
    const points = element.points.map((point) => transformPoint(point, transform)),
      paths = clipZeroWidthPath(points, roiGeometry);
    for (const path of paths) {
      if (path.length < 2) continue;
      records.push({
        kind: 'path',
        layer: Number(element.layer) || 0,
        datatype: Number(element.datatype) || 0,
        width: Math.abs(Number(element.width) || 0) * Math.abs(Number(transform.scale) || 1),
        points: path,
      });
    }
  }
  return records;
}

function sanitizeCellName(value) {
  const cleaned = String(value || 'WAFERCAD')
    .replace(/[^A-Za-z0-9_$?]/g, '_')
    .slice(0, 32);
  return cleaned || 'WAFERCAD';
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0),
    out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function gdsInt16(values) {
  const out = new Uint8Array(values.length * 2),
    view = new DataView(out.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, false));
  return out;
}

function gdsInt32(values) {
  const out = new Uint8Array(values.length * 4),
    view = new DataView(out.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, value, false));
  return out;
}

function gdsAscii(value) {
  const encoded = new TextEncoder().encode(String(value)),
    out = new Uint8Array(encoded.length + (encoded.length % 2));
  out.set(encoded);
  return out;
}

function gdsReal8(value) {
  const out = new Uint8Array(8);
  if (!value) return out;
  let x = Math.abs(value),
    exponent = 0;
  while (x >= 1) {
    x /= 16;
    exponent++;
  }
  while (x < 1 / 16) {
    x *= 16;
    exponent--;
  }
  const encodedExponent = exponent + 64;
  if (encodedExponent <= 0 || encodedExponent >= 128) {
    throw new Error('GDS real value is outside the representable range.');
  }
  out[0] = (value < 0 ? 0x80 : 0) | encodedExponent;
  for (let index = 1; index < 8; index++) {
    x *= 256;
    out[index] = Math.floor(x);
    x -= out[index];
  }
  return out;
}

function gdsRecord(type, dataType, payload = new Uint8Array()) {
  const out = new Uint8Array(payload.length + 4),
    view = new DataView(out.buffer);
  view.setUint16(0, out.length, false);
  out[2] = type;
  out[3] = dataType;
  out.set(payload, 4);
  return out;
}

function gdsDatePayload(date = new Date()) {
  const values = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  return gdsInt16([...values, ...values]);
}

function dbuCoordinate(value) {
  const scaled = Math.round(Number(value) * DBU_PER_MICRON);
  if (!Number.isSafeInteger(scaled) || Math.abs(scaled) > GDS_MAX_COORD) {
    throw new Error('Mask coordinate exceeds the GDSII 32-bit database-unit range.');
  }
  return scaled;
}

export function encodeGdsMask(records, { cellName = 'WAFERCAD' } = {}) {
  const parts = [
      gdsRecord(0x00, 0x02, gdsInt16([600])),
      gdsRecord(0x01, 0x02, gdsDatePayload()),
      gdsRecord(0x02, 0x06, gdsAscii('WAFERCAD')),
      gdsRecord(0x03, 0x05, concatBytes([gdsReal8(0.001), gdsReal8(1e-9)])),
      gdsRecord(0x05, 0x02, gdsDatePayload()),
      gdsRecord(0x06, 0x06, gdsAscii(sanitizeCellName(cellName))),
    ];

  for (const record of records || []) {
    const layer = Number(record.layer) || 0,
      datatype = Number(record.datatype) || 0;
    if (layer < 0 || layer > 32767 || datatype < 0 || datatype > 32767) {
      throw new Error('GDSII export requires layer/datatype values in the 0…32767 range.');
    }

    if (record.kind === 'boundary') {
      const points = openRing(record.points);
      if (points.length < 3) continue;
      if (points.length + 1 > 8191) {
        throw new Error('A polygon exceeds the GDSII 8191-coordinate boundary limit.');
      }
      const closed = [...points, points[0]],
        xy = closed.flatMap(([x, y]) => [dbuCoordinate(x), dbuCoordinate(y)]);
      parts.push(
        gdsRecord(0x08, 0x00),
        gdsRecord(0x0d, 0x02, gdsInt16([layer])),
        gdsRecord(0x0e, 0x02, gdsInt16([datatype])),
        gdsRecord(0x10, 0x03, gdsInt32(xy)),
        gdsRecord(0x11, 0x00),
      );
    } else if (record.kind === 'path' && record.points?.length >= 2) {
      const xy = record.points.flatMap(([x, y]) => [dbuCoordinate(x), dbuCoordinate(y)]);
      parts.push(
        gdsRecord(0x09, 0x00),
        gdsRecord(0x0d, 0x02, gdsInt16([layer])),
        gdsRecord(0x0e, 0x02, gdsInt16([datatype])),
        gdsRecord(0x0f, 0x03, gdsInt32([dbuCoordinate(record.width || 0)])),
        gdsRecord(0x10, 0x03, gdsInt32(xy)),
        gdsRecord(0x11, 0x00),
      );
    }
  }

  parts.push(gdsRecord(0x07, 0x00), gdsRecord(0x04, 0x00));
  return concatBytes(parts);
}

class OasisWriter {
  constructor() {
    this.bytes = [];
  }

  byte(value) {
    this.bytes.push(value & 0xff);
  }

  raw(values) {
    this.bytes.push(...values);
  }

  uint(value) {
    let current = Math.max(0, Math.floor(Number(value) || 0));
    if (!Number.isSafeInteger(current)) throw new Error('OASIS integer exceeds JavaScript range.');
    do {
      let byte = current % 128;
      current = Math.floor(current / 128);
      if (current) byte |= 0x80;
      this.byte(byte);
    } while (current);
  }

  sint(value) {
    const number = Math.trunc(Number(value) || 0);
    this.uint(number < 0 ? Math.abs(number) * 2 + 1 : number * 2);
  }

  string(value) {
    const encoded = new TextEncoder().encode(String(value));
    this.uint(encoded.length);
    this.raw(encoded);
  }

  realInteger(value) {
    this.uint(0);
    this.uint(value);
  }

  finish() {
    return Uint8Array.from(this.bytes);
  }
}

function writeOasisDelta(writer, dx, dy) {
  const x = Math.trunc(dx),
    y = Math.trunc(dy),
    signedX = x < 0 ? Math.abs(x) * 2 + 1 : x * 2;
  writer.uint(signedX * 2 + 1);
  writer.sint(y);
}

function writeOasisPointList(writer, points, implicitClosed) {
  const open = openRing(points);
  writer.uint(4);
  writer.uint(Math.max(0, open.length - 1));
  for (let index = 1; index < open.length; index++) {
    writeOasisDelta(
      writer,
      dbuCoordinate(open[index][0]) - dbuCoordinate(open[index - 1][0]),
      dbuCoordinate(open[index][1]) - dbuCoordinate(open[index - 1][1]),
    );
  }
  if (!implicitClosed && open.length < 2) throw new Error('OASIS path requires two points.');
}

export function encodeOasisMask(records, { cellName = 'WAFERCAD' } = {}) {
  const writer = new OasisWriter();
  writer.raw(new TextEncoder().encode('%SEMI-OASIS\r\n'));
  writer.uint(1);
  writer.string('1.0');
  writer.realInteger(DBU_PER_MICRON);
  writer.uint(0);
  for (let index = 0; index < 6; index++) {
    writer.uint(0);
    writer.uint(0);
  }

  writer.uint(14);
  writer.string(sanitizeCellName(cellName));

  for (const record of records || []) {
    const layer = Math.max(0, Math.floor(Number(record.layer) || 0)),
      datatype = Math.max(0, Math.floor(Number(record.datatype) || 0));
    if (record.kind === 'boundary') {
      const points = openRing(record.points);
      if (points.length < 3) continue;
      writer.uint(21);
      writer.byte(0x3b);
      writer.uint(layer);
      writer.uint(datatype);
      writeOasisPointList(writer, points, true);
      writer.sint(dbuCoordinate(points[0][0]));
      writer.sint(dbuCoordinate(points[0][1]));
    } else if (record.kind === 'path' && record.points?.length >= 2) {
      const points = openRing(record.points);
      writer.uint(22);
      writer.byte(0x7b);
      writer.uint(layer);
      writer.uint(datatype);
      writer.uint(Math.max(0, Math.round((Number(record.width) || 0) * DBU_PER_MICRON / 2)));
      writeOasisPointList(writer, points, false);
      writer.sint(dbuCoordinate(points[0][0]));
      writer.sint(dbuCoordinate(points[0][1]));
    }
  }

  // With the offset table in START, a standard END record consists of the
  // record id, a padding b-string, and validation scheme. Keep END at 256 bytes.
  writer.uint(2);
  writer.uint(252);
  writer.raw(new Uint8Array(252));
  writer.uint(0);
  return writer.finish();
}
