import { drawMaskGeometry } from './draw-mask-geometry.js';
import { maskLocalToWorld, maskRoiWorldGeometry } from './mask-roi-geometry.js';
import {
  bufferPolyline,
  intersection,
  isEmpty,
  pointInMulti,
  rectMulti,
} from './vector-geometry.js';

const DBU_TARGET_MICRON = 0.0001;
const GDS_COORD_LIMIT = 2_000_000_000;
const OAS_COORD_LIMIT = Math.floor(Number.MAX_SAFE_INTEGER / 8);
const GEOM_EPS = 1e-12;

function layerKey(layer, datatype) {
  return `${Number(layer) || 0}|${Number(datatype) || 0}`;
}

function closePoints(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const ring = points.map(([x, y]) => [Number(x), Number(y)]);
  const first = ring[0],
    last = ring.at(-1);
  if (!first || !last || !first.every(Number.isFinite) || !last.every(Number.isFinite)) {
    return [];
  }
  if (Math.abs(first[0] - last[0]) > GEOM_EPS || Math.abs(first[1] - last[1]) > GEOM_EPS) {
    ring.push([...first]);
  }
  return ring;
}

function ringBounds(ring) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring || []) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function uniqueSorted(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b),
    out = [];
  for (const value of sorted) {
    if (!out.length || Math.abs(value - out.at(-1)) > GEOM_EPS) out.push(value);
  }
  return out;
}

function fracturePolygonWithHoles(poly) {
  if (!Array.isArray(poly) || !poly[0]?.length) return [];
  if (poly.length === 1) return [closePoints(poly[0])].filter((ring) => ring.length >= 4);

  const all = poly.flat(),
    xs = uniqueSorted(all.map((point) => Number(point[0]))),
    bounds = ringBounds(poly[0]);
  if (!bounds || xs.length < 2) return [];

  const height = Math.max(1, bounds.maxY - bounds.minY),
    margin = Math.max(1, height * 0.01),
    pieces = [];

  for (let index = 1; index < xs.length; index++) {
    const x0 = xs[index - 1],
      x1 = xs[index],
      width = x1 - x0;
    if (!(width > GEOM_EPS)) continue;
    const strip = rectMulti(
        width,
        height + margin * 2,
        (x0 + x1) / 2,
        (bounds.minY + bounds.maxY) / 2,
      ),
      cut = intersection([poly], strip);
    for (const part of cut || []) {
      if (part.length === 1) {
        const ring = closePoints(part[0]);
        if (ring.length >= 4) pieces.push(ring);
      } else {
        const ys = uniqueSorted(part.flat().map((point) => Number(point[1]))),
          partBounds = ringBounds(part[0]),
          partWidth = Math.max(1, (partBounds?.maxX || 0) - (partBounds?.minX || 0)),
          xMargin = Math.max(1, partWidth * 0.01);
        for (let yi = 1; yi < ys.length; yi++) {
          const y0 = ys[yi - 1],
            y1 = ys[yi],
            partHeight = y1 - y0;
          if (!(partHeight > GEOM_EPS)) continue;
          const horizontalStrip = rectMulti(
              partWidth + xMargin * 2,
              partHeight,
              ((partBounds?.minX || 0) + (partBounds?.maxX || 0)) / 2,
              (y0 + y1) / 2,
            ),
            horizontalCut = intersection([part], horizontalStrip);
          for (const candidate of horizontalCut || []) {
            if (candidate.length !== 1) {
              throw new Error('Mask export could not fracture a polygon with nested holes.');
            }
            const ring = closePoints(candidate[0]);
            if (ring.length >= 4) pieces.push(ring);
          }
        }
      }
    }
  }
  return pieces;
}

function hasRepresentableDbuArea(ring, dbuMicron = DBU_TARGET_MICRON) {
  const points = [];
  for (const [x, y] of ring) {
    const point = [Math.round(x / dbuMicron), Math.round(y / dbuMicron)];
    const previous = points.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
      points.push(point);
    }
  }
  if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) {
    points.pop();
  }
  return points.length >= 3 && quantizedPolygonArea2(points) > 0n;
}

function polygonElementsFromGeometry(geometry, layer, datatype) {
  const out = [];
  for (const poly of geometry || []) {
    const pieces = fracturePolygonWithHoles(poly);
    // Polygon-with-holes fracture creates zero-area slivers next to curved
    // vertices. Those have no representation at the 0.1 nm export grid.
    // Retain strict rejection of standalone tiny polygons and of any ring
    // whose *entire* fracture would collapse.
    const representable =
      poly.length > 1 ? pieces.filter((ring) => hasRepresentableDbuArea(ring)) : pieces;
    if (poly.length > 1 && pieces.length && !representable.length) {
      throw new Error('Mask export polygon-with-holes collapses at GDS/OAS database precision.');
    }
    for (const ring of representable) {
      out.push({
        kind: 'polygon',
        layer: Number(layer) || 0,
        datatype: Number(datatype) || 0,
        points: ring.slice(0, -1),
      });
    }
  }
  return out;
}

function segmentIntersectionT(a, b, c, d) {
  const rx = b[0] - a[0],
    ry = b[1] - a[1],
    sx = d[0] - c[0],
    sy = d[1] - c[1],
    denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= GEOM_EPS) return null;
  const qx = c[0] - a[0],
    qy = c[1] - a[1],
    t = (qx * sy - qy * sx) / denominator,
    u = (qx * ry - qy * rx) / denominator;
  if (t < -GEOM_EPS || t > 1 + GEOM_EPS || u < -GEOM_EPS || u > 1 + GEOM_EPS) return null;
  return Math.max(0, Math.min(1, t));
}

function clipPolyline(points, clip) {
  if (!clip || !Array.isArray(points) || points.length < 2) return points?.length ? [points] : [];
  const pieces = [];
  let current = null;
  const same = (a, b) =>
    a && b && Math.abs(a[0] - b[0]) <= GEOM_EPS && Math.abs(a[1] - b[1]) <= GEOM_EPS;

  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index],
      cuts = [0, 1];
    for (const poly of clip) {
      for (const ring of poly) {
        for (let edge = 1; edge < ring.length; edge++) {
          const t = segmentIntersectionT(a, b, ring[edge - 1], ring[edge]);
          if (t != null) cuts.push(t);
        }
      }
    }
    const sorted = uniqueSorted(cuts);
    for (let part = 1; part < sorted.length; part++) {
      const t0 = sorted[part - 1],
        t1 = sorted[part];
      if (!(t1 - t0 > GEOM_EPS)) continue;
      const tm = (t0 + t1) / 2,
        midpoint = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
      if (!pointInMulti(midpoint, clip)) {
        current = null;
        continue;
      }
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (!current || !same(current.at(-1), p0)) {
        current = [p0, p1];
        pieces.push(current);
      } else if (!same(current.at(-1), p1)) {
        current.push(p1);
      }
    }
  }
  return pieces.filter((piece) => piece.length >= 2);
}

export function collectMaskExportElements({
  layout,
  maskSourceMode = 'file',
  drawMask = null,
  maskTransform = null,
  maskRoi = null,
  selectedCells = null,
  selectedLayerKeys = null,
} = {}) {
  const transform =
      maskSourceMode === 'file'
        ? {
            x: Number(maskTransform?.x) || 0,
            y: Number(maskTransform?.y) || 0,
            scale: Number(maskTransform?.scale) || 1,
            rotation: Number(maskTransform?.rotation) || 0,
          }
        : { x: 0, y: 0, scale: 1, rotation: 0 },
    roi = maskRoi ? maskRoiWorldGeometry(maskRoi, transform, 160) : null,
    cells = selectedCells instanceof Set ? selectedCells : new Set(selectedCells || []),
    layers =
      selectedLayerKeys instanceof Set ? selectedLayerKeys : new Set(selectedLayerKeys || []),
    out = [];

  if (maskSourceMode === 'draw') {
    let geometry = drawMaskGeometry(drawMask);
    if (roi && !isEmpty(geometry)) geometry = intersection(geometry, roi);
    out.push(...polygonElementsFromGeometry(geometry, 0, 0));
    return { elements: out, roiApplied: Boolean(roi), source: 'draw' };
  }

  const point = (value) => maskLocalToWorld(value, transform),
    accepts = (element) => {
      const cell = element.sourceCell || layout?.root || 'ROOT';
      return (
        (!cells.size || cells.has(cell)) &&
        (!layers.size || layers.has(layerKey(element.layer, element.datatype)))
      );
    };

  for (const element of layout?.elements || []) {
    if (!accepts(element) || !Array.isArray(element.points) || element.points.length < 2) continue;
    const points = element.points.map(point),
      layer = Number(element.layer) || 0,
      datatype = Number(element.datatype) || 0;
    if (element.kind === 'polygon') {
      let geometry = [[closePoints(points)]];
      if (roi) geometry = intersection(geometry, roi);
      out.push(...polygonElementsFromGeometry(geometry, layer, datatype));
      continue;
    }

    if (element.kind === 'path' && Number(element.width) > 0) {
      const width = Math.abs(Number(element.width) * transform.scale);
      if (!roi) {
        out.push({ kind: 'path', layer, datatype, width, points });
      } else {
        const geometry = intersection(bufferPolyline(points, width / 2, 28, false), roi);
        out.push(...polygonElementsFromGeometry(geometry, layer, datatype));
      }
    }
  }

  for (const element of layout?.linework || []) {
    if (!accepts(element) || !Array.isArray(element.points) || element.points.length < 2) continue;
    const points = element.points.map(point),
      layer = Number(element.layer) || 0,
      datatype = Number(element.datatype) || 0,
      width = Math.abs(Number(element.width) || 0) * Math.abs(transform.scale);
    if (width > 0 && roi) {
      const geometry = intersection(bufferPolyline(points, width / 2, 28, false), roi);
      out.push(...polygonElementsFromGeometry(geometry, layer, datatype));
      continue;
    }
    for (const clipped of roi ? clipPolyline(points, roi) : [points]) {
      out.push({ kind: 'path', layer, datatype, width, points: clipped });
    }
  }

  return { elements: out, roiApplied: Boolean(roi), source: 'file' };
}

function chooseDbuMicron(
  elements,
  targetDbuMicron = DBU_TARGET_MICRON,
  coordinateLimit = GDS_COORD_LIMIT,
) {
  let maxAbs = 1;
  for (const element of elements || []) {
    for (const [x, y] of element.points || []) maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
    maxAbs = Math.max(maxAbs, Math.abs(Number(element.width) || 0));
  }
  let dbu = targetDbuMicron;
  while (maxAbs / dbu > coordinateLimit) dbu *= 10;
  return dbu;
}

function quantizedPolygonArea2(points) {
  let area2 = 0n;
  for (let index = 0; index < points.length; index++) {
    const [x0, y0] = points[index],
      [x1, y1] = points[(index + 1) % points.length];
    area2 += BigInt(x0) * BigInt(y1) - BigInt(x1) * BigInt(y0);
  }
  return area2 < 0n ? -area2 : area2;
}

function quantizeElements(elements, dbuMicron) {
  const quantize = (value) => Math.round(Number(value) / dbuMicron),
    out = [];
  for (const element of elements || []) {
    const points = [];
    for (const point of element.points || []) {
      const next = [quantize(point[0]), quantize(point[1])],
        previous = points.at(-1);
      if (!previous || next[0] !== previous[0] || next[1] !== previous[1]) points.push(next);
    }
    if (element.kind === 'polygon') {
      if (
        points.length > 2 &&
        points[0][0] === points.at(-1)[0] &&
        points[0][1] === points.at(-1)[1]
      ) {
        points.pop();
      }
      if (points.length < 3 || quantizedPolygonArea2(points) === 0n) {
        throw new Error(
          `Mask export geometry collapses at the selected ${dbuMicron} µm database unit.`,
        );
      }
    } else if (points.length < 2) {
      throw new Error(`Mask export path collapses at the selected ${dbuMicron} µm database unit.`);
    }
    const layer = Number(element.layer),
      datatype = Number(element.datatype);
    if (!Number.isSafeInteger(layer) || layer < 0) {
      throw new Error(`Mask export layer is invalid: ${element.layer}.`);
    }
    if (!Number.isSafeInteger(datatype) || datatype < 0) {
      throw new Error(`Mask export datatype is invalid: ${element.datatype}.`);
    }
    out.push({
      ...element,
      layer,
      datatype,
      width: quantize(Math.abs(Number(element.width) || 0)),
      points,
    });
  }
  return out;
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

function asciiBytes(value) {
  return new TextEncoder().encode(String(value || '').replace(/[^\x20-\x7e]/g, '_'));
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

function gdsReal8(value) {
  const out = new Uint8Array(8);
  if (!Number.isFinite(value) || value === 0) return out;
  const sign = value < 0 ? 0x80 : 0;
  let magnitude = Math.abs(value),
    exponent = 0;
  while (magnitude >= 1) {
    magnitude /= 16;
    exponent++;
  }
  while (magnitude < 1 / 16) {
    magnitude *= 16;
    exponent--;
  }
  out[0] = sign | Math.max(0, Math.min(127, exponent + 64));
  for (let index = 1; index < 8; index++) {
    magnitude *= 256;
    out[index] = Math.floor(magnitude) & 0xff;
    magnitude -= Math.floor(magnitude);
  }
  return out;
}

function gdsRecord(type, dataType, payload = new Uint8Array()) {
  let data = payload;
  if (data.length % 2) data = concatBytes([data, Uint8Array.of(0)]);
  const length = data.length + 4,
    header = new Uint8Array(4),
    view = new DataView(header.buffer);
  view.setUint16(0, length, false);
  header[2] = type;
  header[3] = dataType;
  return concatBytes([header, data]);
}

function gdsStringRecord(type, value) {
  return gdsRecord(type, 0x06, asciiBytes(value));
}

function timestampWords() {
  const now = new Date(),
    year = now.getUTCFullYear(),
    month = now.getUTCMonth() + 1,
    day = now.getUTCDate(),
    hour = now.getUTCHours(),
    minute = now.getUTCMinutes(),
    second = now.getUTCSeconds();
  return [year, month, day, hour, minute, second, year, month, day, hour, minute, second];
}

export function serializeGDS(elements, { cellName = 'WAFERCAD_EXPORT' } = {}) {
  const dbuMicron = chooseDbuMicron(elements),
    quantized = quantizeElements(elements, dbuMicron),
    records = [
      gdsRecord(0x00, 0x02, gdsInt16([600])),
      gdsRecord(0x01, 0x02, gdsInt16(timestampWords())),
      gdsStringRecord(0x02, 'WAFERCAD'),
      gdsRecord(0x03, 0x05, concatBytes([gdsReal8(dbuMicron), gdsReal8(dbuMicron * 1e-6)])),
      gdsRecord(0x05, 0x02, gdsInt16(timestampWords())),
      gdsStringRecord(0x06, cellName.slice(0, 32)),
    ];

  for (const element of quantized) {
    if (element.layer > 32767 || element.datatype > 32767) {
      throw new Error(
        `GDSII export cannot represent layer/datatype ${element.layer}/${element.datatype} as INT2.`,
      );
    }
    if (element.kind === 'polygon') {
      if (element.points.length + 1 > 8190) {
        throw new Error('A polygon is too large for one GDSII BOUNDARY record.');
      }
      const closed = [...element.points, element.points[0]],
        xy = closed.flat();
      records.push(
        gdsRecord(0x08, 0x00),
        gdsRecord(0x0d, 0x02, gdsInt16([element.layer])),
        gdsRecord(0x0e, 0x02, gdsInt16([element.datatype])),
        gdsRecord(0x10, 0x03, gdsInt32(xy)),
        gdsRecord(0x11, 0x00),
      );
    } else {
      if (element.points.length > 8190)
        throw new Error('A path is too large for one GDSII PATH record.');
      records.push(
        gdsRecord(0x09, 0x00),
        gdsRecord(0x0d, 0x02, gdsInt16([element.layer])),
        gdsRecord(0x0e, 0x02, gdsInt16([element.datatype])),
        gdsRecord(0x0f, 0x03, gdsInt32([element.width])),
        gdsRecord(0x10, 0x03, gdsInt32(element.points.flat())),
        gdsRecord(0x11, 0x00),
      );
    }
  }
  records.push(gdsRecord(0x07, 0x00), gdsRecord(0x04, 0x00));
  return concatBytes(records);
}

function oasisUint(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('OASIS export integer is invalid.');
  const out = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    out.push(byte);
  } while (remaining);
  return Uint8Array.from(out);
}

function oasisSint(value) {
  const integer = Math.round(Number(value) || 0);
  return oasisUint(Math.abs(integer) * 2 + (integer < 0 ? 1 : 0));
}

function oasisString(value) {
  const data = asciiBytes(value);
  return concatBytes([oasisUint(data.length), data]);
}

function oasisReal(value) {
  if (Number.isSafeInteger(value) && value >= 0) {
    return concatBytes([oasisUint(0), oasisUint(value)]);
  }
  const bytes = new Uint8Array(8),
    view = new DataView(bytes.buffer);
  view.setFloat64(0, Number(value), true);
  return concatBytes([oasisUint(7), bytes]);
}

function oasisGDelta(dx, dy) {
  const x = Math.round(dx),
    encodedX = Math.abs(x) * 2 + (x < 0 ? 1 : 0);
  return concatBytes([oasisUint(encodedX * 2 + 1), oasisSint(dy)]);
}

function oasisPointList(points, closed) {
  const deltas = [];
  for (let index = 1; index < points.length; index++) {
    deltas.push([points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]]);
  }
  return concatBytes([
    oasisUint(4),
    oasisUint(deltas.length),
    ...deltas.map(([dx, dy]) => oasisGDelta(dx, dy)),
  ]);
}

export function serializeOASIS(elements, { cellName = 'WAFERCAD_EXPORT' } = {}) {
  // OASIS PATH stores half-width as an integer. A half-size base DBU keeps
  // 0.1 nm full-width increments exactly representable.
  const dbuMicron = chooseDbuMicron(elements, DBU_TARGET_MICRON / 2, OAS_COORD_LIMIT),
    quantized = quantizeElements(elements, dbuMicron),
    parts = [
      new TextEncoder().encode('%SEMI-OASIS\r\n'),
      oasisUint(1),
      oasisString('1.0'),
      oasisReal(1 / dbuMicron),
      oasisUint(0),
      ...Array.from({ length: 12 }, () => oasisUint(0)),
      oasisUint(14),
      oasisString(cellName.slice(0, 255)),
    ];

  for (const element of quantized) {
    const first = element.points[0];
    if (element.kind === 'polygon') {
      parts.push(
        oasisUint(21),
        Uint8Array.of(0x3b),
        oasisUint(element.layer),
        oasisUint(element.datatype),
        oasisPointList(element.points, true),
        oasisSint(first[0]),
        oasisSint(first[1]),
      );
    } else {
      parts.push(
        oasisUint(22),
        Uint8Array.of(0x7b),
        oasisUint(element.layer),
        oasisUint(element.datatype),
        oasisUint(Math.max(0, Math.round(element.width / 2))),
        oasisPointList(element.points, false),
        oasisSint(first[0]),
        oasisSint(first[1]),
      );
    }
  }
  // OASIS END is exactly 256 bytes: id + two-byte b-string length +
  // 252 padding bytes + validation scheme 0 (none).
  parts.push(oasisUint(2), oasisUint(252), new Uint8Array(252), oasisUint(0));
  return concatBytes(parts);
}
