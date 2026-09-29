import { flattenGDS, parseGDS } from './gds.js';
import { isOASIS, parseOAS } from './oasis.js';

function uniqueLibraryRoot(parsed) {
  const roots = parsed.roots?.filter((name) => parsed.cells.has(name)) || [];
  if (roots.length <= 1) return parsed;

  const base = 'Library';
  let name = base;
  let suffix = 2;
  while (parsed.cells.has(name)) name = base + ' ' + suffix++;

  parsed.cells.set(name, {
    name,
    elements: roots.map((child) => ({
      kind: 'sref',
      name: child,
      layer: 0,
      datatype: 0,
      width: 0,
      points: [[0, 0]],
      xy: [0, 0],
      mag: 1,
      angle: 0,
      reflect: false,
    })),
  });
  parsed.cellOrder.push(name);
  parsed.root = name;
  return parsed;
}

function isGzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(arrayBuffer) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Gzip-compressed layouts are not supported by this browser.');
  }
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function parseLayoutFile(arrayBuffer, filename = '') {
  const sourceBuffer = isGzip(arrayBuffer) ? await gunzip(arrayBuffer) : arrayBuffer;
  const oasisByMagic = isOASIS(sourceBuffer);
  const oasisByName = /\.(?:oas|oasis)(?:\.gz)?$/i.test(filename);

  let parsed;
  let format;
  if (oasisByMagic || oasisByName) {
    parsed = await parseOAS(sourceBuffer);
    format = 'OASIS';
  } else {
    parsed = parseGDS(sourceBuffer);
    format = 'GDSII';
  }

  uniqueLibraryRoot(parsed);
  const layout = flattenGDS(parsed, parsed.root);
  layout.name = filename || format + ' layout';
  layout.units = parsed.units || layout.units;
  return { format, parsed, layout };
}
