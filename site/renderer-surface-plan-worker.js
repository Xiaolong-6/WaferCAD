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
const parallelUrl = new URL('./renderer-material-solids-parallel.js', self.location.href);
parallelUrl.search = versionQuery;
const parallelModule = import(parallelUrl.href);

self.onmessage = async ({ data }) => {
  if (data?.id !== 1 || data.action !== 'surface-plan') return;
  try {
    const [
      { buildRenderSurfacePlan },
      { shouldStreamSurfacePlan, surfacePlanStreamPackets },
      { parallelMaterialSolids },
    ] = await Promise.all([geometryModule, streamModule, parallelModule]);
    // The worker owns this model revision. Independent material layers may be
    // evaluated concurrently when resources allow, but exact ownership and
    // transport remain the single existing production pipeline.
    const solids = await parallelMaterialSolids(data.model, data.clip ?? null, {
      hardwareConcurrency: data.parallelCapabilities?.hardwareConcurrency || 0,
      deviceMemory: data.parallelCapabilities?.deviceMemory || 0,
    });
    const plan = buildRenderSurfacePlan(data.model, data.clip ?? null, solids);
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
