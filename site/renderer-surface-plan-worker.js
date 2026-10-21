// Run the existing deterministic physical-ownership plan off the UI thread.
// Only plain scientific geometry is exchanged; no Three.js/WebGL state crosses.
const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

const moduleUrl = new URL('./renderer-geometry.js', self.location.href);
moduleUrl.search = versionQuery;
const geometryModule = import(moduleUrl.href);
const streamUrl = new URL('./renderer-surface-plan-stream.js', self.location.href);
streamUrl.search = versionQuery;
const streamModule = import(streamUrl.href);
const previewUrl = new URL('./renderer-progressive-preview.js', self.location.href);
previewUrl.search = versionQuery;
const previewModule = import(previewUrl.href);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1 || data.action !== 'surface-plan') return;
  try {
    if (data.preview === true) {
      // A display-only sketch must never be a prerequisite for scientific
      // ownership. If preview generation or transfer fails, continue exact.
      try {
        const { buildProgressiveSurfacePreview } = await previewModule;
        const preview = buildProgressiveSurfacePreview(data.model, data.clip ?? null);
        if (preview) {
          self.postMessage({ id: 1, type: 'preview', preview }, [preview.borderPositions.buffer]);
        }
      } catch (error) {
        console.warn('Progressive 3D preview unavailable; computing exact solids:', error);
      }
    }
    const [{ buildRenderSurfacePlan }, { shouldStreamSurfacePlan, surfacePlanStreamPackets }] =
      await Promise.all([geometryModule, streamModule]);
    const plan = buildRenderSurfacePlan(data.model, data.clip ?? null);
    if (!shouldStreamSurfacePlan(plan)) {
      self.postMessage({ id: 1, type: 'done', plan });
      return;
    }
    let sent = 0;
    for (const packet of surfacePlanStreamPackets(plan)) {
      self.postMessage(packet);
      // Worker cooperative sends bound the main thread's clone work per task.
      if (++sent % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } catch (error) {
    self.postMessage({
      id: 1,
      type: 'error',
      message: error?.message || String(error || 'Surface ownership calculation failed.'),
    });
  }
};
