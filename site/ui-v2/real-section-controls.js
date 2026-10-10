// M3 D1: real Section view actions, delegated to app.js + Section compositor.
// No CSS canvas transforms, geometry edits or alternate section renderer.
(() => {
  const { button } = window.WaferCadV2Components;
  function create({ canvas, getViewport, setViewport, panViewport, zoomViewportAt }) {
    if (!(canvas instanceof HTMLCanvasElement)) throw TypeError('Section native canvas required');
    for (const fn of [getViewport, setViewport, panViewport, zoomViewportAt]) {
      if (typeof fn !== 'function') throw TypeError('Section viewport callbacks required');
    }
    const fit = button('Fit', 'v2-section-fit', 'fit', {
      title: 'Fit the full physical Section viewport',
      'aria-label': 'Fit Section',
    });
    const pan = button('Pan', 'v2-section-pan', 'pan', {
      title: 'Pan Section (drag on original canvas)',
      'aria-label': 'Pan Section',
      'aria-pressed': 'false',
    });
    const zoom = button('Zoom', 'v2-section-zoom', 'zoom', {
      title: 'Zoom Section around the pointer (vertical drag)',
      'aria-label': 'Zoom Section',
      'aria-pressed': 'false',
    });
    let mode = null, drag = null;
    function finish(pointerId) {
      if (!drag || pointerId !== drag.pointerId) return;
      const id = drag.pointerId;
      drag = null;
      if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    }
    function sync() {
      canvas.dataset.v2Gesture = mode || 'inspect';
      pan.setAttribute('aria-pressed', String(mode === 'pan'));
      zoom.setAttribute('aria-pressed', String(mode === 'zoom'));
    }
    function setMode(next) {
      if (drag) finish(drag.pointerId);
      mode = next === mode ? null : next;
      sync();
    }
    function reset() {
      if (drag) finish(drag.pointerId);
      setViewport({ zoom: 1, panX: 0, panY: 0 });
    }
    function begin(event) {
      if (!mode || event.button !== 0 || event.isPrimary === false ||
          event.target !== canvas || canvas.classList.contains('section-detail-drawing')) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const viewport = getViewport();
      drag = {
        pointerId: event.pointerId,
        mode,
        x: event.clientX,
        y: event.clientY,
        localX: event.clientX - rect.left,
        localY: event.clientY - rect.top,
        rectWidth: rect.width,
        rectHeight: rect.height,
        viewport,
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function move(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (drag.mode === 'pan') {
        // Start-relative pan avoids integration drift across event frequencies.
        setViewport({
          ...drag.viewport,
          panX: drag.viewport.panX + dx,
          panY: drag.viewport.panY + dy,
        });
      } else {
        // A signed monotonic factor makes up/down drags reversible.
        const factor = Math.exp(-dy * 0.009);
        // Compute directly from drag start; do not double-render every move.
        zoomViewportAt(
          factor, drag.localX, drag.localY,
          drag.rectWidth, drag.rectHeight, drag.viewport,
        );
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function end(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finish(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function lost(event) {
      if (drag?.pointerId === event.pointerId) drag = null;
    }
    fit.addEventListener('click', reset);
    pan.addEventListener('click', () => setMode('pan'));
    zoom.addEventListener('click', () => setMode('zoom'));
    canvas.addEventListener('pointerdown', begin, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', end, true);
    canvas.addEventListener('pointercancel', end, true);
    canvas.addEventListener('lostpointercapture', lost);
    sync();
    return Object.freeze({
      fit, pan, zoom,
      getMode: () => mode,
      hide() { if (drag) finish(drag.pointerId); },
      destroy() {
        if (drag) finish(drag.pointerId);
        canvas.removeEventListener('pointerdown', begin, true);
        canvas.removeEventListener('pointermove', move, true);
        canvas.removeEventListener('pointerup', end, true);
        canvas.removeEventListener('pointercancel', end, true);
        canvas.removeEventListener('lostpointercapture', lost);
      },
    });
  }
  window.WaferCadV2RealSectionControls = Object.freeze({ create });
})();
