// A deploy-scoped URL keeps HTTP cache reuse safe when bundled examples change.
// Both Welcome prefetch and the editor must request the exact same URL.
export function versionedExampleAssetPath(path, buildVersion = '') {
  return buildVersion
    ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(buildVersion)}`
    : path;
}

// A fetched ArrayBuffer already owns the bytes. Rewrapping it in a File copies
// the whole payload before the worker transfers it again. Project IO only needs
// this minimal File-like interface (and the non-worker reader uses text()).
export function bufferBackedProjectFile(arrayBuffer, filename) {
  return {
    name: filename,
    size: arrayBuffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
    text: async () => new TextDecoder().decode(arrayBuffer),
  };
}
