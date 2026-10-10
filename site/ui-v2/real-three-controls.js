// D1 presentation adapter for the EXISTING 3D camera/OrbitControls.
// All geometry, projection, rendering, history and persistence still belong to app.js/three-view.js.
// The optional gesture modes override left-drag only while active; default orbit stays unchanged.
(() => {
  const { button } = window.WaferCadV2Components;
  const finite = (point) => Array.isArray(point) &&
    point.length === 3 && point.every((value) => Number.isFinite(Number(value)));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const scale = (a, n) => a.map((v) => v * n);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a) => {
    const norm = Math.hypot(...a);
    return norm > 1e-12 ? scale(a, 1 / norm) : null;
  };

  // Orthographic screen-space delta converted into perspective world-space
  // camera/target translation at the current orbit target plane.
  function moveCamera(input, dx, dy, viewportHeight) {
    if (!finite(input?.position) || !finite(input?.target)) return null;
    const forwardVector = sub(input.target, input.position);
    const distance = Math.hypot(...forwardVector);
    const forward = unit(forwardVector);
    if (!forward || !Number.isFinite(input.fov) || input.fov <= 0 || input.fov >= 180)
      return null;
    const right = unit(cross(forward, [0, 0, 1])) || unit(cross(forward, [0, 1, 0]));
    const up = right && unit(cross(right, forward));
    if (!right || !up) return null;
    const worldPerCssPixel = (2 * distance * Math.tan((input.fov * Math.PI) / 360)) /
      Math.max(1, viewportHeight);
    const change = add(scale(right, -dx * worldPerCssPixel), scale(up, dy * worldPerCssPixel));
    return { ...input, position: add(input.position, change), target: add(input.target, change) };
  }
  function zoomCamera(input, dy) {
    if (!finite(input?.position) || !finite(input?.target)) return null;
    const offset = sub(input.position, input.target);
    const factor = Math.max(0.05, Math.min(20, Math.exp(dy * 0.009)));
    return { ...input, position: add(input.target, scale(offset, factor)) };
  }

  function create({ host, getCamera, setCamera }) {
    if (!(host instanceof HTMLElement)) throw TypeError('3D viewport host is required');
    if (typeof getCamera !== 'function' || typeof setCamera !== 'function')
      throw TypeError('3D camera accessors must be provided');
    let mode = null;
    let drag = null;
    let controls = null;

    function sync() {
      if (!controls) return;
      for (const [name, node] of controls) {
        node.setAttribute('aria-pressed', String(mode === name));
      }
      host.dataset.v2Gesture = mode || 'orbit';
    }
    function setMode(next) {
      if (drag) finish(drag.pointerId);
      mode = next === mode ? null : next;
      sync();
    }
    function begin(event) {
      if (!mode || event.button !== 0 || event.isPrimary === false ||
          event.target.tagName !== 'CANVAS') return;
      const camera = getCamera();
      if (!finite(camera?.position) || !finite(camera?.target)) return;
      const canvas = event.target;
      const rect = canvas.getBoundingClientRect();
      if (rect.height < 2) return;
      drag = {
        pointerId: event.pointerId,
        mode,
        x: event.clientX,
        y: event.clientY,
        height: rect.height,
        camera: structuredClone(camera),
      };
      host.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation(); // Do not start a second OrbitControls drag.
    }
    function move(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      const next = drag.mode === 'pan'
        ? moveCamera(drag.camera, dx, dy, drag.height)
        : zoomCamera(drag.camera, dy);
      if (next) setCamera(next);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function finish(pointerId) {
      if (!drag || drag.pointerId !== pointerId) return;
      const old = drag;
      drag = null;
      if (host.hasPointerCapture?.(old.pointerId)) host.releasePointerCapture(old.pointerId);
    }
    function end(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      finish(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const pan = button('Pan', 'v2-three-pan', 'pan', {
      title: 'Pan 3D: drag to translate the existing camera target',
      'aria-label': 'Pan 3D',
      'aria-pressed': 'false',
    });
    const zoom = button('Zoom', 'v2-three-zoom', 'zoom', {
      title: 'Zoom 3D: drag vertically; wheel zoom remains available in orbit mode',
      'aria-label': 'Zoom 3D',
      'aria-pressed': 'false',
    });
    controls = new Map([['pan', pan], ['zoom', zoom]]);
    pan.addEventListener('click', () => setMode('pan'));
    zoom.addEventListener('click', () => setMode('zoom'));
    // Listen on the host capture phase to take only opted-in left gestures.
    host.addEventListener('pointerdown', begin, true);
    host.addEventListener('pointermove', move, true);
    host.addEventListener('pointerup', end, true);
    host.addEventListener('pointercancel', end, true);
    function lostCapture(event) {
      if (drag?.pointerId === event.pointerId) drag = null;
    }
    host.addEventListener('lostpointercapture', lostCapture);
    sync();
    return Object.freeze({
      pan,
      zoom,
      hide() { if (drag) finish(drag.pointerId); },
      getMode: () => mode,
      destroy() {
        if (drag) finish(drag.pointerId);
        host.removeEventListener('pointerdown', begin, true);
        host.removeEventListener('pointermove', move, true);
        host.removeEventListener('pointerup', end, true);
        host.removeEventListener('pointercancel', end, true);
        host.removeEventListener('lostpointercapture', lostCapture);
      },
    });
  }
  window.WaferCadV2RealThreeControls = Object.freeze({ create, moveCamera, zoomCamera });
})();
