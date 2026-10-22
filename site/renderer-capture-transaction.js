// Isolate the temporary WebGL renderer and high-resolution rough-mesh
// preparation from the interactive 3D view. No canonical model mutations.
// A display-only progressive cap sketch is never a publishable PNG. This
// gate is checked before starting export and again after async preparation,
// because a newer render may replace the scene while capture is in progress.
export function assertExactThreePngReady({ fidelity, renderState, exactFirstFrameMs } = {}) {
  const exact = ['exact-surface-plan', 'exact-physical-facet', 'exact-continuous-etch'];
  if (!exact.includes(fidelity) || renderState !== 'ready' || !(Number(exactFirstFrameMs) > 0)) {
    throw new Error(
      '3D PNG export requires a painted exact 3D frame. Wait for rendering to finish.',
    );
  }
}

export async function runTemporaryRendererCapture({
  mainRenderer,
  camera,
  pixelRatio,
  aspect,
  createRenderer,
  configureRenderer,
  prepareScene,
  capture,
  restoreScene,
  scheduleFrame,
}) {
  const originalPixelRatio = mainRenderer.getPixelRatio();
  const originalAspect = camera.aspect;
  let temporaryRenderer = null;
  let mainStateTouched = false;
  let result;
  let operationError = null;
  const cleanupErrors = [];

  try {
    temporaryRenderer = createRenderer();
    configureRenderer(temporaryRenderer);
    // Mark before mutation: an implementation may update state then throw.
    mainStateTouched = true;
    mainRenderer.setPixelRatio(pixelRatio);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    await prepareScene();
    result = await capture(temporaryRenderer);
  } catch (error) {
    operationError = error;
  } finally {
    if (temporaryRenderer) {
      try {
        temporaryRenderer.dispose();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (mainStateTouched) {
      try {
        mainRenderer.setPixelRatio(originalPixelRatio);
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        camera.aspect = originalAspect;
        camera.updateProjectionMatrix();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await restoreScene();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        scheduleFrame();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (operationError && cleanupErrors.length) {
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      '3D PNG capture failed and cleanup reported additional errors.',
    );
  }
  if (operationError) throw operationError;
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, '3D PNG capture cleanup failed.');
  }
  return result;
}
