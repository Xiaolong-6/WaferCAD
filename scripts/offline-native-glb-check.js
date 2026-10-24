// Playwright page.evaluate diagnostic using the production physical exporter.
async () => {
  const { model, renderer } = window.__wafercadOfflineModel;
  const { roughProfileOffsetAtPoint } = await import('https://wafercad.local/surface-rendering.js');
  const before = JSON.stringify(model);
  const start = performance.now();
  const blob = await renderer.exportGlb();
  const bytes = await blob.arrayBuffer();
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2)
    throw Error('Invalid production GLB header');
  const jsonLength = header.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  const root = gltf.nodes.find((node) => node.name === 'WaferCAD');
  if (!root || Math.abs(root.matrix[0] - 1e-6) > 1e-12)
    throw Error('GLB physical metre transform changed');
  const binaryOffset = 20 + jsonLength + 8;
  let vertices = 0,
    maximumErrorUm = 0;
  const heights = new Map();
  for (const node of gltf.nodes) {
    const extra = node.extras;
    if (extra?.wafercadMorphology !== 'stochastic-v2' || extra.wafercadSurfaceFace !== 'front')
      continue;
    const segment = model.regions
      .flatMap((region) => region.stack)
      .find((part) => part.layerId === extra.wafercadLayerId && part.frontSurface);
    if (!segment) throw Error('GLB stable profile lost its material owner');
    const profile = segment.frontSurface;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const view = gltf.bufferViews[accessor.bufferView];
      if (accessor.componentType !== 5126 || accessor.type !== 'VEC3')
        throw Error('Unexpected GLB position representation');
      const offset = binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      const data = new DataView(bytes);
      const stride = view.byteStride || 12;
      const samples = new Map();
      for (let index = 0; index < accessor.count; index++) {
        const p = [0, 1, 2].map((axis) =>
          data.getFloat32(offset + index * stride + axis * 4, true),
        );
        // Closure skirts meet the ideal plane; cap heights use the physical field.
        if (Math.abs(p[2] - extra.wafercadSurfaceZUm) < 2e-5) continue;
        const expected = extra.wafercadSurfaceZUm + roughProfileOffsetAtPoint(p[0], p[1], profile);
        maximumErrorUm = Math.max(maximumErrorUm, Math.abs(p[2] - expected));
        samples.set(`${p[0]},${p[1]}`, p[2]);
        vertices++;
      }
      heights.set(extra.wafercadLayerId, samples);
    }
  }
  if (!vertices || maximumErrorUm >= 2e-5)
    throw Error(`GLB stable physical heights failed: ${maximumErrorUm} um at ${vertices} vertices`);
  const base = heights.get('base');
  const film = heights.get('layer-1');
  let pairedSamples = 0,
    maximumFilmErrorUm = 0;
  if (base && film) {
    for (const [xy, lower] of base) {
      if (!film.has(xy)) continue;
      pairedSamples++;
      maximumFilmErrorUm = Math.max(maximumFilmErrorUm, Math.abs(film.get(xy) - lower - 0.05));
    }
    if (!pairedSamples || maximumFilmErrorUm >= 2e-5)
      throw Error('GLB 50 nm film registration failed');
  }
  if (JSON.stringify(model) !== before) throw Error('GLB export changed the Process model');
  return {
    bytes: blob.size,
    elapsedMs: performance.now() - start,
    physicalVerticesChecked: vertices,
    maximumErrorUm,
    pairedSamples,
    maximumFilmErrorUm,
    modelUnchanged: true,
  };
};
