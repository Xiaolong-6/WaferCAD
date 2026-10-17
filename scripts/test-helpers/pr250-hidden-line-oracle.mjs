// Runs inside Chromium with the production outline pass and real depth buffer.
export async function hiddenLinePixelOracle() {
  const THREE = await import('three');
  const { renderDepthAwareOutlines } = await import('/site/three-outline-pass.js');
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(320, 320);
  renderer.setClearColor(0xffffff);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const shape = new THREE.Shape();
  shape.moveTo(-0.8, -0.8);
  shape.lineTo(0.8, -0.8);
  shape.lineTo(0.8, 0.8);
  shape.lineTo(-0.8, 0.8);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.2, -0.6);
  hole.lineTo(-0.2, 0.6);
  hole.lineTo(0.2, 0.6);
  hole.lineTo(0.2, -0.6);
  hole.closePath();
  shape.holes.push(hole);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  scene.add(mesh);
  const outlines = [];
  for (const [y, z] of [
    [0.3, 0.25],
    [-0.3, -0.25],
  ]) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.9, y, z),
      new THREE.Vector3(0.9, y, z),
    ]);
    const visible = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x00aa00,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessEqualDepth,
      }),
    );
    const hidden = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({
        color: 0xdd0000,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        dashSize: 0.06,
        gapSize: 0.04,
      }),
    );
    hidden.computeLineDistances();
    outlines.push(visible, hidden);
    scene.add(visible, hidden);
  }
  const results = [];
  for (const direction of [1, -1]) {
    camera.position.set(0, 0, direction * 3);
    camera.lookAt(0, 0, 0);
    renderDepthAwareOutlines(renderer, scene, camera, { occluders: [mesh], outlines });
    const pixels = new Uint8Array(320 * 320 * 4);
    renderer.getContext().readPixels(0, 0, 320, 320, 6408, 5121, pixels);
    const bands = [0.3, -0.3].map((y) => {
      let green = 0,
        red = 0,
        holeGreen = 0;
      for (let row = Math.round((y + 1) * 160) - 2; row <= Math.round((y + 1) * 160) + 2; row++) {
        for (let x = 16; x < 304; x++) {
          const offset = (row * 320 + x) * 4;
          if (
            pixels[offset + 1] > pixels[offset] * 1.4 &&
            pixels[offset + 1] > pixels[offset + 2] * 1.4
          ) {
            green++;
            if (x >= 130 && x < 190) holeGreen++;
          }
          if (
            pixels[offset] > pixels[offset + 1] * 1.4 &&
            pixels[offset] > pixels[offset + 2] * 1.4
          )
            red++;
        }
      }
      return { y, green, red, holeGreen };
    });
    results.push({ direction, bands, png: renderer.domElement.toDataURL('image/png') });
  }
  renderer.dispose();
  return results;
}
