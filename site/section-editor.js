// Slice A/B editing lives directly on Main. Existing geometry is always editable;
// the Slice button only enables one-shot creation of a new A/B line.
export function createSectionEditor({
  canvas,
  host,
  getSection,
  getFrame,
  isCreateMode = () => false,
  isInteractionBlocked = () => false,
  onChange,
  onCreateDone,
  onExitCreate,
}) {
  const handles = [...host.querySelectorAll('[data-endpoint]')];
  let drag = null;

  const screenPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const distanceToSegment = (point, a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length2 = dx * dx + dy * dy;
    if (length2 <= 1e-12) return Math.hypot(point[0] - a[0], point[1] - a[1]);
    const t = Math.max(
      0,
      Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2),
    );
    return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
  };

  function finish(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;

    if (previous.button) {
      previous.button.classList.remove('dragging');
      if (previous.button.hasPointerCapture(previous.pointerId)) {
        previous.button.releasePointerCapture(previous.pointerId);
      }
    } else if (canvas.hasPointerCapture(previous.pointerId)) {
      canvas.releasePointerCapture(previous.pointerId);
    }

    if (cancel) {
      onChange(previous.before);
      update();
      return;
    }

    if (previous.mode === 'create') onCreateDone?.();
    update();
  }

  function update() {
    const frame = getFrame(),
      blocked = isInteractionBlocked(),
      creating = isCreateMode();
    host.hidden = false;

    for (const button of handles) {
      const point = frame.toScreen(getSection()[button.dataset.endpoint]);
      const visible =
        !blocked &&
        !creating &&
        (drag?.button === button ||
          (point[0] >= 0 && point[0] <= frame.width && point[1] >= 0 && point[1] <= frame.height));
      button.hidden = !visible;
      button.style.left = `${frame.left + point[0]}px`;
      button.style.top = `${frame.top + point[1]}px`;
    }
  }

  for (const button of handles) {
    button.addEventListener('pointerdown', (event) => {
      if (drag || event.button !== 0 || isCreateMode() || isInteractionBlocked()) return;
      event.preventDefault();
      event.stopPropagation();
      const frame = getFrame(),
        endpoint = button.dataset.endpoint,
        point = frame.toScreen(getSection()[endpoint]),
        local = screenPoint(event);
      drag = {
        mode: 'endpoint',
        button,
        endpoint,
        pointerId: event.pointerId,
        before: structuredClone(getSection()),
        offset: [local[0] - point[0], local[1] - point[1]],
      };
      button.focus({ preventScroll: true });
      button.classList.add('dragging');
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.button !== button || drag.pointerId !== event.pointerId) return;
      const local = screenPoint(event),
        point = getFrame().toWorld([local[0] - drag.offset[0], local[1] - drag.offset[1]]);
      onChange({ ...getSection(), [drag.endpoint]: point });
    });

    button.addEventListener('pointerup', (event) => {
      if (drag?.pointerId === event.pointerId) finish();
    });

    for (const eventName of ['pointercancel', 'lostpointercapture']) {
      button.addEventListener(eventName, (event) => {
        if (drag?.pointerId === event.pointerId) finish(true);
      });
    }

    button.addEventListener('keydown', (event) => {
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (!delta || isCreateMode() || isInteractionBlocked()) return;
      event.preventDefault();
      finish();
      const frame = getFrame(),
        endpoint = button.dataset.endpoint,
        screen = frame.toScreen(getSection()[endpoint]),
        step = event.shiftKey ? 10 : 1;
      onChange({
        ...getSection(),
        [endpoint]: frame.toWorld([screen[0] + delta[0] * step, screen[1] + delta[1] * step]),
      });
    });
  }

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (isInteractionBlocked() && !drag) return;
      const frame = getFrame(),
        local = screenPoint(event);

      if (!drag) {
        if (isCreateMode()) {
          canvas.style.cursor = 'crosshair';
          event.preventDefault();
          return;
        }
        const section = getSection(),
          a = frame.toScreen(section.a),
          b = frame.toScreen(section.b),
          threshold = event.pointerType === 'touch' ? 16 : 7;
        if (distanceToSegment(local, a, b) <= threshold) {
          canvas.style.cursor = 'grab';
          event.preventDefault();
        }
        return;
      }

      if (!['line', 'create'].includes(drag.mode) || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const point = frame.toWorld(local);

      if (drag.mode === 'create') {
        onChange({ a: drag.start, b: point });
        return;
      }

      const dx = point[0] - drag.start[0],
        dy = point[1] - drag.start[1];
      onChange({
        a: [drag.before.a[0] + dx, drag.before.a[1] + dy],
        b: [drag.before.b[0] + dx, drag.before.b[1] + dy],
      });
    },
  );

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || drag || isInteractionBlocked() || event.defaultPrevented) return;
      const frame = getFrame(),
        local = screenPoint(event),
        point = frame.toWorld(local),
        before = structuredClone(getSection());

      if (isCreateMode()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        drag = {
          mode: 'create',
          pointerId: event.pointerId,
          before,
          start: point,
        };
        onChange({ a: point, b: point });
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      const a = frame.toScreen(before.a),
        b = frame.toScreen(before.b),
        threshold = event.pointerType === 'touch' ? 16 : 7;
      if (distanceToSegment(local, a, b) > threshold) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      drag = {
        mode: 'line',
        pointerId: event.pointerId,
        before,
        start: point,
      };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(event.pointerId);
    },
  );

  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (!drag || drag.button || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = drag;
      if (
        previous.mode === 'create' &&
        Math.hypot(
          getSection().b[0] - getSection().a[0],
          getSection().b[1] - getSection().a[1],
        ) <= 1e-9
      ) {
        finish(true);
        return;
      }
      finish();
      canvas.style.cursor = 'default';
    },
  );

  canvas.addEventListener(
    'pointercancel',
    (event) => {
      if (!drag || drag.button || drag.pointerId !== event.pointerId) return;
      event.stopImmediatePropagation();
      finish(true);
      canvas.style.cursor = 'default';
    },
  );

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (drag) {
      event.preventDefault();
      finish(true);
      return;
    }
    if (isCreateMode()) {
      event.preventDefault();
      onExitCreate?.();
      update();
    }
  });

  new ResizeObserver(update).observe(canvas);
  host.hidden = false;
  update();

  return {
    update,
    cancel: () => finish(true),
    setEnabled() {
      // Kept for compatibility. Existing Slice geometry is always editable.
      update();
    },
  };
}
