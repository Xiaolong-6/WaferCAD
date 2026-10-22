// Real WaferCAD Section renderer on a validated in-memory continuous Model.
// No mock geometry, Worker writes, or synthetic screenshot canvas drawing.
async ({ model, section }) => {
  const { createPlanRenderers } = await import('https://wafercad.local/plan-renderers.js');
  if (model?.kernel !== 'vector-continuous-etch-v1') throw Error('Continuous model required');
  const previous = document.getElementById('wc-offline-section-capture');
  previous?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'wc-offline-section-capture';
  overlay.style.cssText =
    'position:fixed;inset:110px 55px 110px 255px;z-index:10010;background:white;' +
    'border:2px solid #5b6d7f;padding:12px;box-shadow:0 2px 20px #777;';
  const title = document.createElement('strong');
  title.textContent = 'WaferCAD native Section · continuous material · A–B';
  title.style.cssText = 'display:block;font:600 17px sans-serif;margin:0 0 12px;';
  const canvas = document.createElement('canvas');
  canvas.width = 1120;
  canvas.height = 630;
  canvas.style.cssText = 'width:100%;height:calc(100% - 48px);';
  const widgets = {
    sectionCanvas: canvas,
    sectionScaleModeBtn: document.createElement('button'),
    sectionBordersBtn: document.createElement('button'),
    sectionMeta: document.createElement('span'),
    sectionRange: document.createElement('span'),
  };
  overlay.append(title, canvas, widgets.sectionMeta, widgets.sectionRange);
  document.body.append(overlay);
  const factory = createPlanRenderers({
    root: { getElementById: (id) => widgets[id] || document.getElementById(id) },
    getState: () => ({
      model,
      section,
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      // Deliberately request the legacy wafer break. Continuous Etch must
      // refuse the default collapse and display the entire curved release.
      sectionCollapse: { enabled: true, top: 37, bottom: -37 },
      sectionViewport: { zoom: 1, panX: 0, panY: 0 },
    }),
    setupCanvas: (c) => ({ ctx: c.getContext('2d'), w: c.width, h: c.height }),
    getSectionCollapseController: () => ({ sync() {} }),
    xyText: (span) => `${span.toFixed(1)} µm`,
    formatXY: (value) => Number(value.toFixed(2)).toString(),
    xyUnitLabel: () => 'µm',
  });
  factory.renderSection();
  const result = {
    collapseEnabled: canvas.dataset.sectionCollapseEnabled,
    xPxPerUm: Number(canvas.dataset.xPxPerUm),
    zPxPerUm: Number(canvas.dataset.zPxPerUm),
    scale: widgets.sectionMeta.textContent,
    rasterNonEmpty: false,
  };
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p] < 200 && pixels[p + 1] < 210 && pixels[p + 2] < 220) {
      result.rasterNonEmpty = true;
      break;
    }
  }
  if (result.collapseEnabled !== 'false' || !result.rasterNonEmpty)
    throw Error('Native continuous Section did not expose full physical Z geometry');
  return result;
};
