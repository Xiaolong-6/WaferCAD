// Conservative hardware confirmation for manually run renderer benchmarks.
// Unmasked renderer identity is required: WebGL vendor/renderer strings alone
// may say "WebKit WebGL" and do not establish a hardware adapter.
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software raster|microsoft basic render|\bwarp\b|lavapipe|mesa offscreen|gallium.*software/i;

export function classifyWebglBackend(frame) {
  const unmaskedRenderer =
    typeof frame?.unmaskedRenderer === 'string' ? frame.unmaskedRenderer.trim() : '';
  const maskedRenderer = typeof frame?.renderer === 'string' ? frame.renderer.trim() : '';
  if (!unmaskedRenderer) {
    return {
      hardwareVerified: false,
      reason: 'unmasked-renderer-unavailable',
      adapter: null,
      maskedRenderer,
    };
  }
  if (SOFTWARE_RENDERER_PATTERN.test(unmaskedRenderer)) {
    return {
      hardwareVerified: false,
      reason: 'software-renderer',
      adapter: unmaskedRenderer,
      maskedRenderer,
    };
  }
  return {
    hardwareVerified: true,
    reason: 'unmasked-adapter-name',
    adapter: unmaskedRenderer,
    maskedRenderer,
  };
}
