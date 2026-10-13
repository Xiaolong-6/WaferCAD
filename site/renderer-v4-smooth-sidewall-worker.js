// Pure CPU mesh preparation; no WebGL context or scientific data modification.
let modulePromise;
function meshModule() {
  if (!modulePromise) {
    const url = new URL('./renderer-v4-smooth-sidewall-data.js', self.location.href);
    url.search = self.location.search;
    modulePromise = import(url.href);
  }
  return modulePromise;
}

self.onmessage = async ({ data }) => {
  const { id, parts } = data || {};
  if (id == null) return;
  try {
    const { prepareSmoothSidewallData } = await meshModule();
    const result = prepareSmoothSidewallData(parts);
    self.postMessage({ id, type: 'done', ...result }, [
      result.positions.buffer,
      result.normals.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) });
  }
};
