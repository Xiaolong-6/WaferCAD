const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

let modulesPromise = null;

function modules() {
  if (!modulesPromise) {
    const versioned = (path) => {
      const url = new URL(path, self.location.href);
      url.search = versionQuery;
      return url.href;
    };
    modulesPromise = Promise.all([
      import(versioned('./model.js')),
      import(versioned('./vector-geometry.js')),
      import(versioned('./draw-mask-geometry.js')),
      import(versioned('./mask-roi-geometry.js')),
    ]).then(([modelApi, vectorApi, drawApi, maskRoiApi]) => ({
      modelApi,
      vectorApi,
      drawApi,
      maskRoiApi,
    }));
  }
  return modulesPromise;
}

function maskPoint(point, transform) {
  const a = ((Number(transform?.rotation) || 0) * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    scale = Number(transform?.scale) || 1,
    sx = Number(point[0]) * scale,
    sy = Number(point[1]) * scale;
  return [
    sx * c - sy * s + (Number(transform?.x) || 0),
    sx * s + sy * c + (Number(transform?.y) || 0),
  ];
}

function fileMaskGeometry(elements, transform, vectorApi) {
  const geoms = [];
  for (const element of elements || []) {
    if (!Array.isArray(element.points) || element.points.length < 2) continue;
    if (element.kind === 'polygon') {
      geoms.push([[element.points.map((point) => maskPoint(point, transform))]]);
    } else if (element.kind === 'path' && Number(element.width) > 0) {
      geoms.push(
        vectorApi.bufferPolyline(
          element.points.map((point) => maskPoint(point, transform)),
          (Number(element.width) * Math.abs(Number(transform?.scale) || 1)) / 2,
          28,
          false,
        ),
      );
    }
  }
  return vectorApi.unionGeometries(geoms);
}

function processArea(model, request, modelApi, vectorApi, drawApi, maskRoiApi) {
  const mode = request?.mode || 'full';
  let area;
  if (mode === 'full') {
    area = modelApi.fullFaceGeometry(model);
  } else {
    const selected =
      request?.maskSourceMode === 'draw'
        ? drawApi.drawMaskGeometry(request.drawMask)
        : fileMaskGeometry(request?.elements, request?.maskTransform, vectorApi);
    if (vectorApi.isEmpty(selected)) return [];
    const clipped = vectorApi.intersection(selected, model.boundary);
    area = mode === 'invert' ? vectorApi.difference(model.boundary, clipped) : clipped;
  }

  const roiTransform =
      request?.maskSourceMode === 'draw'
        ? { x: 0, y: 0, scale: 1, rotation: 0 }
        : request?.maskTransform,
    limiter = request?.maskRoi
      ? maskRoiApi.maskRoiWorldGeometry(request.maskRoi, roiTransform, 96)
      : null;
  return limiter ? vectorApi.intersection(area, limiter) : area;
}

self.onmessage = async (event) => {
  const { id, model, params, areaRequest } = event.data || {};
  if (!id) return;
  try {
    const { modelApi, vectorApi, drawApi, maskRoiApi } = await modules();
    self.postMessage({ id, type: 'progress', stage: 'Preparing process area…' });
    const area = processArea(model, areaRequest, modelApi, vectorApi, drawApi, maskRoiApi);
    if (vectorApi.isEmpty(area)) {
      self.postMessage({
        id,
        type: 'done',
        model,
        result: {
          changed: false,
          error: areaRequest?.maskRoi
            ? 'The selected process area does not overlap the Mask ROI.'
            : 'The selected process area is empty.',
        },
      });
      return;
    }

    self.postMessage({ id, type: 'progress', stage: 'Computing process geometry…' });
    const nextModel = structuredClone(model);
    const result = modelApi.applyOperation(nextModel, { ...params, area });
    self.postMessage({ id, type: 'done', model: nextModel, result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown process error'),
    });
  }
};
