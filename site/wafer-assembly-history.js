// Source-aware Bond History checkpoint codec. Each History step stores a small
// immutable reference to a Bond, not another copy of its source projects.
// The ordinary single-wafer snapshotManager must not ingest Assembly state.
import {
  createBondedAssemblyProject,
  replayWaferAssembly,
  validateBondedAssemblyProject,
} from './wafer-assembly.js';
import { validateProjectFile } from './project-schema.js';

function equalCanonical(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function prefixAssembly(assembly, bondIndex) {
  if (!assembly || !Array.isArray(assembly.sources) || !Array.isArray(assembly.bonds)) {
    throw new Error('Bond History requires a complete Assembly lineage.');
  }
  if (!Number.isInteger(bondIndex) || bondIndex < 0 || bondIndex > assembly.bonds.length) {
    throw new Error('Bond History checkpoint is outside the Assembly lineage.');
  }
  return {
    version: assembly.version,
    sources: structuredClone(assembly.sources.slice(0, bondIndex + 1)),
    bonds: structuredClone(assembly.bonds.slice(0, bondIndex)),
  };
}

/**
 * Restore exactly one stage in the immutable source/Bond lineage.
 * Index 0 is the unbonded receiver with its original Recipe and History;
 * indices 1..N are assembled products with independent embedded sources.
 * No mutable state from a later donor can leak into earlier checkpoints.
 */
function checkpointFromValidatedLineage(assembly, bondIndex) {
  const partial = prefixAssembly(assembly, bondIndex);
  if (bondIndex === 0) {
    const receiver = structuredClone(partial.sources[0].project);
    validateProjectFile(receiver);
    return receiver;
  }
  const project = createBondedAssemblyProject(partial);
  validateBondedAssemblyProject(project);
  return project;
}

export function assemblyBondCheckpoint(assembly, bondIndex) {
  // The zero-Bond receiver is only safe if the full donor lineage is valid.
  replayWaferAssembly(assembly);
  return checkpointFromValidatedLineage(assembly, bondIndex);
}

/**
 * Compact, canonical History operation pointer for an Assembly Bond.
 * No donor project, physical model, or source History is copied into a node.
 */
function stepFromValidatedLineage(assembly, bondIndex) {
  if (!Number.isInteger(bondIndex) || bondIndex < 0 || bondIndex > assembly.bonds.length) {
    throw new Error('Bond History checkpoint is outside the Assembly lineage.');
  }
  if (bondIndex === 0) {
    throw new Error('Bond History step 0 is the original receiver, not a Bond.');
  }
  const record = assembly.bonds[bondIndex - 1];
  return {
    kind: 'bond',
    bondIndex,
    donorId: record.donorId,
    label: `Bond · ${record.donorId}`,
    spec: structuredClone(record.spec),
    contactAreaUm2: record.contactAreaUm2,
    donorLayerIds: structuredClone(record.donorLayerIds),
  };
}

export function assemblyBondHistoryStep(assembly, bondIndex) {
  replayWaferAssembly(assembly);
  return stepFromValidatedLineage(assembly, bondIndex);
}

/** Resolve an untrusted saved History pointer against canonical donor sources. */
export function resolveAssemblyBondHistoryStep(project, step) {
  validateBondedAssemblyProject(project);
  const assembly = project.waferAssembly;
  if (!step || step.kind !== 'bond') {
    throw new Error('Bond History pointer must be a Bond operation.');
  }
  const canonical = stepFromValidatedLineage(assembly, step.bondIndex);
  if (!equalCanonical(step, canonical)) {
    throw new Error('Bond History pointer differs from immutable Assembly provenance.');
  }
  return checkpointFromValidatedLineage(assembly, step.bondIndex);
}

/**
 * Replay a compact sequence without losing access to the original receiver
 * and previous donors. The caller can choose any checkpoint for Undo/Redo.
 */
export function assemblyBondHistoryTimeline(project) {
  validateBondedAssemblyProject(project);
  const { waferAssembly } = project;
  return {
    initial: 0,
    head: waferAssembly.bonds.length,
    steps: waferAssembly.bonds.map((_, index) => stepFromValidatedLineage(waferAssembly, index + 1)),
  };
}
