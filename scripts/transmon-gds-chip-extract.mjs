import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flattenGDS, parseGDS } from '../site/gds.js';

const decoder = new TextDecoder('ascii');

function nameInRecord(bytes, start, end) {
  return decoder
    .decode(bytes.subarray(start + 4, end))
    .replace(/\0+$/, '')
    .trim();
}

/** Preserve every original structure record; select a reachable GDS hierarchy, not redrawn polygons. */
export function extractGDSCell(source, rootName) {
  const bytes = Buffer.from(source);
  const structures = [];
  let firstStructure = -1;
  let current = null;
  let libraryEnd = -1;
  for (let pos = 0; pos < bytes.length;) {
    if (pos + 4 > bytes.length) throw new Error(`Truncated GDS record at byte ${pos}.`);
    const length = bytes.readUInt16BE(pos);
    if (length < 4 || pos + length > bytes.length) {
      throw new Error(`Invalid GDS record at byte ${pos}.`);
    }
    const type = bytes[pos + 2];
    const end = pos + length;
    if (type === 0x05) {
      if (current) throw new Error('Nested GDS structure.');
      if (firstStructure < 0) firstStructure = pos;
      current = { start: pos, name: null, references: new Set(), bytes: null };
    } else if (type === 0x06 && current) {
      current.name = nameInRecord(bytes, pos, end);
    } else if (type === 0x12 && current) {
      current.references.add(nameInRecord(bytes, pos, end));
    } else if (type === 0x07 && current) {
      if (!current.name) throw new Error('GDS structure is missing STRNAME.');
      current.bytes = bytes.subarray(current.start, end);
      structures.push(current);
      current = null;
    } else if (type === 0x04) {
      if (current) throw new Error('GDS library ends inside a structure.');
      libraryEnd = pos;
      if (end !== bytes.length) throw new Error('Trailing bytes after ENDLIB.');
      break;
    }
    pos = end;
  }
  if (current || firstStructure < 0 || libraryEnd < 0) {
    throw new Error('Incomplete GDS library or structure.');
  }
  const byName = new Map();
  for (const cell of structures) {
    if (byName.has(cell.name)) throw new Error(`Duplicate GDS cell "${cell.name}".`);
    byName.set(cell.name, cell);
  }
  if (!byName.has(rootName)) throw new Error(`Unknown GDS cell "${rootName}".`);
  const reachable = new Set();
  const visit = (name, ancestry = new Set()) => {
    if (ancestry.has(name)) throw new Error(`Recursive GDS hierarchy at "${name}".`);
    if (reachable.has(name)) return;
    const cell = byName.get(name);
    if (!cell) throw new Error(`Missing referenced GDS cell "${name}".`);
    const next = new Set(ancestry);
    next.add(name);
    for (const child of cell.references) visit(child, next);
    reachable.add(name);
  };
  visit(rootName);
  const parts = [bytes.subarray(0, firstStructure)];
  for (const cell of structures) if (reachable.has(cell.name)) parts.push(cell.bytes);
  parts.push(bytes.subarray(libraryEnd));
  return {
    bytes: Buffer.concat(parts),
    sourceCells: structures.length,
    selectedCells: reachable.size,
    root: rootName,
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyGDSSelection(original, selected, rootName) {
  const src = parseGDS(
    original.buffer.slice(original.byteOffset, original.byteOffset + original.length),
  );
  const dst = parseGDS(
    selected.buffer.slice(selected.byteOffset, selected.byteOffset + selected.length),
  );
  if (dst.roots.length !== 1 || dst.root !== rootName) {
    throw new Error(`Selected library has unexpected roots: ${dst.roots.join(', ')}`);
  }
  if (src.units.metersPerDbu !== dst.units.metersPerDbu) {
    throw new Error('GDS physical units changed during extraction.');
  }
  const lhs = flattenGDS(src, rootName);
  const rhs = flattenGDS(dst, rootName);
  const shapeSignature = (flat) => {
    const counts = {};
    for (const item of [...flat.elements, ...flat.linework]) {
      const key = `${item.kind}/${item.layer}/${item.datatype}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return {
      bounds: flat.bounds,
      counts,
      elements: flat.elements.length,
      linework: flat.linework.length,
    };
  };
  if (JSON.stringify(shapeSignature(lhs)) !== JSON.stringify(shapeSignature(rhs))) {
    throw new Error('Selected geometry differs from the original hierarchy.');
  }
  return { units: dst.units, ...shapeSignature(rhs), cells: dst.cells.size };
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(args) {
  const input = argValue(args, '--input');
  const output = argValue(args, '--output');
  const root = argValue(args, '--root');
  if (args.includes('--help') || !input || !output || !root) {
    console.log(
      'Usage: node scripts/transmon-gds-chip-extract.mjs --input sample.gds --root chip0 --output chip0.gds [--report report.json]',
    );
    if (!args.includes('--help')) process.exitCode = 2;
    return;
  }
  if (resolve(input) === resolve(output)) throw new Error('Output must not overwrite source GDS.');
  const source = await readFile(input);
  const expected = argValue(args, '--expected-sha256');
  if (expected && sha256(source) !== expected) throw new Error('Source SHA-256 mismatch.');
  const selected = extractGDSCell(source, root);
  const verification = verifyGDSSelection(source, selected.bytes, root);
  await writeFile(output, selected.bytes);
  const report = {
    source: input,
    sourceSha256: sha256(source),
    selectedRoot: root,
    sourceCells: selected.sourceCells,
    extractedCells: selected.selectedCells,
    outputSha256: sha256(selected.bytes),
    outputBytes: selected.bytes.length,
    verification,
    // The selected cell retains its local coordinates; reticle SREF translation is not applied.
    referenceFrame: 'selected cell local coordinates',
  };
  if (argValue(args, '--report'))
    await writeFile(argValue(args, '--report'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
