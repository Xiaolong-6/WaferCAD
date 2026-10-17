import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHardwareWebGL } from './p1-gpu-identity.mjs';

test('NVIDIA discrete and Intel / AMD integrated adapters are eligible', () => {
  for (const [unmaskedVendor, unmaskedRenderer, manufacturer] of [
    ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, GeForce RTX 3060 D3D11)', 'NVIDIA'],
    ['Google Inc. (Intel)', 'ANGLE (Intel, Intel UHD Graphics 770 D3D11)', 'Intel'],
    ['Google Inc. (Intel)', 'ANGLE (Intel, Intel Iris Xe Graphics D3D11)', 'Intel'],
    ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon Graphics D3D11)', 'AMD'],
    ['Google Inc. (AMD)', 'ANGLE (AMD, Radeon 780M Graphics D3D11)', 'AMD'],
  ]) {
    assert.deepEqual(classifyHardwareWebGL({ unmaskedVendor, unmaskedRenderer }), {
      verified: true,
      manufacturer,
      adapter: unmaskedRenderer,
      reason: null,
    });
  }
});

test('software adapters fail closed even when a vendor name appears', () => {
  for (const unmaskedRenderer of [
    'ANGLE (Google, Vulkan SwiftShader Device, SwiftShader driver)',
    'ANGLE (NVIDIA, Microsoft Basic Render Driver, Direct3D11)',
    'ANGLE (Intel, Microsoft WARP, Direct3D11)',
    'llvmpipe (LLVM 17.0.6, 256 bits)',
    'softpipe',
    'Mesa lavapipe',
  ]) {
    assert.equal(
      classifyHardwareWebGL({ unmaskedVendor: 'Google Inc. (NVIDIA)', unmaskedRenderer }).verified,
      false,
      unmaskedRenderer,
    );
  }
});

test('unknown/masked WebGL identities do not qualify as hardware evidence', () => {
  assert.equal(classifyHardwareWebGL(null).verified, false);
  const masked = classifyHardwareWebGL({ vendor: 'WebKit', renderer: 'WebKit WebGL' });
  assert.equal(masked.verified, false);
  const unavailable = classifyHardwareWebGL({
    unmaskedVendor: 'Google Inc. (Intel)',
    unmaskedRenderer: '',
  });
  const unidentified = classifyHardwareWebGL({
    unmaskedVendor: 'Google Inc.',
    unmaskedRenderer: 'ANGLE (Unknown GPU)',
  });
  assert.equal(unavailable.verified, false);
  assert.equal(unidentified.verified, false);
});
