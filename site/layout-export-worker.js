const versionQuery = self.location.search || '';

function versioned(path) {
  const url = new URL(path, self.location.href);
  url.search = versionQuery;
  return url.href;
}

let exportApiPromise = null;
function exportApi() {
  if (!exportApiPromise) exportApiPromise = import(versioned('./layout-export.js'));
  return exportApiPromise;
}

self.onmessage = async (event) => {
  const {
    id,
    format,
    layout,
    maskSourceMode,
    drawMask,
    maskTransform,
    maskRoi,
    selectedCells,
    selectedLayerKeys,
  } = event.data || {};
  if (!id) return;

  try {
    const api = await exportApi();
    self.postMessage({ id, type: 'progress', stage: 'Cropping and flattening export geometry…' });
    const exported = api.collectMaskExportElements({
      layout,
      maskSourceMode,
      drawMask,
      maskTransform,
      maskRoi,
      selectedCells,
      selectedLayerKeys,
    });
    if (!exported.elements.length) {
      self.postMessage({ id, type: 'done', empty: true, source: exported.source, roiApplied: exported.roiApplied });
      return;
    }

    const oasis = format === 'oas';
    self.postMessage({
      id,
      type: 'progress',
      stage: oasis ? 'Serializing OASIS…' : 'Serializing GDSII…',
    });
    const bytes = oasis
      ? api.serializeOASIS(exported.elements)
      : api.serializeGDS(exported.elements);
    const arrayBuffer = bytes.buffer;
    self.postMessage(
      {
        id,
        type: 'done',
        arrayBuffer,
        elementCount: exported.elements.length,
        source: exported.source,
        roiApplied: exported.roiApplied,
      },
      [arrayBuffer],
    );
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown layout export error'),
    });
  }
};
