// The existing offline-native-app-capture.py evaluates this on a validated
// production model, using the real Section canvas compositor (never SVG mock).
async ({ roiBounds, line, zBreak, borders = false }) => {
  const scene = window.__wafercadOfflineModel;
  if (!scene?.model || !scene?.renderer?.ready) throw Error('Native 3D model is not ready');
  const { createPlanRenderers } = await import('https://wafercad.local/plan-renderers.js');
  const modelBefore = JSON.stringify(scene.model);
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 560;
  canvas.style.cssText = 'position:fixed;left:-2000px;top:0;width:1100px;height:560px;';
  const elements = new Map([['sectionCanvas', canvas]]);
  for (const id of ['sectionScaleModeBtn', 'sectionBordersBtn', 'sectionMeta', 'sectionRange']) {
    const element = document.createElement(id.endsWith('Btn') ? 'button' : 'span');
    elements.set(id, element);
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
  let mode = 'aligned';
  try {
    const renderer = createPlanRenderers({
      root,
      getState: () => state,
      setupCanvas: () => ({ ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height }),
      getDrawMaskController: () => null,
      getMaskRoiController: () => null,
      getSectionEditor: () => null,
      getSectionCollapseController: () => ({ sync() {} }),
      getRoughSectionDisplayMode: () => mode,
      selectedElement: () => null,
      syncSectionInputs: () => {},
      formatXY: (value) => Number(value).toFixed(2),
      xyText: (value) => Number(value).toFixed(2) + ' µm',
      xyUnitLabel: () => 'µm',
    });
    const result = {};
    for (const key of ['aligned', 'physical']) {
      mode = key;
      renderer.renderSection();
      result[key] = {
        png: canvas.toDataURL('image/png'),
        pixelDensity: Number(canvas.dataset.xPxPerUm),
        sampleMode: canvas.dataset.sectionRoughMode,
      };
    }
    if (modelBefore !== JSON.stringify(scene.model)) throw Error('Section comparison mutated model');
    return { ...result, modelUnchanged: true, actualProductionSectionRenderer: true };
  } finally {
    canvas.remove();
  }
};
