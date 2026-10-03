const versionQuery = self.location.search || '';

function versioned(path) {
  const url = new URL(path, self.location.href);
  url.search = versionQuery;
  return url.href;
}

let layoutApiPromise = null;
function layoutApi() {
  if (!layoutApiPromise) layoutApiPromise = import(versioned('./layout-io.js'));
  return layoutApiPromise;
}

self.onmessage = async (event) => {
  const { id, arrayBuffer, filename = '' } = event.data || {};
  if (!id) return;
  try {
    self.postMessage({ id, type: 'progress', stage: 'Parsing layout…' });
    const { parseLayoutFile } = await layoutApi();
    const imported = await parseLayoutFile(arrayBuffer, filename);
    self.postMessage({ id, type: 'progress', stage: 'Preparing flattened layout…' });
    self.postMessage({ id, type: 'done', imported });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error?.message || String(error || 'Unknown layout import error'),
    });
  }
};
