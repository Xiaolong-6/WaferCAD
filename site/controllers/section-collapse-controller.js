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
  parseZInput = (raw) => Number(raw),
  claimPopover = () => {},
}) {
  const $ = (id) => root.getElementById(id);
  let editorOpen = false,
    drag = null;

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
    const enabled = value.enabled !== false;
    $('sectionCollapseEnabled').checked = enabled;
    for (const [id, z] of [
      ['sectionCollapseTopInput', value.top],
      ['sectionCollapseBottomInput', value.bottom],
    ]) {
      const input = $(id);
      if (root.activeElement !== input) input.value = formatXY(z);
      input.disabled = !enabled;
    }
    $('sectionCollapseTopHandle').disabled = !enabled;
    $('sectionCollapseBottomHandle').disabled = !enabled;
    $('sectionCollapseSnap').disabled = !enabled;

    const linked = value.scaleLinked !== false,
      frontScale = $('sectionCollapseFrontScale'),
      backScale = $('sectionCollapseBackScale'),
      linkScale = $('sectionCollapseScaleLinked');
    linkScale.checked = linked;
    linkScale.disabled = !enabled;
    frontScale.value = String(Number(value.frontScale || 1));
    backScale.value = String(Number(value.backScale || 1));
    frontScale.disabled = !enabled || linked;
    backScale.disabled = !enabled || linked;
  }

  function sync() {
    const canvas = $('sectionCanvas'),
      entry = $('sectionCollapseAxisBtn');
    if (!canvas || !entry) return;

    const enabled = current().enabled !== false;
    const enabledToggle = $('sectionCollapseEnabled');
    if (enabledToggle && root.activeElement !== enabledToggle) enabledToggle.checked = enabled;
    entry.classList.toggle('active', editorOpen);
    entry.classList.toggle('collapse-disabled', !enabled);
    entry.setAttribute('aria-expanded', String(editorOpen));
    entry.dataset.breakEnabled = String(enabled);
    entry.title = enabled
      ? 'Z-axis break enabled. Open display settings.'
      : 'Z-axis break disabled. Open settings to enable.';

    syncRuler();
  }

  // A short Section dock cannot host the whole ruler/inputs panel. Promote the
  // *same* editor to the browser top layer instead of squeezing it into a
  // second scroll container or letting it overlap the Layers control.
  function updatePresentation() {
    if (!editorOpen) return;
    const editor = $('sectionCollapseEditor');
    if (editor.matches(':modal')) return;
    const area = $('sectionBody').getBoundingClientRect();
    const requiredHeight = Math.max(380, editor.scrollHeight + 16);
    if (area.width < 420 || area.height < requiredHeight) {
      editor.showModal();
    }
  }

  function open() {
    const editor = $('sectionCollapseEditor');
    claimPopover(editor);
    editorOpen = true;
    editor.hidden = false;
    updatePresentation();
    sync();
    if (!editor.matches(':modal')) $('sectionCollapseClose').focus({ preventScroll: true });
  }

  function close() {
    const editor = $('sectionCollapseEditor');
    editorOpen = false;
    drag = null;
    if (editor.open) editor.close();
    editor.hidden = true;
    $('sectionCollapseTopHandle').classList.remove('dragging');
    $('sectionCollapseBottomHandle').classList.remove('dragging');
    sync();
  }

  function toggle() {
    if (editorOpen) close();
    else open();
  }

  function startDrag(which, event) {
    const value = current();
    if (value.enabled === false) return;
    drag = {
      which,
      pointerId: event.pointerId,
      startTop: value.top,
      startBottom: value.bottom,
    };
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
    $('sectionCollapseAxisBtn').addEventListener('click', toggle);
    $('sectionCollapseClose').addEventListener('click', close);
    $('sectionCollapseEnabled').addEventListener('change', toggleEnabled);
    for (const [id, field] of [
      ['sectionCollapseTopInput', 'top'],
      ['sectionCollapseBottomInput', 'bottom'],
    ]) {
      $(id).addEventListener('change', (event) => {
        const value = current(),
          next = parseZInput(event.target.value);
        if (!Number.isFinite(next)) return syncRuler();
        value[field] = next;
        setCurrent(value, { settled: true });
      });
    }
    $('sectionCollapseScaleLinked').addEventListener('change', (event) => {
      const value = current();
      value.scaleLinked = event.target.checked;
      if (value.scaleLinked) {
        value.frontScale = 1;
        value.backScale = 1;
      }
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

    const editor = $('sectionCollapseEditor');
    editor.addEventListener('wafercad:popover-close', (event) => {
      event.preventDefault();
      close();
    });
    editor.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    editor.addEventListener('close', () => {
      if (editorOpen) close();
    });
    editor.addEventListener('pointerdown', (event) => {
      // In modal mode the backdrop dispatches on <dialog> itself.
      if (event.target === editor && editor.matches(':modal')) {
        const rect = editor.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          close();
        }
      }
      event.stopPropagation();
    });
    editor.addEventListener('click', (event) => event.stopPropagation());
    editor.querySelector('.section-collapse-advanced').addEventListener('toggle', () => {
      updatePresentation();
    });
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
      }
    });

    new ResizeObserver(sync).observe($('sectionCanvas'));
    new ResizeObserver(updatePresentation).observe($('sectionBody'));
    sync();
  }

  return {
    bind,
    sync,
    close,
    defaultForCurrentModel: () => defaultSectionCollapseForModel(getModel(), bounds()),
  };
}
