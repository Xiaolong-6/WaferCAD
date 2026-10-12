// Square is a v2 constraint over the existing rectangular inspection ROI.
// It introduces no stored shape type, model mutation or geometry quantization.
import { normalizeRoi } from '../roi-editor.js';

export function squareFromDrag(start, end) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return normalizeRoi({
    type: 'rect',
    a: start,
    b: [start[0] + (dx < 0 ? -side : side), start[1] + (dy < 0 ? -side : side)],
  });
}

export function constrainSquare(next, previous) {
  if (!next || next.type !== 'rect') return next;
  const width = next.b[0] - next.a[0],
    height = next.b[1] - next.a[1];
  if (Math.abs(width - height) <= 1e-12) return next;
  // Keep the corner opposite the resized handle fixed. Translations and
  // numeric edits with equal dimensions pass through without reconstruction.
  const fixed = [0, 1].map((axis) =>
    previous?.type === 'rect' && Math.abs(next.b[axis] - previous.b[axis]) <= 1e-12
      ? next.b[axis]
      : next.a[axis],
  );
  const moving = [0, 1].map((axis) => (fixed[axis] === next.a[axis] ? next.b[axis] : next.a[axis]));
  return squareFromDrag(fixed, moving);
}
