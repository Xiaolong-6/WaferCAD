// A one-time startup scheduling gate. Leave the canonical renderer and final
// Quality model unchanged: this only prioritizes the first visible 2D paint.
export function createFirstFrameThreeGate(
  render,
  afterPaint = (callback) => requestAnimationFrame(() => setTimeout(callback, 0)),
) {
  let deferred = true;
  let scheduled = false;
  let requested = false;
  return {
    request() {
      if (!deferred) return render();
      requested = true;
      return undefined;
    },
    release() {
      if (!deferred || scheduled) return false;
      scheduled = true;
      afterPaint(() => {
        deferred = false;
        if (requested) render();
      });
      return true;
    },
  };
}
