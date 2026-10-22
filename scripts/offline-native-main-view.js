// Diagnostic-only read-only production Main renderer of a validated exact continuous model.
// Never modifies Workstation model, History, recovery, storage or canvas geometry ownership.
async ({ model }) => {
  if (model?.kernel !== 'vector-continuous-etch-v1')
    throw new RangeError('Native Main preview requires exact continuous material');
  const [{ createPlanViewController }, { createPlanRenderers }] = await Promise.all([
    import('https://wafercad.local/controllers/plan-view-controller.js'),
    import('https://wafercad.local/plan-renderers.js'),
  ]);
  const section = { a: [-model.width * 0.45, 0], b: [model.width * 0.45, 0] };
  const state = {
    model,
    activeFace: 'front',
    section,
    roi: null,
    roiDraft: null,
    sectionEditEnabled: false,
    roiTool: null,
    readOnlyPreview: true,
    planViews: {
      main: { zoom: 1, panX: 0, panY: 0 },
      mask: { zoom: 1, panX: 0, panY: 0 },
    },
  };
  const noop = () => {};
  const plan = createPlanViewController({
    getModel: () => state.model,
    getLayout: () => ({ elements: [], linework: [] }),
    getMaskTransform: () => ({ x: 0, y: 0, scale: 1, rotation: 0 }),
    getPlanViews: () => state.planViews,
    maskPoint: (point) => point,
    formatXY: (value) => String(Number(value.toFixed(2))),
    xyToDisplay: (value) => value,
    xyFromDisplay: (value) => value,
    xyUnitLabel: () => 'µm',
    renderMask: noop,
    renderMain: noop,
    getViewportMargin: () => 34,
  });
  const renderer = createPlanRenderers({
    root: document,
    getState: () => state,
    ...plan,
    getDrawMaskController: () => null,
    getMaskRoiController: () => null,
    getSectionEditor: () => null,
    syncSectionInputs: noop,
    selectedElement: () => false,
    maskPoint: (point) => point,
    layerKey: (layer, datatype) => layer + '|' + datatype,
    layerColor: () => '#adb7c0',
    canvasTheme: true,
  });
  const canvas = document.querySelector('#mainCanvas');
  const before = performance.now();
  renderer.renderMain();
  const elapsedMs = performance.now() - before;
  const context = canvas.getContext('2d');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let solidPixels = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) solidPixels++;
  return {
    nativeProductionPlanRenderer: true,
    workstationStateLoaded: false,
    modelKernel: model.kernel,
    elapsedMs,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    solidPixels,
    unsupportedFlag: canvas.dataset.continuousPlanUnsupported || null,
  };
};
