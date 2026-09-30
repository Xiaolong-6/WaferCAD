const MAGIC = '%SEMI-OASIS\r\n';
const MAGIC_BYTES = new TextEncoder().encode(MAGIC);
const ASCII = new TextDecoder('ascii');
const MAX_EXPANDED_ELEMENTS_PER_CELL = 120000;
export const MAX_OASIS_CBLOCK_BYTES = 128 * 1024 * 1024;

export function assertOasisBlockSize(byteLength, maxBytes = MAX_OASIS_CBLOCK_BYTES) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error('OASIS CBLOCK uncompressed size is invalid.');
  }
  if (byteLength > maxBytes) {
    throw new Error(
      `OASIS CBLOCK expands beyond the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`,
    );
  }
}

const CTRAPEZOID_COEFFICIENTS = [
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, -1, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, -1, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 1, 0, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [1, -1, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 1, 0, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, -1, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [1, 0, 0, 1],
    [1, -1, 0, 0],
  ],
  [
    [0, 1, 0, 0],
    [0, 0, 0, 1],
    [1, -1, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, 0, -1, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, -1, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 1, 0],
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, 0, -1, 1],
    [1, 0, 1, 0],
  ],
  [
    [0, 0, 1, 0],
    [0, 0, -1, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, -1, 1],
    [1, 0, 0, 1],
    [1, 0, 1, 0],
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [1, 0, -1, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 1, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 1, 0, 1],
    [0, 2, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 1],
    [0, 2, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 0, 1],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 2, 0],
    [1, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  [
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 2, 0],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 0],
  ],
];

class OasisReader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.pos = 0;
  }

  get remaining() {
    return this.bytes.length - this.pos;
  }

  byte() {
    if (this.pos >= this.bytes.length) throw new Error('Unexpected end of OASIS file.');
    return this.bytes[this.pos++];
  }

  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.pos + length > this.bytes.length) {
      throw new Error('Invalid OASIS byte range at ' + this.pos + '.');
    }
    const out = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }

  uint() {
    let value = 0;
    let factor = 1;
    for (let i = 0; i < 10; i++) {
      const b = this.byte();
      value += (b & 0x7f) * factor;
      if (!Number.isSafeInteger(value)) {
        throw new Error('OASIS integer exceeds JavaScript safe range.');
      }
      if (!(b & 0x80)) return value;
      factor *= 128;
    }
    throw new Error('Invalid OASIS variable-length integer.');
  }

  sint() {
    const raw = this.uint();
    const magnitude = Math.floor(raw / 2);
    return raw % 2 ? -magnitude : magnitude;
  }

  string() {
    return ASCII.decode(this.take(this.uint()));
  }

  real() {
    const type = this.uint();
    if (type === 0) return this.uint();
    if (type === 1) return -this.uint();
    if (type === 2) return 1 / this.uint();
    if (type === 3) return -1 / this.uint();
    if (type === 4) return this.uint() / this.uint();
    if (type === 5) return -this.uint() / this.uint();
    if (type === 6 || type === 7) {
      const size = type === 6 ? 4 : 8;
      const bytes = this.take(size);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return type === 6 ? view.getFloat32(0, true) : view.getFloat64(0, true);
    }
    throw new Error('Unsupported OASIS real type ' + type + '.');
  }
}

function requireModal(value, name) {
  if (value == null) throw new Error('OASIS modal variable ' + name + ' is undefined.');
  return value;
}

function validateNameString(value) {
  if (!value.length) throw new Error('Invalid OASIS n-string.');
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    const lower = index === 0 ? 0x21 : 0x20;
    if (code < lower || code > 0x7e) throw new Error('Invalid OASIS n-string.');
  }
  return value;
}

function decodeSigned(raw) {
  const magnitude = Math.floor(raw / 2);
  return raw % 2 ? -magnitude : magnitude;
}

function decodeOctangular(raw) {
  const direction = raw % 8;
  const magnitude = Math.floor(raw / 8);
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  return [directions[direction][0] * magnitude, directions[direction][1] * magnitude];
}

function decodeManhattan(raw) {
  const direction = raw % 4;
  const magnitude = Math.floor(raw / 4);
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  return [directions[direction][0] * magnitude, directions[direction][1] * magnitude];
}

function readDelta(reader) {
  const raw = reader.uint();
  if (raw % 2 === 0) return decodeOctangular(Math.floor(raw / 2));
  return [decodeSigned(Math.floor(raw / 2)), reader.sint()];
}

function readPointList(reader, implicitClosed) {
  const type = reader.uint();
  const count = reader.uint();
  const deltas = [];

  if (type === 0 || type === 1) {
    for (let i = 0; i < count; i++) {
      const value = reader.sint();
      const horizontal = type === 0 ? i % 2 === 0 : i % 2 === 1;
      deltas.push(horizontal ? [value, 0] : [0, value]);
    }
  } else if (type === 2) {
    for (let i = 0; i < count; i++) deltas.push(decodeManhattan(reader.uint()));
  } else if (type === 3) {
    for (let i = 0; i < count; i++) deltas.push(decodeOctangular(reader.uint()));
  } else if (type === 4) {
    for (let i = 0; i < count; i++) deltas.push(readDelta(reader));
  } else if (type === 5) {
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < count; i++) {
      const change = readDelta(reader);
      dx += change[0];
      dy += change[1];
      deltas.push([dx, dy]);
    }
  } else {
    throw new Error('Unsupported OASIS point-list type ' + type + '.');
  }

  if (implicitClosed) {
    const total = deltas.reduce(([x, y], [dx, dy]) => [x + dx, y + dy], [0, 0]);
    if (type === 0) deltas.push([-total[0], 0], [0, -total[1]]);
    else if (type === 1) deltas.push([0, -total[1]], [-total[0], 0]);
    else deltas.push([-total[0], -total[1]]);
  }
  return deltas;
}

function readRepetition(reader, previous) {
  const type = reader.uint();
  if (type === 0) return requireModal(previous, 'repetition');

  if (type === 1) {
    const cols = reader.uint() + 2;
    const rows = reader.uint() + 2;
    const dx = reader.uint();
    const dy = reader.uint();
    return {
      kind: 'matrix',
      cols: dx === 0 ? 1 : cols,
      rows: dy === 0 ? 1 : rows,
      a: [dx, 0],
      b: [0, dy],
    };
  }
  if (type === 2) {
    const cols = reader.uint() + 2;
    const dx = reader.uint();
    return {
      kind: 'matrix',
      cols: dx === 0 ? 1 : cols,
      rows: 1,
      a: [dx, 0],
      b: [0, 0],
    };
  }
  if (type === 3) {
    const rows = reader.uint() + 2;
    const dy = reader.uint();
    return {
      kind: 'matrix',
      cols: 1,
      rows: dy === 0 ? 1 : rows,
      a: [0, 0],
      b: [0, dy],
    };
  }

  if (type >= 4 && type <= 7) {
    const count = reader.uint() + 1;
    const grid = type === 5 || type === 7 ? reader.uint() : 1;
    const vertical = type === 6 || type === 7;
    const deltas = [];
    for (let i = 0; i < count; i++) {
      const value = reader.uint() * grid;
      if (value !== 0) deltas.push(vertical ? [0, value] : [value, 0]);
    }
    return { kind: 'arbitrary', deltas };
  }

  if (type === 8) {
    const cols = reader.uint() + 2;
    const rows = reader.uint() + 2;
    const a = readDelta(reader);
    const b = readDelta(reader);
    return {
      kind: 'matrix',
      cols: a[0] === 0 && a[1] === 0 ? 1 : cols,
      rows: b[0] === 0 && b[1] === 0 ? 1 : rows,
      a,
      b,
    };
  }
  if (type === 9) {
    const cols = reader.uint() + 2;
    const a = readDelta(reader);
    return {
      kind: 'matrix',
      cols: a[0] === 0 && a[1] === 0 ? 1 : cols,
      rows: 1,
      a,
      b: [0, 0],
    };
  }

  if (type === 10 || type === 11) {
    const count = reader.uint() + 1;
    const grid = type === 11 ? reader.uint() : 1;
    const deltas = [];
    for (let i = 0; i < count; i++) {
      const [x, y] = readDelta(reader);
      const delta = [x * grid, y * grid];
      if (delta[0] !== 0 || delta[1] !== 0) deltas.push(delta);
    }
    return { kind: 'arbitrary', deltas };
  }

  throw new Error('Unsupported OASIS repetition type ' + type + '.');
}

function* repetitionOffsets(repetition) {
  if (!repetition) {
    yield [0, 0];
    return;
  }
  if (repetition.kind === 'matrix') {
    for (let row = 0; row < repetition.rows; row++) {
      for (let col = 0; col < repetition.cols; col++) {
        yield [
          col * repetition.a[0] + row * repetition.b[0],
          col * repetition.a[1] + row * repetition.b[1],
        ];
      }
    }
    return;
  }

  yield [0, 0];
  let x = 0;
  let y = 0;
  for (const [dx, dy] of repetition.deltas) {
    x += dx;
    y += dy;
    yield [x, y];
  }
}

function readInterval(reader) {
  const type = reader.uint();
  if (type === 0) return;
  if (type === 1 || type === 2 || type === 3) {
    reader.uint();
    return;
  }
  if (type === 4) {
    reader.uint();
    reader.uint();
    return;
  }
  throw new Error('Unsupported OASIS interval type ' + type + '.');
}

function skipPropertyValue(reader) {
  const type = reader.uint();
  if (type <= 5) {
    reader.uint();
    if (type === 4 || type === 5) reader.uint();
  } else if (type === 6 || type === 7) {
    reader.take(type === 6 ? 4 : 8);
  } else if (type === 8) {
    reader.uint();
  } else if (type === 9) {
    reader.sint();
  } else if (type >= 10 && type <= 12) {
    reader.string();
  } else if (type >= 13 && type <= 15) {
    reader.uint();
  } else {
    throw new Error('Unsupported OASIS property value type ' + type + '.');
  }
}

function skipProperty(reader) {
  const info = reader.byte();
  let valueCount = info >> 4;
  const reuseValues = !!(info & 0x08);
  const hasName = !!(info & 0x04);
  const nameIsReference = !!(info & 0x02);

  if (hasName) {
    if (nameIsReference) reader.uint();
    else reader.string();
  }
  if (valueCount === 15) valueCount = reader.uint();
  if (!reuseValues) {
    for (let i = 0; i < valueCount; i++) skipPropertyValue(reader);
  }
}

function newModal() {
  return {
    absolute: true,
    layer: null,
    datatype: null,
    geomX: 0,
    geomY: 0,
    width: null,
    height: null,
    halfWidth: null,
    pointList: null,
    radius: null,
    ctrapezoidType: null,
    repetition: null,
    placementCellName: null,
    placementCellRef: null,
    placementX: 0,
    placementY: 0,
    textString: null,
    textLayer: null,
    textType: null,
    textX: 0,
    textY: 0,
  };
}

function updateCoord(modal, key, value) {
  modal[key] = modal.absolute ? value : modal[key] + value;
}

function pointsFromDeltas(x, y, deltas) {
  const points = [[x, y]];
  for (const [dx, dy] of deltas) {
    const last = points.at(-1);
    points.push([last[0] + dx, last[1] + dy]);
  }
  return points;
}

function samePoint(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function addRepeated(cell, createElement, repetition, scale) {
  for (const [dx, dy] of repetitionOffsets(repetition)) {
    if (cell.elements.length >= MAX_EXPANDED_ELEMENTS_PER_CELL) {
      throw new Error(
        'OASIS cell expands beyond the safe limit of ' +
          MAX_EXPANDED_ELEMENTS_PER_CELL +
          ' elements.',
      );
    }
    cell.elements.push(createElement(dx * scale, dy * scale));
  }
}

function trapezoidPoints(width, height, deltaA, deltaB, vertical) {
  if (vertical) {
    return [
      [0, Math.max(deltaA, 0)],
      [0, height + Math.min(deltaB, 0)],
      [width, height - Math.max(deltaB, 0)],
      [width, -Math.min(deltaA, 0)],
    ];
  }
  return [
    [Math.max(deltaA, 0), height],
    [width + Math.min(deltaB, 0), height],
    [width - Math.max(deltaB, 0), 0],
    [-Math.min(deltaA, 0), 0],
  ];
}

function ctrapezoidPoints(type, width, height) {
  const coefficients = CTRAPEZOID_COEFFICIENTS[type];
  if (!coefficients) throw new Error('Invalid OASIS CTRAPEZOID type ' + type + '.');
  const points = coefficients.map(([xw, xh, yw, yh]) => [
    xw * width + xh * height,
    yw * width + yh * height,
  ]);
  if (samePoint(points[0], points.at(-1))) points.pop();
  return points;
}

async function inflateRaw(bytes, expectedSize) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Compressed OASIS blocks are not supported by this browser.');
  }

  async function inflate(format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        assertOasisBlockSize(total);
        if (total > expectedSize) {
          throw new Error(
            `OASIS CBLOCK expanded beyond its declared size of ${expectedSize} bytes.`,
          );
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  try {
    return await inflate('deflate-raw');
  } catch (rawError) {
    try {
      return await inflate('deflate');
    } catch {
      throw new Error('OASIS CBLOCK decompression failed: ' + rawError.message);
    }
  }
}

function hasMagic(bytes) {
  if (bytes.length < MAGIC_BYTES.length) return false;
  return MAGIC_BYTES.every((value, index) => bytes[index] === value);
}

export function isOASIS(arrayBuffer) {
  return hasMagic(new Uint8Array(arrayBuffer));
}

export async function parseOAS(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!hasMagic(bytes)) throw new Error('Invalid OASIS file signature.');

  const reader = new OasisReader(bytes);
  reader.take(MAGIC_BYTES.length);

  const cellNames = new Map();
  const textStrings = new Map();
  const referencedCellNameIds = new Set();
  const referencedTextStringIds = new Set();
  const cellsInOrder = [];
  let cellNameMode = null;
  let textStringMode = null;
  let currentCell = null;
  let modal = newModal();
  let unit = null;
  let version = '';

  function beginCell(name, nameRef = null) {
    currentCell = { name: name || '', nameRef, elements: [] };
    cellsInOrder.push(currentCell);
    modal = newModal();
  }

  function requireCell(recordId) {
    if (!currentCell) {
      throw new Error('OASIS geometry record ' + recordId + ' appeared outside a cell.');
    }
    return currentCell;
  }

  async function parseRecords(input, nested = false) {
    while (input.remaining > 0) {
      const recordOffset = input.pos;
      const id = input.uint();

      try {
        if (id === 0) continue;

        if (id === 1) {
          if (nested) throw new Error('START is not valid inside a compressed block.');
          version = input.string();
          unit = input.real();
          if (!Number.isFinite(unit) || unit <= 0) {
            throw new Error('Invalid OASIS database unit.');
          }
          const offsetFlag = input.uint();
          if (offsetFlag === 0) {
            for (let i = 0; i < 6; i++) {
              input.uint();
              input.uint();
            }
          } else if (offsetFlag !== 1) {
            throw new Error('Invalid OASIS offset-table flag ' + offsetFlag + '.');
          }
          continue;
        }

        if (id === 2) {
          if (nested) throw new Error('END is not valid inside a compressed block.');
          return true;
        }

        if (id === 3 || id === 4) {
          const mode = id === 3 ? 'implicit' : 'explicit';
          if (cellNameMode && cellNameMode !== mode) {
            throw new Error('Explicit and implicit CELLNAME modes cannot be mixed.');
          }
          cellNameMode = mode;
          const name = validateNameString(input.string());
          const ref = id === 3 ? cellNames.size : input.uint();
          cellNames.set(ref, name);
          continue;
        }

        if (id === 5 || id === 6) {
          const mode = id === 5 ? 'implicit' : 'explicit';
          if (textStringMode && textStringMode !== mode) {
            throw new Error('Explicit and implicit TEXTSTRING modes cannot be mixed.');
          }
          textStringMode = mode;
          const value = input.string();
          const ref = id === 5 ? textStrings.size : input.uint();
          textStrings.set(ref, value);
          continue;
        }

        if (id >= 7 && id <= 10) {
          input.string();
          if (id % 2 === 0) input.uint();
          continue;
        }

        if (id === 11 || id === 12) {
          input.string();
          readInterval(input);
          readInterval(input);
          continue;
        }

        if (id === 13) {
          const ref = input.uint();
          referencedCellNameIds.add(ref);
          beginCell('', ref);
          continue;
        }

        if (id === 14) {
          beginCell(validateNameString(input.string()));
          continue;
        }

        if (id === 15) {
          modal.absolute = true;
          continue;
        }

        if (id === 16) {
          modal.absolute = false;
          continue;
        }

        if (id === 17 || id === 18) {
          const cell = requireCell(id);
          const info = input.byte();

          if (info & 0x80) {
            if (info & 0x40) {
              modal.placementCellRef = input.uint();
              referencedCellNameIds.add(modal.placementCellRef);
              modal.placementCellName = null;
            } else {
              modal.placementCellName = validateNameString(input.string());
              modal.placementCellRef = null;
            }
          }

          if (modal.placementCellName == null && modal.placementCellRef == null) {
            throw new Error('OASIS placement cell modal is undefined.');
          }

          let angle = 0;
          let mag = 1;
          if (id === 17) {
            angle = [0, 90, 180, 270][Math.floor((info & 0x06) / 2)] || 0;
          } else {
            if (info & 0x04) mag = input.real();
            if (info & 0x02) angle = input.real();
          }

          if (info & 0x20) updateCoord(modal, 'placementX', input.sint());
          if (info & 0x10) updateCoord(modal, 'placementY', input.sint());

          let repetition = null;
          if (info & 0x08) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const scale = 1 / requireModal(unit, 'unit');
          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'sref',
              name: modal.placementCellName || '',
              nameRef: modal.placementCellName == null ? modal.placementCellRef : null,
              xy: [modal.placementX * scale + dx, modal.placementY * scale + dy],
              points: [[modal.placementX * scale + dx, modal.placementY * scale + dy]],
              mag,
              angle,
              reflect: !!(info & 0x01),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 19) {
          requireCell(id);
          const info = input.byte();
          if (info & 0x40) {
            if (info & 0x20) {
              const ref = input.uint();
              referencedTextStringIds.add(ref);
              modal.textString = { ref };
            } else {
              modal.textString = input.string();
            }
          }
          if (info & 0x01) modal.textLayer = input.uint();
          if (info & 0x02) modal.textType = input.uint();
          if (info & 0x10) updateCoord(modal, 'textX', input.sint());
          if (info & 0x08) updateCoord(modal, 'textY', input.sint());
          if (info & 0x04) modal.repetition = readRepetition(input, modal.repetition);

          requireModal(modal.textString, 'text-string');
          requireModal(modal.textLayer, 'textlayer');
          requireModal(modal.textType, 'texttype');
          continue;
        }

        if (id === 20) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x40) modal.width = input.uint();
          if (info & 0x80) modal.height = modal.width;
          else if (info & 0x20) modal.height = input.uint();
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          const x = modal.geomX * scale;
          const y = modal.geomY * scale;
          const width = requireModal(modal.width, 'width') * scale;
          const height = requireModal(modal.height, 'height') * scale;

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'polygon',
              layer,
              datatype,
              points: [
                [x + dx, y + dy],
                [x + width + dx, y + dy],
                [x + width + dx, y + height + dy],
                [x + dx, y + height + dy],
              ],
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 21) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x20) modal.pointList = readPointList(input, true);
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          let points = pointsFromDeltas(
            modal.geomX,
            modal.geomY,
            requireModal(modal.pointList, 'point-list'),
          );

          if (points.length > 2 && samePoint(points[0], points.at(-1))) points.pop();
          points = points.map(([x, y]) => [x * scale, y * scale]);

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'polygon',
              layer,
              datatype,
              points: points.map(([x, y]) => [x + dx, y + dy]),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 22) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x40) modal.halfWidth = input.uint();

          if (info & 0x80) {
            const scheme = input.byte();
            if ((scheme & 0x03) === 3) input.sint();
            if (((scheme >> 2) & 0x03) === 3) input.sint();
          }

          if (info & 0x20) modal.pointList = readPointList(input, false);
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          const points = pointsFromDeltas(
            modal.geomX,
            modal.geomY,
            requireModal(modal.pointList, 'point-list'),
          ).map(([x, y]) => [x * scale, y * scale]);

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'path',
              layer,
              datatype,
              width: requireModal(modal.halfWidth, 'half-width') * 2 * scale,
              points: points.map(([x, y]) => [x + dx, y + dy]),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id >= 23 && id <= 25) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x40) modal.width = input.uint();
          if (info & 0x20) modal.height = input.uint();

          const deltaA = id === 23 || id === 24 ? input.sint() : 0;
          const deltaB = id === 23 || id === 25 ? input.sint() : 0;

          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          const width = requireModal(modal.width, 'width');
          const height = requireModal(modal.height, 'height');
          const points = trapezoidPoints(width, height, deltaA, deltaB, !!(info & 0x80)).map(
            ([x, y]) => [(modal.geomX + x) * scale, (modal.geomY + y) * scale],
          );

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'polygon',
              layer,
              datatype,
              points: points.map(([x, y]) => [x + dx, y + dy]),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 26) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x80) modal.ctrapezoidType = input.uint();
          if (info & 0x40) modal.width = input.uint();
          if (info & 0x20) modal.height = input.uint();
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          const type = requireModal(modal.ctrapezoidType, 'ctrapezoid-type');
          const needsWidth = type <= 19 || type >= 24;
          const needsHeight = type <= 15 || (type >= 20 && type <= 24);
          const width = needsWidth ? requireModal(modal.width, 'width') : 0;
          const height = needsHeight ? requireModal(modal.height, 'height') : 0;
          const localPoints = ctrapezoidPoints(type, width, height);
          modal.width = Math.max(...localPoints.map(([x]) => x), 0);
          modal.height = Math.max(...localPoints.map(([, y]) => y), 0);
          const points = localPoints.map(([x, y]) => [
            (modal.geomX + x) * scale,
            (modal.geomY + y) * scale,
          ]);

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'polygon',
              layer,
              datatype,
              points: points.map(([x, y]) => [x + dx, y + dy]),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 27) {
          const cell = requireCell(id);
          const info = input.byte();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          if (info & 0x20) modal.radius = input.uint();
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());

          let repetition = null;
          if (info & 0x04) {
            repetition = readRepetition(input, modal.repetition);
            modal.repetition = repetition;
          }

          const layer = requireModal(modal.layer, 'layer');
          const datatype = requireModal(modal.datatype, 'datatype');
          const scale = 1 / requireModal(unit, 'unit');
          const radius = requireModal(modal.radius, 'radius') * scale;
          const cx = modal.geomX * scale;
          const cy = modal.geomY * scale;
          const segments = 96;

          addRepeated(
            cell,
            (dx, dy) => ({
              kind: 'polygon',
              layer,
              datatype,
              points: Array.from({ length: segments }, (_, i) => {
                const angle = (i * 2 * Math.PI) / segments;
                return [cx + dx + Math.cos(angle) * radius, cy + dy + Math.sin(angle) * radius];
              }),
            }),
            repetition,
            scale,
          );
          continue;
        }

        if (id === 28) {
          skipProperty(input);
          continue;
        }
        if (id === 29) continue;

        if (id === 30 || id === 31) {
          input.uint();
          input.string();
          if (id === 31) input.uint();
          continue;
        }

        if (id === 32) {
          requireCell(id);
          input.uint();
          input.string();
          continue;
        }

        if (id === 33) {
          requireCell(id);
          const info = input.byte();
          input.uint();
          if (info & 0x01) modal.layer = input.uint();
          if (info & 0x02) modal.datatype = input.uint();
          input.string();
          if (info & 0x10) updateCoord(modal, 'geomX', input.sint());
          if (info & 0x08) updateCoord(modal, 'geomY', input.sint());
          if (info & 0x04) modal.repetition = readRepetition(input, modal.repetition);
          continue;
        }

        if (id === 34) {
          const compressionType = input.uint();
          const uncompressedSize = input.uint();
          assertOasisBlockSize(uncompressedSize);
          const compressedSize = input.uint();
          const compressed = input.take(compressedSize);

          if (compressionType !== 0) {
            throw new Error('Unsupported OASIS CBLOCK compression type ' + compressionType + '.');
          }

          const expanded = await inflateRaw(compressed, uncompressedSize);
          if (expanded.length !== uncompressedSize) {
            throw new Error(
              'OASIS CBLOCK size mismatch: expected ' +
                uncompressedSize +
                ', got ' +
                expanded.length +
                '.',
            );
          }
          await parseRecords(new OasisReader(expanded), true);
          continue;
        }

        throw new Error('Unsupported OASIS record ' + id + '.');
      } catch (error) {
        throw new Error('OASIS record ' + id + ' at byte ' + recordOffset + ': ' + error.message);
      }
    }
    return false;
  }

  await parseRecords(reader);
  if (unit == null) throw new Error('OASIS START record was not found.');

  for (const ref of referencedCellNameIds) {
    if (!cellNames.has(ref)) throw new Error('No cell name defined for OASIS cell id ' + ref + '.');
  }
  for (const ref of referencedTextStringIds) {
    if (!textStrings.has(ref)) throw new Error('No text string defined for OASIS id ' + ref + '.');
  }

  for (const cell of cellsInOrder) {
    if (!cell.name) cell.name = cellNames.get(cell.nameRef) || 'CELL_' + cell.nameRef;
  }

  for (const cell of cellsInOrder) {
    for (const element of cell.elements) {
      if (element.kind === 'sref' && !element.name) {
        element.name = cellNames.get(element.nameRef) || 'CELL_' + element.nameRef;
        delete element.nameRef;
      }
    }
  }

  const cells = new Map();
  const cellOrder = [];
  for (const cell of cellsInOrder) {
    cells.set(cell.name, { name: cell.name, elements: cell.elements });
    cellOrder.push(cell.name);
  }

  const referenced = new Set();
  for (const cell of cells.values()) {
    for (const element of cell.elements) {
      if (element.kind === 'sref') referenced.add(element.name);
    }
  }

  const roots = cellOrder.filter((name) => !referenced.has(name));
  return {
    format: 'OASIS',
    version,
    cells,
    cellOrder,
    roots,
    root: roots.at(-1) || cellOrder.at(-1),
    units: {
      xy: 'µm',
      dbuToMicron: 1 / unit,
      hasPhysicalUnits: true,
      oasisUnit: unit,
    },
  };
}
