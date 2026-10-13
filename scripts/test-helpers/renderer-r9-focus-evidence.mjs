import { validRendererRasterState } from './renderer-v3-raster-state.mjs';

// A complete list of draw submissions is not complete GPU-resource coverage.
// Buffer content is sampled at most 4096 bytes per binding. Texture content
// and other texture-level metadata are not captured.
export const R9_FOCUS_START = 129;
export const R9_FOCUS_END = 154;
export const R9_FOCUS_COUNT = R9_FOCUS_END - R9_FOCUS_START + 1;

export function checkRendererR9FocusEvidence(draws) {
  const reject = (reason) => ({ valid: false, reason });
  if (!Array.isArray(draws) || draws.length !== R9_FOCUS_COUNT) {
    return reject('R9 requires exactly 26 consecutive exterior draw records');
  }
  for (let index = 0; index < R9_FOCUS_COUNT; index++) {
    const row = draws[index];
    if (row?.draw !== R9_FOCUS_START + index || row.status !== 'sampled') {
      return reject('R9 missing, reordered or incomplete focused draw');
    }
    if (
      row.kind !== 'material-exterior' ||
      !['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'].includes(
        row.method,
      ) ||
      !Array.isArray(row.args) ||
      row.args.length < 3 ||
      row.args.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      return reject('R9 draw owner or dispatch arguments are invalid');
    }
    if (!validRendererRasterState(row.rasterState)) {
      return reject('R9 requires a complete raster-state snapshot for every draw');
    }
    if (
      !Array.isArray(row.shaderHashes) ||
      row.shaderHashes.length < 2 ||
      row.shaderHashes.some(
        (shader) =>
          !Number.isInteger(shader.type) ||
          !Number.isSafeInteger(shader.length) ||
          shader.length <= 0 ||
          !/^[a-f0-9]{64}$/.test(shader.hash),
      )
    ) {
      return reject('R9 requires hashes of both complete attached shaders');
    }
    if (
      !Array.isArray(row.uniforms) ||
      row.uniforms.length > 128 ||
      row.uniforms.some(
        (uniform) =>
          typeof uniform.name !== 'string' ||
          !uniform.name ||
          !Number.isInteger(uniform.type) ||
          !Number.isSafeInteger(uniform.size) ||
          uniform.size < 1 ||
          uniform.value == null,
      )
    ) {
      return reject('R9 shader uniform evidence is incomplete');
    }
    if (
      row.bufferSampleBytesPerBinding !== 4096 ||
      row.uninspectedAttributesEnabled !== false ||
      !Array.isArray(row.buffers?.attributes) ||
      !row.buffers.attributes.length ||
      row.buffers.attributes.some(
        (buffer) =>
          buffer.status !== 'read' ||
          !Number.isSafeInteger(buffer.totalBytes) ||
          buffer.totalBytes < 0 ||
          !Number.isInteger(buffer.sampledBytes) ||
          buffer.sampledBytes !== Math.min(4096, buffer.totalBytes) ||
          !/^[a-f0-9]{64}$/.test(buffer.hash),
      ) ||
      (row.method.startsWith('drawElements') &&
        (row.buffers.indices?.status !== 'read' ||
          !/^[a-f0-9]{64}$/.test(row.buffers.indices.hash || '')))
    ) {
      return reject('R9 GPU buffer fingerprint is missing or unbounded');
    }
    if (
      !Number.isSafeInteger(row.totalTextureUnits) ||
      row.totalTextureUnits < 1 ||
      !Array.isArray(row.textureUnits) ||
      row.textureUnits.length !== Math.min(16, row.totalTextureUnits) ||
      row.textureUnits.some(
        (unit, i) =>
          unit.unit !== i ||
          ['texture2d', 'textureCube', 'texture3d', 'texture2dArray'].some(
            (field) => typeof unit[field] !== 'boolean',
          ),
      ) ||
      row.textureContentVerified !== false
    ) {
      return reject('R9 texture binding coverage is missing or misrepresented');
    }
  }
  return { valid: true, reason: null };
}
