// Shared planar touch navigation through view-supplied Pan/Zoom ports. Capture only owned navigation gestures; one
// finger remains available to the existing ROI/Slice controllers when Pan is off.
export function bindPlanGestures({
  canvas,
  panEnabled,
  zoomEnabled,
  panBy,
  zoomAt,
  mouse = false,
}) {
  const pointers = new Map();
  let gesture = false,
    last,
    cancelling = false;
  const owned = new Set();
  const metrics = () => {
    const [a, b] = [...pointers.values()];
    return b
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : a;
  };
  const consume = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const cancelEditing = (id) => {
    const point = pointers.get(id);
    cancelling = true;
    canvas.dispatchEvent(
      new PointerEvent('pointercancel', {
        pointerId: id,
        pointerType: 'touch',
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
      }),
    );
    cancelling = false;
  };
  const down = (event) => {
    if (event.pointerType !== 'touch') return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) {
      gesture = true;
      for (const id of pointers.keys()) {
        if (!owned.has(id)) cancelEditing(id);
        owned.add(id);
        canvas.setPointerCapture(id);
      }
    } else if (panEnabled()) {
      gesture = true;
      owned.add(event.pointerId);
      canvas.setPointerCapture(event.pointerId);
    }
    last = metrics();
    if (gesture) consume(event);
  };
  const move = (event) => {
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = metrics();
    if (!gesture) {
      last = current;
      return;
    }
    consume(event);
    if (pointers.size === 1) {
      if (panEnabled()) panBy(current.x - last.x, current.y - last.y);
    } else if (pointers.size === 2) {
      if (panEnabled()) panBy(current.x - last.x, current.y - last.y);
      if (zoomEnabled() && last.distance > 0 && current.distance > 0)
        zoomAt(current.distance / last.distance, current.x, current.y);
    }
    last = current;
  };
  const finish = (event) => {
    if (cancelling || event.pointerType !== 'touch') return;
    const wasOwned = owned.delete(event.pointerId);
    pointers.delete(event.pointerId);
    if (wasOwned) {
      consume(event);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    if (!pointers.size) gesture = false;
    last = metrics();
  };
  const listeners = {
    pointerdown: down,
    pointermove: move,
    pointerup: finish,
    pointercancel: finish,
  };
  let mouseDrag;
  if (mouse) {
    listeners.pointerdown = (event) => {
      down(event);
      if (event.pointerType === 'touch' || event.button !== 0 || !panEnabled()) return;
      mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      consume(event);
    };
    listeners.pointermove = (event) => {
      move(event);
      if (mouseDrag?.id !== event.pointerId) return;
      if (panEnabled()) panBy(event.clientX - mouseDrag.x, event.clientY - mouseDrag.y);
      mouseDrag.x = event.clientX;
      mouseDrag.y = event.clientY;
      consume(event);
    };
    const release = (event) => {
      finish(event);
      if (mouseDrag?.id !== event.pointerId) return;
      mouseDrag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      consume(event);
    };
    listeners.pointerup = release;
    listeners.pointercancel = release;
    listeners.wheel = (event) => {
      consume(event);
      if (zoomEnabled()) zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
  }
  for (const [type, listener] of Object.entries(listeners))
    canvas.addEventListener(type, listener, { capture: true, passive: false });
  return () => {
    for (const [type, listener] of Object.entries(listeners))
      canvas.removeEventListener(type, listener, true);
    for (const id of owned) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    owned.clear();
    pointers.clear();
  };
}
