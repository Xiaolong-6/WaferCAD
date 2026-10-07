const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

let modulesPromise = null;
let prewarmEpoch = 0;

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
      import(versioned('./advanced-process-operations.js')),
      import(versioned('./project-schema.js')),
      import(versioned('./model-array-process.js')),
      import(versioned('./model-array.js')),
      import(versioned('./mask-instance-index.js')),
      import(versioned('./process-boundary-index.js')),
    ]).then(
      ([
        modelApi,
        vectorApi,
        drawApi,
        maskRoiApi,
        advancedApi,
        projectSchema,
        arrayProcess,
        arrayApi,
        maskIndexApi,
        boundaryIndexApi,
      ]) => ({
        modelApi,
        vectorApi,
        drawApi,
        maskRoiApi,
        advancedApi,
        projectSchema,
        arrayProcess,
        arrayApi,
        maskIndexApi,
        boundaryIndexApi,
      }),
    );
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

function processArea(
  model,
  request,
  modelApi,
  vectorApi,
  drawApi,
  maskRoiApi,
  arrayApi,
  maskIndexApi,
) {
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
  const result = limiter ? vectorApi.intersection(area, limiter) : area;
  if (arrayApi.isArrayModel(model) && request.maskSourceMode === 'file')
    Object.defineProperty(result, 'arrayMaskQuery', {
      value: {
        index:
          mode === 'full'
            ? null
            : request.maskIndex ||
              maskIndexApi.compileMaskInstanceIndex(request.elements || [], request.maskTransform),
        mode,
        limiter,
        boundary: model.boundary,
      },
    });
  return result;
}

self.onmessage = async (event) => {
  const { id, model, params, areaRequest } = event.data || {};
  if (!id) return;
  const currentEpoch = ++prewarmEpoch;
  try {
    const {
      modelApi,
      vectorApi,
      drawApi,
      maskRoiApi,
      advancedApi,
      projectSchema,
      arrayProcess,
      arrayApi,
      maskIndexApi,
      boundaryIndexApi,
    } = await modules();
    self.postMessage({ id, type: 'progress', stage: 'Preparing process area…' });
    const area = processArea(
      model,
      areaRequest,
      modelApi,
      vectorApi,
      drawApi,
      maskRoiApi,
      arrayApi,
      maskIndexApi,
    );
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
    const apply = (candidate, localParams) =>
      advancedApi.applyAdvancedProcessOperation(
        candidate,
        localParams,
        localParams.area,
        modelApi,
        vectorApi,
      ) ?? modelApi.applyOperation(candidate, localParams);
    const result = arrayApi.isArrayModel(nextModel)
      ? arrayProcess.applyArrayOperation(nextModel, { ...params, area }, apply)
      : apply(nextModel, { ...params, area });
    if (result?.changed) {
      self.postMessage({ id, type: 'progress', stage: 'Validating process geometry…' });
      try {
        projectSchema.validateProcessModel(nextModel);
      } catch (error) {
        self.postMessage({
          id,
          type: 'done',
          rejected: true,
          error: `Process result rejected; the previous structure and History were preserved. ${error.message}`,
        });
        return;
      }
    }
    self.postMessage({ id, type: 'done', model: nextModel, result, validated: true });
    // The committed candidate is immutable here. Yield between regions so a
    // new foreground request cancels idle preparation before computing.
    if (result?.changed)
      setTimeout(() => {
        boundaryIndexApi
          .prewarmModelBoundaryIndexes(nextModel, () => currentEpoch === prewarmEpoch)
          .catch(() => {}); // Optional cache work never turns success into failure.
      }, 250);
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown process error'),
    });
  }
};
