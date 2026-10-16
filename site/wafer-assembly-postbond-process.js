// Source-bound post-Bond geometric recipe replay. No physics is simulated.
// The original v15 bonded project remains immutable and schema-valid;
// the returned Process model is an independent derived result, never a
// forged replacement for waferAssembly source material.
import { applyOperation, fullFaceGeometry } from './model.js';
import { applyProcessFaces } from './process-face-execution.js';
import { normalizeProcessRecipe } from './process-recipe.js';
import { validateBondedAssemblyProject } from './wafer-assembly.js';
import { validateProcessModel } from './project-schema.js';

export const MAX_POST_BOND_STEPS = 16;

// A deterministic checksum for accidental geometry drift, not a cryptographic
// authentication mechanism. Scientific validity comes from full Kernel replay.
function modelFingerprint(value) {
  let hash = 2166136261;
  function walk(item) {
    if (item === null || typeof item !== 'object') {
      const encoded = JSON.stringify(item);
      for (let i = 0; i < encoded.length; i++) {
        hash = Math.imul(hash ^ encoded.charCodeAt(i), 16777619) >>> 0;
      }
      return;
    }
    if (Array.isArray(item)) {
      walk('[');
      for (const element of item) walk(element);
      walk(']');
      return;
    }
    walk('{');
    for (const key of Object.keys(item).sort()) {
      walk(key);
      walk(item[key]);
    }
    walk('}');
  }
  walk(value);
  return hash.toString(16).padStart(8, '0');
}

export function normalizePostBondGeometryStep(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Post-Bond Process requires one Recipe step object.');
  }
  const normalized = normalizeProcessRecipe({ steps: [input] }).steps[0];
  const { command, params } = normalized;
  if (command !== 'deposit' && command !== 'etch') {
    throw new Error('Post-Bond Recipe currently supports only Deposit and directional Etch geometry.');
  }
  if (params.area !== 'full' || params.mask != null) {
    throw new Error('Post-Bond masked/ROI processing is not yet validated; use full-face area.');
  }
  if (command === 'deposit' && params.coverage !== 'direct') {
    throw new Error('Post-Bond Deposit currently supports only directional, full-face coverage.');
  }
  if (command === 'etch') {
    if (params.profile !== 'directional' || params.surface?.kind === 'rough') {
      throw new Error('Post-Bond Etch currently supports only smooth directional geometry.');
    }
    if (params.target) {
      throw new Error('Post-Bond selective Etch needs a source-aware layer reference contract.');
    }
  }
  if (!['front', 'back'].includes(params.face)) {
    throw new Error('Post-Bond Process currently requires one explicit front/back face.');
  }
  return {
    command,
    params:
      command === 'deposit'
        ? {
            material: params.material,
            thicknessUm: params.thicknessUm,
            coverage: 'direct',
            area: 'full',
            face: params.face,
          }
        : {
            profile: 'directional',
            thicknessUm: params.thicknessUm,
            area: 'full',
            face: params.face,
            target: '',
          },
  };
}

function computeStep(model, step) {
  const params =
    step.command === 'deposit'
      ? {
          type: 'add',
          name: step.params.material,
          thickness: step.params.thicknessUm,
          growth: 'direct',
          face: step.params.face,
        }
      : {
          type: 'etch',
          etchProfile: 'directional',
          thickness: step.params.thicknessUm,
          face: step.params.face,
        };
  // Mirror Process Worker: fullFaceGeometry + applyProcessFaces on private
  // copies, then validateProcessModel. Unsupported coverage never reaches here.
  const area = fullFaceGeometry(model);
  const applied = applyProcessFaces(model, { ...params, area }, (candidate, localParams) =>
    applyOperation(candidate, localParams),
  );
  if (!applied.result?.changed) {
    throw new Error(
      `Post-Bond ${step.command} geometry was not applied: ${applied.result?.error || 'no material changed'}.`,
    );
  }
  validateProcessModel(applied.model);
  return applied.model;
}

export function replayPostBondGeometry(project, recorded = []) {
  validateBondedAssemblyProject(project);
  if (!project?.waferAssembly) {
    throw new Error('Post-Bond Recipe requires verified Assembly source provenance.');
  }
  if (!Array.isArray(recorded) || recorded.length > MAX_POST_BOND_STEPS) {
    throw new Error('Post-Bond Recipe exceeds its bounded step count.');
  }
  let model = structuredClone(project.model);
  const stages = [];
  for (const [index, record] of recorded.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Post-Bond Recipe record is invalid.');
    }
    const expected = normalizePostBondGeometryStep(record);
    if (
      Object.keys(record).sort().join('|') !== 'command|modelFingerprint|params' ||
      JSON.stringify(expected) !== JSON.stringify({ command: record.command, params: record.params })
    ) {
      throw new Error('Post-Bond Recipe step differs from its canonical geometry parameters.');
    }
    model = computeStep(model, expected);
    if (record.modelFingerprint !== modelFingerprint(model)) {
      throw new Error(`Post-Bond Recipe step ${index + 1} material checksum differs from Worker-compatible replay.`);
    }
    stages.push({ index: index + 1, fingerprint: record.modelFingerprint });
  }
  return { model, stages };
}

export function appendPostBondGeometryStep(project, recorded, input) {
  if (!Array.isArray(recorded) || recorded.length >= MAX_POST_BOND_STEPS) {
    throw new Error('Post-Bond Recipe exceeds its bounded step count.');
  }
  const previous = replayPostBondGeometry(project, recorded);
  const step = normalizePostBondGeometryStep(input);
  const model = computeStep(previous.model, step);
  const next = [
    ...structuredClone(recorded),
    { ...step, modelFingerprint: modelFingerprint(model) },
  ];
  const replay = replayPostBondGeometry(project, next);
  if (modelFingerprint(replay.model) !== modelFingerprint(model)) {
    throw new Error('Post-Bond geometry replay is not deterministic.');
  }
  return { steps: next, model: replay.model };
}
