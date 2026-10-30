// Source-backed read-only, genuine production Mask Canvas renderer diagnostic.
// This does not load a project into the Workstation, Worker, or persisted storage.
async ({ model: inputModel, layout: inputLayout, selectedLayerKeys, center, zoom = 1 }) => {
  if (inputModel && inputLayout)
    window.__wafercadOfflineMaskInput = { model: inputModel, layout: inputLayout };
  const { model, layout } = window.__wafercadOfflineMaskInput || {};
  if (!model?.boundary || !Array.isArray(layout?.elements))
    throw Error('Missing native Mask project');
  const [{ createPlanViewController }, { createPlanRenderers }] = await Promise.all([
    import('https://wafercad.local/controllers/plan-view-controller.js'),
    import('https://wafercad.local/plan-renderers.js'),
  ]);
  const canvas = document.createElement('canvas');
  canvas.id = 'wc-offline-mask-capture';
  canvas.style.cssText = 'display:block;width:1400px;height:900px;background:#f8fafc';
  const container = document.createElement('div');
  container.id = 'wc-offline-mask-stage';
  container.style.cssText =
    'position:fixed;inset:0;z-index:999999;background:#fff;padding:0;overflow:hidden';
  container.append(canvas);
  document.body.append(container);
  const state = {
    model,
    layout,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    activeFace: 'front',
    selectedLayerKeys: new Set(selectedLayerKeys),
    maskSourceMode: 'file',
    maskOpacity: 1,
    readOnlyPreview: true,
    planViews: { mask: { zoom, panX: 0, panY: 0 }, main: { zoom: 1, panX: 0, panY: 0 } },
  };
  const noop = () => {};
  const plan = createPlanViewController({
    getModel: () => state.model,
    getLayout: () => state.layout,
    getMaskTransform: () => state.maskTransform,
    getPlanViews: () => state.planViews,
    maskPoint: (p) => p,
    formatXY: (value) => String(Number(value.toFixed(2))),
    xyToDisplay: (value) => value,
    xyFromDisplay: (value) => value,
    xyUnitLabel: () => 'µm',
    renderMask: noop,
    renderMain: noop,
    getViewportMargin: () => 32,
  });
  const renderer = createPlanRenderers({
    root: {
      getElementById: (id) => (id === 'maskCanvas' ? canvas : document.getElementById(id)),
      createElement: (tag) => document.createElement(tag),
    },
    getState: () => state,
    ...plan,
    getDrawMaskController: () => null,
    getMaskRoiController: () => null,
    getSectionEditor: () => null,
    syncSectionInputs: noop,
    selectedElement: (e) => state.selectedLayerKeys.has(`${e.layer}|${e.datatype}`),
    maskPoint: (p) => p,
    layerKey: (layer, datatype) => `${layer}|${datatype}`,
    layerColor: (key, opacity = 1) => {
      const palette = {
        '0|0': [150, 87, 63],
        '2|0': [36, 94, 163],
        '8|0': [205, 112, 41],
        '8|1': [27, 132, 93],
      };
      const rgb = palette[key] || [100, 100, 120];
      return `rgba(${rgb.join(',')},${opacity})`;
    },
    canvasTheme: true,
  });
  if (center) {
    const viewport = plan.viewport(1400, 900, 'mask');
    state.planViews.mask.panX = 700 - (viewport.cx + center[0] * viewport.s);
    state.planViews.mask.panY = 450 - (viewport.cy - center[1] * viewport.s);
  }
  const before = performance.now();
  renderer.renderMask();
  const elapsedMs = performance.now() - before;
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0,
    tinted = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]) opaque++;
    if (pixels[i + 2] > pixels[i] * 1.05) tinted++;
  }
  return {
    nativeProductionMaskCanvas: true,
    readOnly: true,
    sourcePolygonCount: layout.elements.length,
    selectedLayerKeys: [...state.selectedLayerKeys],
    center,
    zoom,
    elapsedMs,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    opaquePixels: opaque,
    tintedPixels: tinted,
    canvasId: canvas.id,
  };
};
