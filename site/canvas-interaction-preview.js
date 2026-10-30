// Display-only navigation preview for expensive Canvas2D views. The exact
// scientific geometry is always redrawn once pointer/wheel input settles.
// Never use the raster snapshot for queries, exports, ROI or model mutation.
export function createCanvasInteractionPreview({
  getCanvas,
  render,
  delayMs = 130,
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (id) => globalThis.clearTimeout(id),
}) {
  let image = null;
  let initial = null;
  let current = null;
  let frame = null;
  let timer = null;

  function release() {
    if (frame !== null) cancelFrame(frame);
    if (timer !== null) clearTimer(timer);
    image = initial = current = null;
    frame = timer = null;
  }

  function capture(canvas, view) {
    const snapshot = canvas.ownerDocument?.createElement?.('canvas');
    if (!snapshot || !canvas.width || !canvas.height) return false;
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const context = snapshot.getContext('2d');
    if (!context) return false;
    context.drawImage(canvas, 0, 0);
    image = snapshot;
    initial = { ...view };
    return true;
  }

  function paint() {
    frame = null;
    const canvas = getCanvas();
    if (!canvas || !image || !initial || !current) return;
    const context = canvas.getContext('2d');
    if (!context || !(initial.s > 0) || !(current.s > 0)) return;
    const scale = current.s / initial.s;
    const dx = current.cx - initial.cx * scale;
    const dy = current.cy - initial.cy * scale;
    const rect = canvas.getBoundingClientRect();
    const dprX = canvas.width / Math.max(1, rect.width);
    const dprY = canvas.height / Math.max(1, rect.height);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, dx * dprX, dy * dprY, image.width * scale, image.height * scale);
    context.restore();
  }

  return {
    request(before, after) {
      const canvas = getCanvas();
      if (
        !canvas ||
        !Number.isFinite(before?.s) ||
        !Number.isFinite(after?.s) ||
        before.s <= 0 ||
        after.s <= 0 ||
        (!image && !capture(canvas, before))
      ) {
        release();
        render();
        return;
      }
      current = { ...after };
      if (frame === null) frame = requestFrame(paint);
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        release();
        render();
      }, delayMs);
    },
    cancel: release,
    get pending() {
      return image !== null;
    },
  };
}
