// Pure desktop layout template registry. No DOM/Renderer/Project dependencies.
const make = (id, label, cells, columns, rows) => {
  const count = Math.max(...cells.flat()) + 1;
  if (cells.some((row) => row.length !== columns.length) || cells.length !== rows.length)
    throw Error(`Invalid grid shape: ${id}`);
  if (
    columns.some((n) => !Number.isFinite(n) || n <= 0) ||
    rows.some((n) => !Number.isFinite(n) || n <= 0)
  )
    throw Error(`Invalid grid tracks: ${id}`);
  const spans = Array.from({ length: count }, (_, slot) => {
    const coords = [];
    cells.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value === slot) coords.push([r, c]);
      }),
    );
    if (!coords.length) throw Error(`Missing slot ${slot}: ${id}`);
    const r0 = Math.min(...coords.map(([r]) => r));
    const r1 = Math.max(...coords.map(([r]) => r));
    const c0 = Math.min(...coords.map(([, c]) => c));
    const c1 = Math.max(...coords.map(([, c]) => c));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (cells[r][c] !== slot) throw Error(`Nonrectangular slot ${slot}: ${id}`);
    return Object.freeze({
      slot,
      row: r0,
      column: c0,
      rowSpan: r1 - r0 + 1,
      columnSpan: c1 - c0 + 1,
    });
  });
  return Object.freeze({
    id,
    label,
    count,
    cells: Object.freeze(cells.map((row) => Object.freeze([...row]))),
    columns: Object.freeze([...columns]),
    rows: Object.freeze([...rows]),
    spans: Object.freeze(spans),
  });
};

const ALL = Object.freeze([
  make('one-full', 'Single view', [[0]], [1], [1]),
  make('two-equal', 'Two columns', [[0, 1]], [1, 1], [1]),
  make('two-left', 'Left wide', [[0, 1]], [1.8, 1], [1]),
  make('two-right', 'Right wide', [[0, 1]], [1, 1.8], [1]),
  make('two-rows', 'Two rows', [[0], [1]], [1], [1, 1]),
  make(
    'three-left',
    'Main left',
    [
      [0, 1],
      [0, 2],
    ],
    [1.7, 1],
    [1, 1],
  ),
  make(
    'three-right',
    'Main right',
    [
      [1, 0],
      [2, 0],
    ],
    [1, 1.7],
    [1, 1],
  ),
  make(
    'three-top',
    'Main top',
    [
      [0, 0],
      [1, 2],
    ],
    [1, 1],
    [1.7, 1],
  ),
  make(
    'three-bottom',
    'Main bottom',
    [
      [1, 2],
      [0, 0],
    ],
    [1, 1],
    [1, 1.7],
  ),
  make('three-columns', 'Three columns', [[0, 1, 2]], [1, 1, 1], [1]),
  make('three-rows', 'Three rows', [[0], [1], [2]], [1], [1, 1, 1]),
  make(
    'four-grid',
    'Overview · 2 × 2',
    [
      [0, 1],
      [2, 3],
    ],
    [1, 1],
    [1, 1],
  ),
  make(
    'four-left',
    'Main left',
    [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    [1.7, 1],
    [1, 1, 1],
  ),
  make(
    'four-right',
    'Main right',
    [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    [1, 1.7],
    [1, 1, 1],
  ),
  make(
    'four-top',
    'Main top',
    [
      [0, 0, 0],
      [1, 2, 3],
    ],
    [1, 1, 1],
    [1.7, 1],
  ),
  make(
    'four-bottom',
    'Main bottom',
    [
      [1, 2, 3],
      [0, 0, 0],
    ],
    [1, 1, 1],
    [1, 1.7],
  ),
  make('four-columns', 'Four columns', [[0, 1, 2, 3]], [1, 1, 1, 1], [1]),
  make('four-rows', 'Four rows', [[0], [1], [2], [3]], [1], [1, 1, 1, 1]),
  make(
    'four-corner',
    'Corner main',
    [
      [0, 0, 1],
      [0, 0, 2],
      [3, 3, 2],
    ],
    [1, 1, 1],
    [1, 1, 1],
  ),
]);

const BY_ID = new Map(ALL.map((template) => [template.id, template]));
export const VIEW_LAYOUT_DEFAULTS = Object.freeze({
  0: null,
  1: 'one-full',
  2: 'two-equal',
  3: 'three-left',
  4: 'four-grid',
});
export const VIEW_LAYOUT_TEMPLATES = ALL;
export function templateOptions(count) {
  return ALL.filter((template) => template.count === count);
}
export function templateById(id) {
  return BY_ID.get(id) || null;
}
export function resolveTemplate(count, requestedId) {
  if (count === 0) return null;
  const candidate = templateById(requestedId);
  return candidate?.count === count ? candidate : templateById(VIEW_LAYOUT_DEFAULTS[count]);
}
export function trackFractions(values) {
  const sum = values.reduce((acc, n) => acc + n, 0);
  return values.map((n) => n / sum);
}
// Returns a result instead of coercing an invalid/too-small workspace into an overlapping grid.
// Geometry consumers decide whether to disable a preset or enable explicit stage scrolling.
export function templateFits(
  template,
  width,
  height,
  {
    gap = 8,
    minWidth = 150,
    minHeight = 110,
    columns = template?.columns,
    rows = template?.rows,
  } = {},
) {
  if (
    !template ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Array.isArray(columns) ||
    !Array.isArray(rows) ||
    columns.length !== template.columns.length ||
    rows.length !== template.rows.length ||
    [...columns, ...rows].some((n) => !Number.isFinite(n) || n <= 0)
  )
    return false;
  const col = trackFractions(columns);
  const row = trackFractions(rows);
  const usableWidth = width - gap * (columns.length - 1);
  const usableHeight = height - gap * (rows.length - 1);
  if (usableWidth <= 0 || usableHeight <= 0) return false;
  return template.spans.every(
    ({ row: r, column: c, rowSpan, columnSpan }) =>
      usableWidth * col.slice(c, c + columnSpan).reduce((a, b) => a + b, 0) +
        gap * (columnSpan - 1) >=
        minWidth &&
      usableHeight * row.slice(r, r + rowSpan).reduce((a, b) => a + b, 0) + gap * (rowSpan - 1) >=
        minHeight,
  );
}
