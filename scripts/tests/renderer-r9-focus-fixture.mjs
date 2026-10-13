// Synthetic trace fixture for parser/gate tests. No browser or GPU needed.
import { RENDERER_RASTER_STATE_FIELDS } from '../test-helpers/renderer-v3-raster-state.mjs';
import { R9_FOCUS_END, R9_FOCUS_START } from '../test-helpers/renderer-r9-focus-evidence.mjs';

const arrays = {
  viewport: [0, 0, 530, 273],
  scissorBox: [0, 0, 530, 273],
  blendColor: [0, 0, 0, 0],
  colorMask: [true, true, true, true],
  depthRange: [0, 1],
};
const flags = new Set([
  'scissorTest',
  'blend',
  'depthTest',
  'depthMask',
  'stencilTest',
  'cullFace',
  'dither',
  'polygonOffsetFill',
  'sampleAlphaToCoverage',
  'sampleCoverage',
  'sampleCoverageInvert',
]);

export function mockR9FocusEvidence() {
  return Array.from({ length: R9_FOCUS_END - R9_FOCUS_START + 1 }, (_, i) => ({
    draw: R9_FOCUS_START + i,
    status: 'sampled',
    kind: 'material-exterior',
    name: 'exterior',
    method: 'drawArrays',
    args: [4, 0, 6],
    shaderHashes: [
      { type: 35633, length: 100, hash: 'a'.repeat(64) },
      { type: 35632, length: 100, hash: 'b'.repeat(64) },
    ],
    uniforms: [{ name: 'uOpacity', size: 1, type: 5126, value: 0.5 }],
    rasterState: Object.fromEntries(
      RENDERER_RASTER_STATE_FIELDS.map((field) => [
        field,
        Object.hasOwn(arrays, field) ? arrays[field] : flags.has(field) ? false : 1,
      ]),
    ),
    buffers: {
      attributes: [
        { status: 'read', index: 0, totalBytes: 64, sampledBytes: 64, hash: 'c'.repeat(64) },
      ],
      indices: null,
    },
    bufferSampleBytesPerBinding: 4096,
    uninspectedAttributesEnabled: false,
    textureUnits: Array.from({ length: 4 }, (_, unit) => ({
      unit,
      texture2d: false,
      textureCube: false,
      texture3d: false,
      texture2dArray: false,
    })),
    totalTextureUnits: 4,
    textureContentVerified: false,
  }));
}
