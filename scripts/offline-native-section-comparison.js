// Evaluated by the existing offline-native-app-capture.py after a validated
// project has been rendered with the production Three.js renderer. This uses
// the *production* Section compositor, not a substitute SVG/HTML mock.
async ({ roiBounds, line, zBreak, borders = false }) => {
  const scene = window.__wafercadOfflineModel;
  if (!scene?.model || !scene?.renderer?.ready) throw Error('3D model is not ready');
  const { createPlanRenderers } = await import('https://wafercad.local/plan-renderers.js');
  const modelBefore = JSON.stringify(scene.model);
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 560;
  canvas.style.cssText = 'position:fixed;left:-2000px;top:0;width:1100px;height:560px;';
  const elements = new Map([['sectionCanvas', canvas]]);
  for (const id of ['sectionScaleModeBtn', 'sectionBordersBtn', 'sectionMeta', 'sectionRange']) {
    const el = document.createElement(id.endsWith('Btn') ? 'button' : 'span');
    elements.set(id, el);
  }
  document.body.append(canvas);
  const root = {
    getElementById: (id) => elements.get(id) || document.getElementById(id),
    createElement: (...args) => document.createElement(...args),
    body: document.body,
  };
  const state = {
    model: scene.model,
    section: { a: [roiBounds[0], line[2]], b: [roiBounds[2], line[2]] },
    sectionScaleMode: 'auto',
    sectionShowBorders: Boolean(borders),
    sectionCollapse: zBreak ? { enabled: true, top: zBreak[0], bottom: zBreak[1] } : null,
    sectionViewport: { zoom: 1, panX: 0, panY: 0 },
  };
  try {
    const renderer = createPlanRenderers({
      root,
      getState: () => state,
      setupCanvas: () => ({ ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height }),
      getDrawMaskController: () => null,
      getMaskRoiController: () => null,
      getSectionEditor: () => null,
      getSectionCollapseController: () => ({ sync() {} }),
      selectedElement: () => null,
      syncSectionInputs: () => {},
      formatXY: (value) => Number(value).toFixed(2),
      xyText: (value) => `${Number(value).toFixed(2)} µm`,
      xyUnitLabel: () => 'µm',
    });
    // Only the production physical heightfield is valid. The rejected
    // display-aligned smoothing prototype must not return via diagnostics.
    renderer.renderSection();
    const density = Number(canvas.dataset.xPxPerUm);
    if (!(density > 0)) throw Error('Production Section did not report a valid XY scale');
    if (modelBefore !== JSON.stringify(scene.model))
      throw Error('Section comparison mutated model');
    return {
      physical: {
        png: canvas.toDataURL('image/png'),
        pixelDensity: density,
        sampleMode: 'physical',
      },
      modelUnchanged: true,
      actualProductionSectionRenderer: true,
    };
  } finally {
    canvas.remove();
  }
};
