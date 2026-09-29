const REC = {
  UNITS: 0x03,
  BGNSTR: 0x05,
  STRNAME: 0x06,
  ENDSTR: 0x07,
  BOUNDARY: 0x08,
  PATH: 0x09,
  SREF: 0x0a,
  AREF: 0x0b,
  LAYER: 0x0d,
  DATATYPE: 0x0e,
  WIDTH: 0x0f,
  XY: 0x10,
  ENDEL: 0x11,
  SNAME: 0x12,
  COLROW: 0x13,
  STRANS: 0x1a,
  MAG: 0x1b,
  ANGLE: 0x1c,
};

function i16(v, o) {
  return v.getInt16(o, false);
}
function i32(v, o) {
  return v.getInt32(o, false);
}
function ascii(bytes) {
  return new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '').trim();
}
function real8(bytes) {
  if (!bytes.length || bytes.every((x) => x === 0)) return 0;
  const sign = bytes[0] & 0x80 ? -1 : 1,
    exp = (bytes[0] & 0x7f) - 64;
  let mant = 0,
    f = 1 / 256;
  for (let i = 1; i < 8; i++) {
    mant += bytes[i] * f;
    f /= 256;
  }
  return sign * mant * Math.pow(16, exp);
}
function affineIdentity() {
  return [1, 0, 0, 1, 0, 0];
}
function affineMul(p, q) {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}
function affinePoint(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function refMatrix(ref, offset = [0, 0]) {
  const a = ((ref.angle || 0) * Math.PI) / 180,
    s = ref.mag || 1,
    mirror = ref.reflect ? -1 : 1,
    c = Math.cos(a),
    sn = Math.sin(a);
  const local = [
    s * c,
    s * sn,
    -s * mirror * sn,
    s * mirror * c,
    (ref.xy?.[0] || 0) + offset[0],
    (ref.xy?.[1] || 0) + offset[1],
  ];
  return local;
}
function boundsOf(elements) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const e of elements) {
    for (const [x, y] of e.points || []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1, width: 2, height: 2 };
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1e-9),
    height: Math.max(maxY - minY, 1e-9),
  };
}

export function parseGDS(arrayBuffer) {
  const view = new DataView(arrayBuffer),
    u8 = new Uint8Array(arrayBuffer);
  let pos = 0,
    currentCell = null,
    currentElement = null;
  const cells = new Map(),
    cellOrder = [];
  let userUnitsPerDbu = null,
    metersPerDbu = null,
    dbuToMicron = 1,
    hasPhysicalUnits = false;
  while (pos + 4 <= view.byteLength) {
    const len = view.getUint16(pos, false);
    if (len < 4 || pos + len > view.byteLength)
      throw new Error(`Invalid GDS record at byte ${pos}.`);
    const type = u8[pos + 2],
      dataType = u8[pos + 3],
      start = pos + 4,
      end = pos + len,
      data = u8.slice(start, end);
    if (type === REC.UNITS && data.length >= 16) {
      userUnitsPerDbu = real8(data.slice(0, 8));
      metersPerDbu = real8(data.slice(8, 16));
      if (Number.isFinite(metersPerDbu) && metersPerDbu > 0) {
        dbuToMicron = metersPerDbu * 1e6;
        hasPhysicalUnits = true;
      }
    } else if (type === REC.BGNSTR) {
      currentCell = { name: '', elements: [] };
    } else if (type === REC.STRNAME && currentCell) {
      currentCell.name = ascii(data);
    } else if (type === REC.ENDSTR && currentCell) {
      if (currentCell.name) {
        cells.set(currentCell.name, currentCell);
        cellOrder.push(currentCell.name);
      }
      currentCell = null;
    } else if ([REC.BOUNDARY, REC.PATH, REC.SREF, REC.AREF].includes(type) && currentCell) {
      currentElement = {
        kind:
          type === REC.BOUNDARY
            ? 'polygon'
            : type === REC.PATH
              ? 'path'
              : type === REC.SREF
                ? 'sref'
                : 'aref',
        layer: 0,
        datatype: 0,
        width: 0,
        points: [],
        name: '',
        mag: 1,
        angle: 0,
        reflect: false,
        cols: 1,
        rows: 1,
      };
    } else if (type === REC.LAYER && currentElement) {
      currentElement.layer = i16(view, start);
    } else if (type === REC.DATATYPE && currentElement) {
      currentElement.datatype = i16(view, start);
    } else if (type === REC.WIDTH && currentElement) {
      currentElement.width = Math.abs(i32(view, start)) * dbuToMicron;
    } else if (type === REC.SNAME && currentElement) {
      currentElement.name = ascii(data);
    } else if (type === REC.STRANS && currentElement) {
      currentElement.reflect = (view.getUint16(start, false) & 0x8000) !== 0;
    } else if (type === REC.MAG && currentElement) {
      currentElement.mag = real8(data);
    } else if (type === REC.ANGLE && currentElement) {
      currentElement.angle = real8(data);
    } else if (type === REC.COLROW && currentElement) {
      currentElement.cols = Math.max(1, i16(view, start));
      currentElement.rows = Math.max(1, i16(view, start + 2));
    } else if (type === REC.XY && currentElement) {
      currentElement.points = [];
      for (let o = start; o + 7 < end; o += 8)
        currentElement.points.push([i32(view, o) * dbuToMicron, i32(view, o + 4) * dbuToMicron]);
      if (currentElement.kind === 'sref' && currentElement.points.length)
        currentElement.xy = currentElement.points[0];
    } else if (type === REC.ENDEL && currentElement && currentCell) {
      if (currentElement.kind === 'polygon' && currentElement.points.length > 2) {
        const p = currentElement.points;
        if (p.length > 3 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop();
      }
      currentCell.elements.push(currentElement);
      currentElement = null;
    }
    pos += len;
  }
  if (!cells.size) throw new Error('No structures were found in this GDS file.');
  const referenced = new Set();
  for (const c of cells.values())
    for (const e of c.elements) if (e.kind === 'sref' || e.kind === 'aref') referenced.add(e.name);
  const roots = cellOrder.filter((n) => !referenced.has(n));
  const root = roots.at(-1) || cellOrder.at(-1);
  return {
    cells,
    cellOrder,
    root,
    units: {
      xy: hasPhysicalUnits ? 'µm' : 'DBU',
      userUnitsPerDbu,
      metersPerDbu,
      dbuToMicron,
      hasPhysicalUnits,
    },
  };
}

export function flattenGDS(parsed, rootName) {
  const out = [],
    linework = [];
  let recursionGuard = 0;
  function visit(name, matrix, stack = []) {
    if (stack.includes(name) || stack.length > 32) return;
    const cell = parsed.cells.get(name);
    if (!cell) return;
    recursionGuard++;
    if (recursionGuard > 200000) throw new Error('GDS hierarchy is too large to flatten safely.');
    for (const e of cell.elements) {
      if (e.kind === 'polygon') {
        if (e.points.length >= 3)
          out.push({
            kind: 'polygon',
            sourceCell: name,
            layer: e.layer,
            datatype: e.datatype,
            points: e.points.map((p) => affinePoint(matrix, p)),
          });
      } else if (e.kind === 'path') {
        const pts = e.points.map((p) => affinePoint(matrix, p));
        const sx = Math.hypot(matrix[0], matrix[1]),
          sy = Math.hypot(matrix[2], matrix[3]),
          scale = (sx + sy) / 2,
          width = e.width * scale;
        const target = width > 0 ? out : linework;
        target.push({
          kind: 'path',
          sourceCell: name,
          layer: e.layer,
          datatype: e.datatype,
          points: pts,
          width,
        });
      } else if (e.kind === 'sref') {
        visit(e.name, affineMul(matrix, refMatrix(e)), [...stack, name]);
      } else if (e.kind === 'aref') {
        const p = e.points;
        if (p.length < 3) continue;
        const cols = Math.max(1, e.cols),
          rows = Math.max(1, e.rows);
        const cv = [(p[1][0] - p[0][0]) / cols, (p[1][1] - p[0][1]) / cols],
          rv = [(p[2][0] - p[0][0]) / rows, (p[2][1] - p[0][1]) / rows];
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            visit(
              e.name,
              affineMul(
                matrix,
                refMatrix({ ...e, xy: p[0] }, [c * cv[0] + r * rv[0], c * cv[1] + r * rv[1]]),
              ),
              [...stack, name],
            );
      }
    }
  }
  visit(rootName, affineIdentity());
  const bounds = boundsOf([...out, ...linework]);
  const combos = new Map();
  for (const e of out) {
    const key = `${e.sourceCell}|${e.layer}|${e.datatype}`;
    if (!combos.has(key))
      combos.set(key, { key, cell: e.sourceCell, layer: e.layer, datatype: e.datatype, count: 0 });
    combos.get(key).count++;
  }
  return {
    root: rootName,
    elements: out,
    linework,
    bounds,
    combos: [...combos.values()].sort(
      (a, b) => a.cell.localeCompare(b.cell) || a.layer - b.layer || a.datatype - b.datatype,
    ),
    units: parsed.units || { xy: 'DBU', dbuToMicron: 1, hasPhysicalUnits: false },
  };
}

export function makeDemoLayout() {
  const elements = [
    {
      kind: 'polygon',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      points: [
        [-38000, -20000],
        [-8000, -20000],
        [-8000, 20000],
        [-38000, 20000],
      ],
    },
    {
      kind: 'polygon',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      points: [
        [8000, -20000],
        [38000, -20000],
        [38000, 20000],
        [8000, 20000],
      ],
    },
    {
      kind: 'polygon',
      sourceCell: 'CONTACTS',
      layer: 2,
      datatype: 0,
      points: [
        [-31000, -10000],
        [-20000, -10000],
        [-20000, 10000],
        [-31000, 10000],
      ],
    },
    {
      kind: 'polygon',
      sourceCell: 'CONTACTS',
      layer: 2,
      datatype: 0,
      points: [
        [20000, -10000],
        [31000, -10000],
        [31000, 10000],
        [20000, 10000],
      ],
    },
    {
      kind: 'polygon',
      sourceCell: 'WINDOW',
      layer: 5,
      datatype: 0,
      points: [
        [-10000, -7000],
        [10000, -7000],
        [10000, 7000],
        [-10000, 7000],
      ],
    },
    {
      kind: 'path',
      sourceCell: 'GUIDES',
      layer: 99,
      datatype: 0,
      points: [
        [-45000, 0],
        [45000, 0],
      ],
      width: 0,
    },
  ];
  const operable = elements.filter((e) => e.kind === 'polygon' || e.width > 0),
    linework = elements.filter((e) => e.kind === 'path' && !(e.width > 0)),
    bounds = boundsOf(elements);
  const combos = new Map();
  for (const e of operable) {
    const key = `${e.sourceCell}|${e.layer}|${e.datatype}`;
    if (!combos.has(key))
      combos.set(key, { key, cell: e.sourceCell, layer: e.layer, datatype: e.datatype, count: 0 });
    combos.get(key).count++;
  }
  return {
    name: 'Demo mask',
    root: 'TOP',
    roots: ['TOP'],
    elements: operable,
    linework,
    bounds,
    combos: [...combos.values()],
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
