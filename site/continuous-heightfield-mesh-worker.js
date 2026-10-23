// Isolated display-only grid sampling; never writes into the canonical model.
const query = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${query}`);
const moduleUrl = new URL('./continuous-heightfield-mesh.js', self.location.href);
moduleUrl.search = query;
const meshModule = import(moduleUrl.href);
self.onmessage = async ({ data }) => {
  if (data?.id !== 1) return;
  try {
    const { buildContinuousSiHeightfieldMesh } = await meshModule;
    const mesh = buildContinuousSiHeightfieldMesh(data.owner, {
      xyStepUm: data.xyStepUm,
      maxTriangles: data.maxTriangles,
    });
    self.postMessage({ id: data.id, type: 'done', mesh }, [
      mesh.positions.buffer,
      mesh.normals.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id: data.id, type: 'error', message: error?.message || String(error) });
  }
};
