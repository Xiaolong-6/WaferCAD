import { modelBoundsZ } from '../model.js';
import {
  defaultSectionCollapseForModel,
  normalizeSectionCollapse,
  normalizeSectionZScales,
  resolveSectionCollapse,
  sectionCollapseSnapValues,
  translateSectionCollapse,
} from '../section-z-collapse.js';

export function createSectionCollapseController({
  root = document,
  getModel,
  getSectionCollapse,
  setSectionCollapse,
  renderSection,
  onChanged = () => {},
  onSettled = () => {},
  formatXY,
  xyUnitLabel,
}) {
  const $ = (id) => root.getElementById(id);
  let editorOpen = false,
    activeTarget = 'top',
    drag = null,
    entryClickTimer = null;

  function bounds() {
    const canvas = $('sectionCanvas'),
      displayLo = Number(canvas?.dataset?.zMinUm),
      displayHi = Number(canvas?.dataset?.zMaxUm);
    if (Number.isFinite(displayLo) && Number.isFinite(displayHi) && displayHi > displayLo) {
      return [displayLo, displayHi];
    }
    return modelBoundsZ(getModel());
  }

  function current() {
    return resolveSectionCollapse(getSectionCollapse(), getModel(), bounds());
  }

  function setCurrent(value, { settled = false } = {}) {
    setSectionCollapse({
      ...normalizeSectionCollapse(value, bounds()),
      enabled: value?.enabled !== false,
      ...normalizeSectionZScales(value),
    });
    onChanged();
    renderSection();
    if (settled) onSettled();
  }

  function setSurfaceScale(which, rawValue) {
    const scale = Number(rawValue);
    if (!Number.isFinite(scale)) {
      syncRuler();
      return;
    }

    const value = current(),
      clamped = Math.max(0.1, Math.min(10, scale));
    if (which === 'front') value.frontScale = clamped;
    else value.backScale = clamped;
    if (value.scaleLinked !== false) {
      value.frontScale = clamped;
      value.backScale = clamped;
    }
    setCurrent(value, { settled: true });
  }

  function toggleEnabled() {
    const value = current();
    value.enabled = value.enabled === false;
    if (value.enabled === false) close();
    setCurrent(value, { settled: true });
  }

  function zToRulerY(z) {
    const ruler = $('sectionCollapseRuler'),
      [lo, hi] = bounds(),
      height = Math.max(1, ruler.clientHeight || 168);
    return ((hi - z) / Math.max(hi - lo, 1e-12)) * height;
  }

  function rulerYToZ(y) {
    const ruler = $('sectionCollapseRuler'),
      [lo, hi] = bounds(),
      height = Math.max(1, ruler.clientHeight || 168);
    return hi - (Math.max(0, Math.min(height, y)) / height) * (hi - lo);
  }

  function snapDraggedZ(z) {
    if (!$('sectionCollapseSnap').checked) return z;
    const ruler = $('sectionCollapseRuler'),
      [lo, hi] = bounds(),
      threshold = ((hi - lo) / Math.max(1, ruler.clientHeight || 168)) * 7;
    let best = z,
      distance = Infinity;
    for (const candidate of sectionCollapseSnapValues(getModel(), [lo, hi])) {
      const delta = Math.abs(candidate - z);
      if (delta < distance && delta <= threshold) {
        best = candidate;
        distance = delta;
      }
    }
    return best;
  }

  function updateStepLabels() {
    const select = $('sectionCollapseStep');
    for (const option of select.options) {
      const micron = Number(option.value);
      option.textContent = `${formatXY(micron)} ${xyUnitLabel()}`;
    }
  }

  function syncRuler() {
    if (!editorOpen) return;
    const ruler = $('sectionCollapseRuler'),
      [lo, hi] = bounds(),
      value = current(),
      topY = zToRulerY(value.top),
      bottomY = zToRulerY(value.bottom);

    ruler.querySelectorAll('.section-collapse-ruler-tick').forEach((node) => node.remove());
    const tickValues = [hi, hi - (hi - lo) * 0.25, hi - (hi - lo) * 0.5, hi - (hi - lo) * 0.75, lo];
    for (const z of tickValues) {
      const tick = root.createElement('div'),
        label = root.createElement('span');
      tick.className = 'section-collapse-ruler-tick';
      tick.style.top = `${zToRulerY(z)}px`;
      label.textContent = formatXY(z);
      tick.append(label);
      ruler.append(tick);
    }

    $('sectionCollapseTopHandle').style.top = `${topY}px`;
    $('sectionCollapseBottomHandle').style.top = `${bottomY}px`;
    const windowNode = $('sectionCollapseWindow');
    windowNode.style.top = `${topY}px`;
    windowNode.style.height = `${Math.max(2, bottomY - topY)}px`;

    $('sectionCollapseTopValue').textContent = `${formatXY(value.top)} ${xyUnitLabel()}`;
    $('sectionCollapseBottomValue').textContent = `${formatXY(value.bottom)} ${xyUnitLabel()}`;
    $('sectionCollapseFineValue').textContent =
      activeTarget === 'top'
        ? `${formatXY(value.top)} ${xyUnitLabel()}`
        : activeTarget === 'bottom'
          ? `${formatXY(value.bottom)} ${xyUnitLabel()}`
          : `${formatXY(value.top - value.bottom)} ${xyUnitLabel()}`;

    const linked = value.scaleLinked !== false,
      frontScale = $('sectionCollapseFrontScale'),
      backScale = $('sectionCollapseBackScale'),
      linkScale = $('sectionCollapseScaleLinked');
    linkScale.checked = linked;
    frontScale.value = String(Number(value.frontScale || 1));
    backScale.value = String(Number(value.backScale || 1));
    backScale.disabled = linked;
    updateStepLabels();
  }

  function sync() {
    const canvas = $('sectionCanvas'),
      entry = $('sectionCollapseAxisBtn');
    if (!canvas || !entry) return;

    const left = Number(canvas.dataset.sectionPlotLeft),
      breakY = Number(canvas.dataset.sectionCollapseBreakY);
    if (Number.isFinite(left)) entry.style.left = `${left}px`;
    if (Number.isFinite(breakY)) entry.style.top = `${breakY}px`;
    const enabled = current().enabled !== false;
    entry.classList.toggle('active', editorOpen);
    entry.classList.toggle('collapse-disabled', !enabled);
    entry.setAttribute('aria-expanded', String(editorOpen));
    entry.setAttribute('aria-pressed', String(enabled));
    entry.dataset.collapseEnabled = String(enabled);
    entry.title = enabled
      ? editorOpen
        ? 'Close Z collapse editor · double-click to disable collapse'
        : 'Adjust Z collapse · double-click to show full Z'
      : 'Z collapse off · double-click to restore';

    const popover = $('sectionCollapseEditor');
    if (editorOpen && globalThis.innerWidth > 600) {
      const overlay = $('sectionCollapseOverlay'),
        popoverWidth = Math.max(1, popover.offsetWidth),
        popoverHeight = Math.max(1, popover.offsetHeight),
        maxLeft = Math.max(6, overlay.clientWidth - popoverWidth - 6),
        maxTop = Math.max(6, overlay.clientHeight - popoverHeight - 6);
      popover.style.left = `${Math.min(maxLeft, Math.max(36, left + 18))}px`;
      popover.style.top = `${Math.max(6, Math.min(maxTop, breakY - popoverHeight / 2))}px`;
    }

    syncRuler();
  }

  function open() {
    if (current().enabled === false) return;
    editorOpen = true;
    activeTarget = 'top';
    $('sectionCollapseTarget').value = activeTarget;
    $('sectionCollapseEditor').hidden = false;
    sync();
  }

  function close() {
    editorOpen = false;
    drag = null;
    $('sectionCollapseEditor').hidden = true;
    $('sectionCollapseTopHandle').classList.remove('dragging');
    $('sectionCollapseBottomHandle').classList.remove('dragging');
    sync();
  }

  function toggle() {
    if (editorOpen) close();
    else open();
  }

  function nudge(sign) {
    const step = Number($('sectionCollapseStep').value) * sign,
      value = current(),
      [lo, hi] = bounds(),
      span = hi - lo,
      minGap = Math.max(span * 0.02, 1e-12);

    if (activeTarget === 'top') {
      value.top = Math.max(value.bottom + minGap, Math.min(hi, value.top + step));
    } else if (activeTarget === 'bottom') {
      value.bottom = Math.min(value.top - minGap, Math.max(lo, value.bottom + step));
    } else {
      setCurrent(
        { ...value, ...translateSectionCollapse(value, step, [lo, hi]) },
        { settled: true },
      );
      return;
    }
    setCurrent(value, { settled: true });
  }

  function startDrag(which, event) {
    const value = current();
    drag = {
      which,
      pointerId: event.pointerId,
      startTop: value.top,
      startBottom: value.bottom,
    };
    activeTarget = which;
    $('sectionCollapseTarget').value = which;
    event.currentTarget.classList.add('dragging');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const ruler = $('sectionCollapseRuler'),
      rect = ruler.getBoundingClientRect(),
      value = current(),
      [lo, hi] = bounds(),
      span = hi - lo,
      minGap = Math.max(span * 0.02, 1e-12),
      z = snapDraggedZ(rulerYToZ(event.clientY - rect.top));

    if (drag.which === 'top') {
      value.top = Math.max(value.bottom + minGap, Math.min(hi, z));
    } else {
      value.bottom = Math.min(value.top - minGap, Math.max(lo, z));
    }
    setCurrent(value);
  }

  function endDrag(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    $('sectionCollapseTopHandle').classList.remove('dragging');
    $('sectionCollapseBottomHandle').classList.remove('dragging');
    drag = null;
    onSettled();
  }

  function bind() {
    $('sectionCollapseAxisBtn').addEventListener('click', (event) => {
      event.stopPropagation();
      if (current().enabled === false) return;
      clearTimeout(entryClickTimer);
      entryClickTimer = setTimeout(() => {
        entryClickTimer = null;
        toggle();
      }, 180);
    });
    $('sectionCollapseAxisBtn').addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(entryClickTimer);
      entryClickTimer = null;
      toggleEnabled();
    });
    $('sectionCollapseClose').addEventListener('click', close);
    $('sectionCollapseTarget').addEventListener('change', (event) => {
      activeTarget = event.target.value;
      syncRuler();
    });
    $('sectionCollapseMinus').addEventListener('click', () => nudge(-1));
    $('sectionCollapsePlus').addEventListener('click', () => nudge(1));
    $('sectionCollapseScaleLinked').addEventListener('change', (event) => {
      const value = current();
      value.scaleLinked = event.target.checked;
      if (value.scaleLinked) value.backScale = value.frontScale;
      setCurrent(value, { settled: true });
    });
    $('sectionCollapseFrontScale').addEventListener('change', (event) =>
      setSurfaceScale('front', event.target.value),
    );
    $('sectionCollapseBackScale').addEventListener('change', (event) =>
      setSurfaceScale('back', event.target.value),
    );
    $('sectionCollapseTopHandle').addEventListener('pointerdown', (event) =>
      startDrag('top', event),
    );
    $('sectionCollapseBottomHandle').addEventListener('pointerdown', (event) =>
      startDrag('bottom', event),
    );

    $('sectionCollapseEditor').addEventListener('pointerdown', (event) => event.stopPropagation());
    $('sectionCollapseEditor').addEventListener('click', (event) => event.stopPropagation());
    root.addEventListener('pointerdown', (event) => {
      if (!editorOpen || drag) return;
      if ($('sectionCollapseEditor').contains(event.target)) return;
      if ($('sectionCollapseAxisBtn').contains(event.target)) return;
      close();
    });

    globalThis.addEventListener('pointermove', moveDrag);
    globalThis.addEventListener('pointerup', endDrag);
    globalThis.addEventListener('pointercancel', endDrag);
    globalThis.addEventListener('keydown', (event) => {
      if (!editorOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        nudge(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        nudge(-1);
      }
    });

    new ResizeObserver(sync).observe($('sectionCanvas'));
    sync();
  }

  return {
    bind,
    sync,
    close,
    defaultForCurrentModel: () => defaultSectionCollapseForModel(getModel(), bounds()),
  };
}
