import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebglBackend } from '../../scripts/test-helpers/webgl-backend-classification.mjs';

test('WebGL hardware gate accepts a surfaced real adapter', () => {
  const result = classifyWebglBackend({
    unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002487) Direct3D11 vs_5_0 ps_5_0)',
    renderer: 'WebKit WebGL',
  });
  assert.equal(result.hardwareVerified, true);
  assert.equal(result.reason, 'unmasked-adapter-name');
  assert.match(result.adapter, /RTX 3060/);
});

test('WebGL hardware gate rejects software and obscured adapters', () => {
  for (const name of [
    'Google SwiftShader',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
    'llvmpipe (LLVM 18.1, 256 bits)',
    'Microsoft Basic Render Driver',
    'WARP',
    'Mesa Gallium (software rasterizer)',
  ]) {
    const result = classifyWebglBackend({ unmaskedRenderer: name });
    assert.equal(result.hardwareVerified, false, name);
    assert.equal(result.reason, 'software-renderer');
  }
  const generic = classifyWebglBackend({ unmaskedRenderer: 'Generic OpenGL Renderer' });
  assert.equal(generic.hardwareVerified, false);
  assert.equal(generic.reason, 'unrecognized-gpu-adapter');
  for (const frame of [null, {}, { renderer: 'WebKit WebGL' }, { unmaskedRenderer: '  ' }]) {
    const result = classifyWebglBackend(frame);
    assert.equal(result.hardwareVerified, false);
    assert.equal(result.reason, 'unmasked-renderer-unavailable');
  }
});
