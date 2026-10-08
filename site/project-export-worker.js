const versionQuery = self.location.search || '';
self.importScripts(`./vendor/polygon-clipping.umd.js${versionQuery}`);

function versioned(path) {
  const url = new URL(path, self.location.href);
  url.search = versionQuery;
  return url.href;
}

let projectIoPromise = null;
function projectIo() {
  if (!projectIoPromise) projectIoPromise = import(versioned('./project-io.js'));
  return projectIoPromise;
}

self.onmessage = async (event) => {
  const { id, project } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Validating and packing project…' });
    const api = await projectIo();
    const { stored, mode } = api.prepareProjectForExport(project);

    self.postMessage({
      id,
      type: 'progress',
      stage: mode === 'lossless'
        ? 'Preserving exact sub-grid geometry in lossless project export…'
        : 'Serializing project…',
    });
    const bytes = new TextEncoder().encode(JSON.stringify(stored));
    if (bytes.byteLength > api.MAX_PROJECT_FILE_BYTES) {
      throw new Error(
        `Project file would be larger than the ${Math.round(api.MAX_PROJECT_FILE_BYTES / (1024 * 1024))} MB safety limit.`,
      );
    }
    const arrayBuffer = bytes.buffer;
    self.postMessage({ id, type: 'done', arrayBuffer, byteLength: bytes.byteLength, mode }, [
      arrayBuffer,
    ]);
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown project export error'),
    });
  }
};
