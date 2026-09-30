// Handles live in CSS pixels so zoom and device pixel ratio cannot shrink targets.
export function createSectionEditor({ canvas, host, getSection, getFrame, onChange, onExit }) {
  const handles = [...host.querySelectorAll('[data-endpoint]')];
  let enabled = false;
  let drag = null;

  function finish(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    previous.button.classList.remove('dragging');
    if (previous.button.hasPointerCapture(previous.pointerId))
      previous.button.releasePointerCapture(previous.pointerId);
    if (cancel) onChange(previous.before);
  }

  function update() {
    const frame = getFrame();
    for (const button of handles) {
      const point = frame.toScreen(getSection()[button.dataset.endpoint]);
      const visible =
        enabled &&
        (drag?.button === button ||
          (point[0] >= 0 && point[0] <= frame.width && point[1] >= 0 && point[1] <= frame.height));
      button.hidden = !visible;
      button.style.left = `${frame.left + point[0]}px`;
      button.style.top = `${frame.top + point[1]}px`;
    }
  }

  for (const button of handles) {
    button.addEventListener('pointerdown', (event) => {
      if (!enabled || drag || event.button !== 0) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const frame = getFrame();
      const endpoint = button.dataset.endpoint;
      const point = frame.toScreen(getSection()[endpoint]);
      drag = {
        button,
        endpoint,
        pointerId: event.pointerId,
        before: structuredClone(getSection()),
        offset: [event.clientX - rect.left - point[0], event.clientY - rect.top - point[1]],
      };
      button.focus({ preventScroll: true });
      button.classList.add('dragging');
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.button !== button || drag.pointerId !== event.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const point = getFrame().toWorld([
        event.clientX - rect.left - drag.offset[0],
        event.clientY - rect.top - drag.offset[1],
      ]);
      onChange({ ...getSection(), [drag.endpoint]: point });
    });
    button.addEventListener('pointerup', (event) => {
      if (drag?.pointerId === event.pointerId) finish();
    });
    for (const eventName of ['pointercancel', 'lostpointercapture'])
      button.addEventListener(eventName, (event) => {
        if (drag?.pointerId === event.pointerId) finish(true);
      });
    button.addEventListener('keydown', (event) => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        event.key
      ];
      if (!enabled || !delta) return;
      event.preventDefault();
      finish();
      const frame = getFrame();
      const endpoint = button.dataset.endpoint;
      const screen = frame.toScreen(getSection()[endpoint]);
      const step = event.shiftKey ? 10 : 1;
      onChange({
        ...getSection(),
        [endpoint]: frame.toWorld([screen[0] + delta[0] * step, screen[1] + delta[1] * step]),
      });
    });
  }
  window.addEventListener('keydown', (event) => {
    if (!enabled || event.key !== 'Escape') return;
    event.preventDefault();
    if (drag) finish(true);
    else onExit();
  });
  // ResizeObserver also covers the mobile coordinate panel expanding the grid.
  new ResizeObserver(update).observe(canvas);
  return {
    update,
    cancel: () => finish(true),
    setEnabled(value) {
      finish();
      enabled = Boolean(value);
      host.hidden = !enabled;
      update();
    },
  };
}
