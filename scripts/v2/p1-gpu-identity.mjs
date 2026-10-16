// Hardware acceptance may run on an integrated GPU. Renderer strings must
// identify a physical adapter; generic WebGL branding is not evidence.
// Keep this conservative: unknown adapters and all software paths fail closed.
const SOFTWARE_RENDERERS =
  /swiftshader|llvmpipe|softpipe|software (?:rasterizer|renderer)|\bwarp\b|basic render driver|gdi generic|mesa offscreen|lavapipe/i;

export function classifyHardwareWebGL(gl) {
  const vendor = String(gl?.unmaskedVendor || '');
  const renderer = String(gl?.unmaskedRenderer || '');
  const identity = `${vendor} ${renderer}`;
  let manufacturer = null;
  if (/nvidia|geforce|quadro|tesla gpu/i.test(identity)) manufacturer = 'NVIDIA';
  else if (/\bamd\b|\bati\b|radeon/i.test(identity)) manufacturer = 'AMD';
  else if (/intel|\biris\b|\buhd graphics\b/i.test(identity)) manufacturer = 'Intel';
  else if (/\bapple\b/i.test(identity)) manufacturer = 'Apple';

  const software = SOFTWARE_RENDERERS.test(identity);
  const verified = Boolean(renderer && manufacturer && !software);
  return {
    verified,
    manufacturer,
    adapter: renderer || null,
    reason: !renderer
      ? 'Unmasked renderer identity unavailable'
      : software
        ? 'Software renderer detected'
        : !manufacturer
          ? 'Unknown physical GPU manufacturer'
          : null,
  };
}
