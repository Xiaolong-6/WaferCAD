// Grid-boundary handles for production desktop. Preview resize in CSS, commit once on release.
import { activeTracks, displayedViews } from './view-layout-model.js';
import { templateById, templateFits } from './view-layout-templates.js';

export function createDesktopLayoutResizer({ root, enabled, getState, dispatch }) {
  const host = root.querySelector('.p-canvases');
  if (!host) throw Error('Desktop grid host unavailable');
  let handles = [];
  let drag = null;
  const MIN_WIDTH = 122;
  const MIN_HEIGHT = 96;

  function geometry() {
    const state = getState();
    if (!enabled() || state.maximized || displayedViews(state).length <= 1) return null;
    const template = templateById(state.preset);
    const ratios = activeTracks(state);
    if (!template || !ratios) return null;
    const rect = host.getBoundingClientRect();
    const style = getComputedStyle(host);
    const left = Number.parseFloat(style.paddingLeft) || 0;
    const top = Number.parseFloat(style.paddingTop) || 0;
    const right = Number.parseFloat(style.paddingRight) || 0;
    const bottom = Number.parseFloat(style.paddingBottom) || 0;
    const colGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const innerWidth = rect.width - left - right;
    const innerHeight = rect.height - top - bottom;
    const width = innerWidth - colGap * (ratios.columns.length - 1);
    const height = innerHeight - rowGap * (ratios.rows.length - 1);
    if (width <= 0 || height <= 0 || !templateFits(template, innerWidth, innerHeight, {
      columns: ratios.columns, rows: ratios.rows,
      gap: Math.max(colGap, rowGap), minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT,
    })) return null;
    const colWidths = ratios.columns.map((value) => value * width);
    const rowHeights = ratios.rows.map((value) => value * height);
    return { template, ratios, left, top, colGap, rowGap, width, height, colWidths, rowHeights };
  }
  function cumulative(lengths, gap, index) {
    return lengths.slice(0, index).reduce((a, b) => a + b, 0) + gap * index;
  }
  function refresh() {
    if (drag) return;
    handles.forEach((node) => node.remove());
    handles = [];
    const g = geometry();
    if (!g) return;
    const append = (axis, index, start, end, crossStart, crossLength) => {
      if (crossLength < 18) return;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'v2-dock-divider v2-dock-divider-' + axis;
      node.dataset.dockAxis = axis;
      node.dataset.dockIndex = String(index);
      node.setAttribute('role', 'separator');
      node.setAttribute('aria-orientation', axis === 'columns' ? 'vertical' : 'horizontal');
      node.setAttribute('aria-label', 'Resize docked views ' + (axis === 'columns' ? 'horizontally' : 'vertically'));
      node.setAttribute('aria-valuemin', '8');
      node.setAttribute('aria-valuemax', '92');
      node.setAttribute('aria-valuenow', String(Math.round(g.ratios[axis][index] * 100)));
      if (axis === 'columns') {
        node.style.left = (g.left + start) + 'px';
        node.style.top = (g.top + crossStart) + 'px';
        node.style.height = crossLength + 'px';
      } else {
        node.style.top = (g.top + start) + 'px';
        node.style.left = (g.left + crossStart) + 'px';
        node.style.width = crossLength + 'px';
      }
      node.style.setProperty('--dock-divider-width', String(end - start) + 'px');
      host.append(node);
      handles.push(node);
    };
    // Split boundaries are exposed only where adjacent grid slots differ.
    for (let axisIndex = 1; axisIndex < g.ratios.columns.length; axisIndex++) {
      let first = -1;
      for (let row = 0; row <= g.template.rows.length; row++) {
        const boundary = row < g.template.rows.length &&
          g.template.cells[row][axisIndex - 1] !== g.template.cells[row][axisIndex];
        if (boundary && first < 0) first = row;
        if (!boundary && first >= 0) {
          const y0 = cumulative(g.rowHeights, g.rowGap, first);
          const y1 = cumulative(g.rowHeights, g.rowGap, row) - g.rowGap;
          const x = cumulative(g.colWidths, g.colGap, axisIndex) - g.colGap / 2;
          append('columns', axisIndex - 1, x, x, y0, y1 - y0);
          first = -1;
        }
      }
    }
    for (let axisIndex = 1; axisIndex < g.ratios.rows.length; axisIndex++) {
      let first = -1;
      for (let column = 0; column <= g.template.columns.length; column++) {
        const boundary = column < g.template.columns.length &&
          g.template.cells[axisIndex - 1][column] !== g.template.cells[axisIndex][column];
        if (boundary && first < 0) first = column;
        if (!boundary && first >= 0) {
          const x0 = cumulative(g.colWidths, g.colGap, first);
          const x1 = cumulative(g.colWidths, g.colGap, column) - g.colGap;
          const y = cumulative(g.rowHeights, g.rowGap, axisIndex) - g.rowGap / 2;
          append('rows', axisIndex - 1, y, y, x0, x1 - x0);
          first = -1;
        }
      }
    }
  }
  function movedRatios(g, axis, index, delta) {
    const current = [...g.ratios[axis]];
    const available = axis === 'columns' ? g.width : g.height;
    const minimum = Math.max(0.08, (axis === 'columns' ? MIN_WIDTH : MIN_HEIGHT) / available);
    const total = current[index] + current[index + 1];
    if (total <= minimum * 2) return null;
    const next = Math.max(minimum, Math.min(total - minimum, current[index] + delta / available));
    current[index + 1] = total - next;
    current[index] = next;
    return current;
  }
  function setPreview(axis, values) {
    host.style[axis === 'columns' ? 'gridTemplateColumns' : 'gridTemplateRows'] =
      values.map((value) => 'minmax(0, ' + value + 'fr)').join(' ');
  }
  function pointerDown(event) {
    const handle = event.target.closest('.v2-dock-divider');
    if (!enabled() || !handle || !host.contains(handle) ||
        event.button !== 0 || event.isPrimary === false) return;
    const g = geometry();
    if (!g) return;
    const axis = handle.dataset.dockAxis;
    const index = Number(handle.dataset.dockIndex);
    drag = { pointerId: event.pointerId, axis, index, start: axis === 'columns' ? event.clientX : event.clientY,
      g, values: [...g.ratios[axis]], handle };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const position = drag.axis === 'columns' ? event.clientX : event.clientY;
    const next = movedRatios(drag.g, drag.axis, drag.index, position - drag.start);
    if (!next) return;
    drag.values = next;
    setPreview(drag.axis, next);
    event.preventDefault();
  }
  function pointerEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    if (event.type !== 'pointercancel') {
      dispatch({ type: 'SET_RATIOS', axis: current.axis, values: current.values });
    } else {
      setPreview(current.axis, current.g.ratios[current.axis]);
    }
    requestAnimationFrame(refresh);
  }
  function keyDown(event) {
    const handle = event.target.closest('.v2-dock-divider');
    if (!enabled() || !handle || !host.contains(handle)) return;
    const axis = handle.dataset.dockAxis;
    const forward = axis === 'columns' ? event.key === 'ArrowRight' : event.key === 'ArrowDown';
    const backward = axis === 'columns' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
    if (!forward && !backward) return;
    const g = geometry();
    if (!g) return;
    const index = Number(handle.dataset.dockIndex);
    const next = movedRatios(g, axis, index, (forward ? 1 : -1) * (event.shiftKey ? 25 : 8));
    if (next) dispatch({ type: 'SET_RATIOS', axis, values: next });
    event.preventDefault();
  }
  host.addEventListener('pointerdown', pointerDown);
  document.addEventListener('pointermove', pointerMove, { passive: false });
  document.addEventListener('pointerup', pointerEnd);
  document.addEventListener('pointercancel', pointerEnd);
  host.addEventListener('keydown', keyDown);
  window.addEventListener('resize', refresh);
  return Object.freeze({
    refresh,
    destroy() {
      host.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerup', pointerEnd);
      document.removeEventListener('pointercancel', pointerEnd);
      host.removeEventListener('keydown', keyDown);
      window.removeEventListener('resize', refresh);
      handles.forEach((node) => node.remove());
      handles = [];
    },
  });
}
