// Playwright page.evaluate diagnostic; reuse the production shader/CPU gate.
async (model) => {
  const THREE = await import('three');
  const { checkGpuRoughHeightParity, gpuRoughParitySamples } =
    await import('https://wafercad.local/gpu-rough-surface.js');
  const profile = model.regions
    .find((region) => region.id === 'region-113')
    ?.stack.find((segment) => segment.layerId === 'base')?.frontSurface;
  if (!profile) throw Error('Photodetector physical rough profile not found');
  const before = JSON.stringify(model);
  const renderer = new THREE.WebGLRenderer();
  const previous = new THREE.WebGLRenderTarget(2, 2);
  renderer.setRenderTarget(previous);
  const memoryBefore = { ...renderer.info.memory };
  const results = [];
  try {
    for (const [name, x, appearance] of [
      ['origin-control', 0, { ...profile, morphology: 'stochastic' }],
      ['photodetector-actual', 2495, { ...profile, morphology: 'stochastic' }],
      ['stable-scale-actual', 2495, { ...profile, morphology: 'stochastic-v2' }],
      ['stable-scale-origin', 0, { ...profile, morphology: 'stochastic-v2' }],
      ['uniform-height-control', 2495, { ...profile, heightCv: 0 }],
    ]) {
      const triangles = [];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const x0 = x - 0.3 + col * 0.075,
            y0 = -0.3 + row * 0.075;
          const a = [x0, y0],
            b = [x0 + 0.075, y0],
            c = [x0 + 0.075, y0 + 0.075],
            d = [x0, y0 + 0.075];
          triangles.push([a, b, c], [a, c, d]);
        }
      }
      const points = gpuRoughParitySamples([{ baseTriangles: triangles }]);
      const started = performance.now();
      const result = checkGpuRoughHeightParity(THREE, renderer, appearance, points);
      const elapsedMs = performance.now() - started;
      const cached = checkGpuRoughHeightParity(THREE, renderer, appearance, points);
      if (result !== cached) throw Error('Unchanged task did not reuse GPU qualification');
      if (renderer.getRenderTarget() !== previous) throw Error('GPU probe changed render target');
      if (result.maximumErrorUm === undefined) throw Error('GPU numerical probe did not execute');
      if (result.eligible !== result.maximumErrorUm < 2e-5)
        throw Error('Height gate ignored physical tolerance');
      if (name === 'uniform-height-control' && !result.eligible)
        throw Error('Constant-height control must pass');
      results.push({ name, ...result, elapsedMs, cacheReused: true });
    }
    if (JSON.stringify(model) !== before) throw Error('Qualification mutated physical geometry');
    const memoryAfter = { ...renderer.info.memory };
    if (
      memoryBefore.geometries !== memoryAfter.geometries ||
      memoryBefore.textures !== memoryAfter.textures
    ) {
      throw Error('GPU qualification leaked geometries or textures');
    }
    return { results, memoryBefore, memoryAfter, renderTargetRestored: true, modelUnchanged: true };
  } finally {
    renderer.setRenderTarget(null);
    previous.dispose();
    renderer.dispose();
  }
};
