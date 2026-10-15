// Production desktop-only titlebar docking. Scientific hosts never move or remount.
// All committed changes flow through the pure layout reducer in workstation-entry.js.
import { displayedViews } from './view-layout-model.js';
import { templateFits, templateOptions } from './view-layout-templates.js';

export function createDesktopDockingController({ root, getState, dispatch, enabled }) {
  const stage = root.querySelector('.p-stage');
  if (!stage) throw Error('Desktop docking requires a persistent workstation stage');
  const overlay = document.createElement('div');
  overlay.className = 'v2-dock-overlay';
  overlay.hidden = true;
  const palette = document.createElement('div');
  palette.className = 'v2-dock-picker';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Snap layouts');
  const ghost = document.createElement('div');
  ghost.className = 'v2-dock-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  overlay.append(palette, ghost);
  stage.append(overlay);

  let pending = null;
  let keyboardSource = null;
  let hovered = null;
  let focusReturn = null;
  const MIN_DRAG = 8;

  function templatesForCurrentStage() {
    const count = displayedViews(getState()).length;
    const rect = stage.querySelector('.p-canvases').getBoundingClientRect();
    return templateOptions(count).map((template) => ({
      template,
      allowed: templateFits(template, rect.width, rect.height, {
        minWidth: 122,
        minHeight: 96,
      }),
    }));
  }
  function renderPalette() {
    palette.replaceChildren();
    const source = pending?.view || keyboardSource;
    if (!source) return;
    const caption = document.createElement('strong');
    caption.className = 'v2-dock-picker-heading';
    caption.textContent = 'Snap ' + source + ' to layout';
    const options = document.createElement('div');
    options.className = 'v2-dock-presets';
    for (const { template, allowed } of templatesForCurrentStage()) {
      const group = document.createElement('div');
      group.className = 'v2-dock-preset';
      if (!allowed) group.classList.add('is-unavailable');
      const name = document.createElement('span');
      name.textContent = template.label;
      name.className = 'v2-dock-preset-label';
      const mini = document.createElement('div');
      mini.className = 'v2-dock-mini';
      mini.style.gridTemplateColumns = template.columns.map((n) => n + 'fr').join(' ');
      mini.style.gridTemplateRows = template.rows.map((n) => n + 'fr').join(' ');
      for (const span of template.spans) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'v2-dock-cell';
        cell.dataset.dockPreset = template.id;
        cell.dataset.dockSlot = String(span.slot);
        cell.disabled = !allowed;
        cell.style.gridColumn = span.column + 1 + ' / span ' + span.columnSpan;
        cell.style.gridRow = span.row + 1 + ' / span ' + span.rowSpan;
        cell.setAttribute('aria-label', template.label + ', position ' + (span.slot + 1));
        mini.append(cell);
      }
      group.append(mini, name);
      options.append(group);
    }
    palette.append(caption, options);
  }
  function clearHover() {
    if (hovered) hovered.classList.remove('is-dock-target');
    hovered = null;
  }
  function setHover(node) {
    if (node === hovered) return;
    clearHover();
    hovered = node;
    hovered?.classList.add('is-dock-target');
  }
  function hit(clientX, clientY) {
    const under = document.elementFromPoint(clientX, clientY);
    const cell = under?.closest('.v2-dock-cell:not(:disabled)');
    if (cell && palette.contains(cell))
      return {
        kind: 'slot',
        node: cell,
        preset: cell.dataset.dockPreset,
        slot: Number(cell.dataset.dockSlot),
      };
    const panel = under?.closest('.p-view[data-view]:not([hidden])');
    if (panel && stage.contains(panel))
      return { kind: 'panel', node: panel, view: panel.dataset.view };
    return null;
  }
  function show(clientX, clientY) {
    renderPalette();
    overlay.hidden = false;
    ghost.hidden = false;
    ghost.textContent = pending?.view || '';
    updateGhost(clientX, clientY);
  }
  function updateGhost(x, y) {
    const rect = stage.getBoundingClientRect();
    ghost.style.left = Math.max(0, Math.min(rect.width - 85, x - rect.left + 12)) + 'px';
    ghost.style.top = Math.max(0, Math.min(rect.height - 32, y - rect.top + 12)) + 'px';
  }
  function end({ restoreFocus = false } = {}) {
    clearHover();
    pending = null;
    keyboardSource = null;
    overlay.hidden = true;
    ghost.hidden = true;
    if (restoreFocus) focusReturn?.focus({ preventScroll: true });
    focusReturn = null;
  }
  function commitHit(target, view) {
    if (!target) return false;
    if (target.kind === 'slot') {
      dispatch({ type: 'SNAP_TO_SLOT', view, preset: target.preset, slot: target.slot });
      return true;
    }
    if (target.kind === 'panel' && target.view !== view) {
      dispatch({ type: 'SWAP', a: view, b: target.view });
      return true;
    }
    return false;
  }
  function edgeTarget(x, y) {
    const rect = stage.querySelector('.p-canvases').getBoundingClientRect();
    const visible = displayedViews(getState());
    if (visible.length < 2 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
      return null;
    const margin = 22;
    let axis = null;
    if (x - rect.left < margin) axis = 'left';
    else if (rect.right - x < margin) axis = 'right';
    else if (y - rect.top < margin) axis = 'top';
    else if (rect.bottom - y < margin) axis = 'bottom';
    if (!axis) return null;
    const count = visible.length;
    const preset =
      count === 2
        ? axis === 'left'
          ? 'two-left'
          : axis === 'right'
            ? 'two-right'
            : 'two-rows'
        : (count === 3 ? 'three-' : 'four-') + axis;
    const candidate = templatesForCurrentStage().find(
      (entry) => entry.template.id === preset && entry.allowed,
    );
    return candidate ? { kind: 'slot', preset, slot: 0 } : null;
  }
  function pointerDown(event) {
    if (!enabled() || event.button !== 0 || event.isPrimary === false) return;
    // The entire unoccupied desktop window header is a drag surface.
    // Toolbar and title controls always retain their original pointer actions.
    const header = event.target.closest('.p-view-head');
    if (
      !header ||
      !stage.contains(header) ||
      event.target.closest(
        'button,a,input,select,textarea,summary,[role="button"],[contenteditable="true"]',
      )
    )
      return;
    const panel = header.closest('.p-view[data-view]:not([hidden])');
    if (!panel || panel.dataset.dockDraggable !== 'true' || displayedViews(getState()).length <= 1)
      return;
    const title = header.querySelector('.v2-view-title');
    end();
    pending = {
      view: panel.dataset.view,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      title,
    };
    header.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (!pending.dragging) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < MIN_DRAG) return;
      pending.dragging = true;
      focusReturn = pending.title;
      document.body.classList.add('v2-docking');
      show(event.clientX, event.clientY);
    }
    event.preventDefault();
    updateGhost(event.clientX, event.clientY);
    const target = hit(event.clientX, event.clientY);
    setHover(target?.node || null);
  }
  function pointerEnd(event) {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const started = pending.dragging;
    const view = pending.view;
    const pointerTarget =
      started && event.type !== 'pointercancel' ? hit(event.clientX, event.clientY) : null;
    // The source panel normally extends to the stage edge; its hit surface
    // must not prevent an intentional edge-to-layout drop.
    const target =
      pointerTarget?.kind === 'panel' && pointerTarget.view === view
        ? edgeTarget(event.clientX, event.clientY)
        : pointerTarget || (started ? edgeTarget(event.clientX, event.clientY) : null);
    document.body.classList.remove('v2-docking');
    end();
    if (started) {
      event.preventDefault();
      commitHit(target, view);
    }
  }
  function keyDown(event) {
    if (event.key === 'Escape' && (pending || keyboardSource)) {
      document.body.classList.remove('v2-docking');
      end({ restoreFocus: true });
      event.preventDefault();
      return;
    }
    if (!enabled()) return;
    const title = event.target.closest('.v2-view-title');
    const panel = title?.closest('.p-view[data-view]:not([hidden])');
    if (event.altKey && event.key === 'Enter' && panel && displayedViews(getState()).length > 1) {
      end();
      keyboardSource = panel.dataset.view;
      focusReturn = title;
      renderPalette();
      overlay.hidden = false;
      ghost.hidden = true;
      palette.querySelector('.v2-dock-cell:not(:disabled)')?.focus();
      event.preventDefault();
    }
  }
  function paletteClick(event) {
    if (!keyboardSource || !enabled()) return;
    const cell = event.target.closest('.v2-dock-cell:not(:disabled)');
    if (!cell || !palette.contains(cell)) return;
    const view = keyboardSource;
    const target = {
      kind: 'slot',
      preset: cell.dataset.dockPreset,
      slot: Number(cell.dataset.dockSlot),
    };
    end();
    commitHit(target, view);
  }
  function doubleClick(event) {
    if (!enabled()) return;
    const header = event.target.closest('.p-view-head');
    const panel = header?.closest('.p-view[data-view]:not([hidden])');
    if (
      !panel ||
      event.target.closest(
        'button,a,input,select,textarea,summary,[role="button"],[contenteditable="true"]',
      )
    )
      return;
    dispatch({ type: 'MAXIMIZE', view: panel.dataset.view });
  }
  function resize() {
    if (!enabled() && (pending || keyboardSource)) end();
  }
  root.addEventListener('pointerdown', pointerDown);
  document.addEventListener('pointermove', pointerMove, { passive: false });
  document.addEventListener('pointerup', pointerEnd);
  document.addEventListener('pointercancel', pointerEnd);
  root.addEventListener('keydown', keyDown);
  root.addEventListener('dblclick', doubleClick);
  palette.addEventListener('click', paletteClick);
  window.addEventListener('resize', resize);
  return Object.freeze({
    destroy() {
      root.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerup', pointerEnd);
      document.removeEventListener('pointercancel', pointerEnd);
      root.removeEventListener('keydown', keyDown);
      root.removeEventListener('dblclick', doubleClick);
      palette.removeEventListener('click', paletteClick);
      window.removeEventListener('resize', resize);
      document.body.classList.remove('v2-docking');
      overlay.remove();
    },
  });
}
