// Fig1b Mask geometry is read verbatim from the user-approved vector asset.
// Restricted to the paths, rectangles, mirrored ACTIVE and CNT symbols used
// by this SVG; unexpected markup/commands fail instead of approximating.
import { readFileSync } from 'node:fs';

const svg = readFileSync(
  new URL(
    '../examples/projects/tcmos-ternary-inverter-2019-candidate/layout-complete.svg',
    import.meta.url,
  ),
  'utf8',
);
const layerIds = { ACTIVE: 1, POLY: 6, LVTN: 12, LVTP: 13, HVTN: 4, HVTP: 5, CNT: 10, METAL1: 11 };
const expected = { ACTIVE: 4, POLY: 2, LVTN: 1, LVTP: 1, HVTN: 1, HVTP: 1, CNT: 218, METAL1: 4 };
export const TCMOS_SVG_FRAME = Object.freeze({
  width: 1113,
  height: 758,
  origin: [560, 480],
  unitsPerIllustrativeUm: 80,
});
const toUm = ([x, y]) => [
  Math.round(((x - 560) / 80) * 1000000) / 1000000,
  Math.round(((480 - y) / 80) * 1000000) / 1000000,
];
function attributes(tag) {
  const entries = [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  return Object.fromEntries(entries);
}
function group(name) {
  const begin = svg.indexOf('<g id="layer-' + name + '"');
  if (begin < 0) throw Error('Missing layer in approved SVG: ' + name);
  let depth = 0;
  const text = svg.slice(begin);
  for (const match of text.matchAll(/<\/?g(?:\s[^>]*)?>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return text.slice(0, match.index + match[0].length);
  }
  throw Error('Unclosed SVG group: ' + name);
}
function rect(a) {
  const x = Number(a.x),
    y = Number(a.y),
    w = Number(a.width),
    h = Number(a.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    throw Error('Invalid SVG rectangle');
  }
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}
function path(d) {
  const tokens = d.match(/[MLHVZ]|-?\d+(?:\.\d+)?/g) || [];
  const points = [];
  let x = 0,
    y = 0,
    i = 0;
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === 'M' || op === 'L') {
      x = Number(tokens[i++]);
      y = Number(tokens[i++]);
    } else if (op === 'H') x = Number(tokens[i++]);
    else if (op === 'V') y = Number(tokens[i++]);
    else if (op === 'Z') continue;
    else throw Error('Unsupported SVG command: ' + op);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Nonfinite SVG point');
    points.push([x, y]);
  }
  if (points.length < 3 || tokens.at(-1) !== 'Z') throw Error('Unclosed SVG polygon');
  return points;
}
function shape(tag, a) {
  if (tag === 'rect') return rect(a);
  if (tag === 'use') {
    if (a.href !== '#cnt-unit' || a.width !== '10' || a.height !== '10') {
      throw Error('Unexpected SVG contact symbol');
    }
    // #cnt-unit is an 8.6px square at viewBox(-5,-5,10,10).
    return rect({ x: Number(a.x) + 0.7, y: Number(a.y) + 0.7, width: 8.6, height: 8.6 });
  }
  const points = path(a.d || '');
  if (!a.transform) return points;
  if (a.transform !== 'translate(1120 0) scale(-1 1)') {
    throw Error('Unexpected SVG transform: ' + a.transform);
  }
  return points.map(([x, y]) => [1120 - x, y]);
}
export function readTcmosReferenceMask() {
  return Object.entries(layerIds).map(([name, layer]) => {
    const shapes = [...group(name).matchAll(/<(path|rect|use)\b([^>]*?)\/>/g)].map((m, i) => {
      const a = attributes(m[2]);
      return { id: a.id || name + '-' + i, points: shape(m[1], a).map(toUm) };
    });
    if (shapes.length !== expected[name]) {
      throw Error('SVG layer shape count changed: ' + name);
    }
    return { name, layer, datatype: 0, shapes };
  });
}
