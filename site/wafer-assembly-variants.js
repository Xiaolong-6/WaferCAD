// Canonical source registry for Bond Variants. A wafer source is stored
// once; each Variant stores only source references and direct-Bond records.
// This codec is independent of the v15 .wafercad product schema. It must not
// be attached to root snapshots or used as an undocumented project field.
import {
  createWaferAssembly,
  createBondedAssemblyProject,
  validateBondedAssemblyProject,
  WAFER_ASSEMBLY_VERSION,
  MAX_ASSEMBLY_TOTAL_BYTES,
  sameCanonicalModel,
} from './wafer-assembly.js';
import { prepareWaferBondTransaction } from './wafer-bond-transaction.js';
import { validateProjectFile } from './project-schema.js';
import {
  appendPostBondGeometryStep,
  replayPostBondGeometry,
} from './wafer-assembly-postbond-process.js';

export const ASSEMBLY_VARIANTS_VERSION = 2;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function requireIndex(value, length, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= length) {
    throw new Error(`Invalid Assembly Variant ${field} source reference.`);
  }
}

function assertPlain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid Assembly Variant ${label}.`);
  }
}

function sourceAndBonds(graph, branch, index) {
  if (!Number.isInteger(index) || index < 0 || index > branch.bonds.length) {
    throw new Error('Assembly Variant Bond cursor is outside the lineage.');
  }
  const sources = branch.sourceRefs.slice(0, index + 1).map((ref) => {
    requireIndex(ref, graph.sources.length, 'branch');
    return structuredClone(graph.sources[ref]);
  });
  const bonds = structuredClone(branch.bonds.slice(0, index));
  return { version: WAFER_ASSEMBLY_VERSION, sources, bonds };
}

function materialize(graph, branch, index) {
  const assembly = sourceAndBonds(graph, branch, index);
  if (index === 0) {
    return structuredClone(assembly.sources[0].project);
  }
  return createBondedAssemblyProject(assembly);
}

export function validateAssemblyVariantGraph(graph) {
  assertPlain(graph, 'graph');
  if (graph.version !== 1 && graph.version !== ASSEMBLY_VARIANTS_VERSION) {
    throw new Error('Unsupported Assembly Variant graph version.');
  }
  if (!Array.isArray(graph.sources) || !graph.sources.length || graph.sources.length > 64) {
    throw new Error('Assembly Variant source registry must contain 1–64 sources.');
  }
  if (!Array.isArray(graph.branches) || !graph.branches.length || graph.branches.length > 32) {
    throw new Error('Assembly Variant graph must contain 1–32 branches.');
  }
  const sourceIDs = new Set();
  let totalSourceBytes = 0;
  for (const source of graph.sources) {
    assertPlain(source, 'source');
    if (typeof source.id !== 'string' || !ID_PATTERN.test(source.id)) {
      throw new Error('Invalid Assembly Variant source identity.');
    }
    if (!Number.isInteger(source.bytes) || source.bytes < 0) {
      throw new Error('Invalid Assembly Variant source byte provenance.');
    }
    validateProjectFile(source.project);
    if (source.project.waferAssembly != null) {
      throw new Error('Assembly Variant source must be an independent wafer.');
    }
    const bytes = new TextEncoder().encode(JSON.stringify(source.project)).byteLength;
    if (source.bytes !== bytes) {
      throw new Error('Assembly Variant source byte provenance mismatch.');
    }
    totalSourceBytes += bytes;
    if (totalSourceBytes > MAX_ASSEMBLY_TOTAL_BYTES) {
      throw new Error('Assembly Variant registry exceeds the shared 64 MiB source limit.');
    }
    const identity = JSON.stringify(source);
    if (sourceIDs.has(identity)) {
      throw new Error('Duplicate Assembly Variant registry source.');
    }
    sourceIDs.add(identity);
  }
  const branchIds = new Set();
  for (const branch of graph.branches) {
    assertPlain(branch, 'branch');
    if (typeof branch.id !== 'string' || !ID_PATTERN.test(branch.id) || branchIds.has(branch.id)) {
      throw new Error('Invalid or duplicate Assembly Variant branch identity.');
    }
    branchIds.add(branch.id);
    if (
      !Array.isArray(branch.sourceRefs) ||
      !Array.isArray(branch.bonds) ||
      branch.sourceRefs.length !== branch.bonds.length + 1 ||
      branch.sourceRefs.length > 8
    ) {
      throw new Error('Assembly Variant source references and Bond count disagree.');
    }
    if (
      branch.sourceRefs[0] !== 0 ||
      new Set(branch.sourceRefs).size !== branch.sourceRefs.length
    ) {
      throw new Error('Assembly Variant lineage must use a unique, shared receiver source.');
    }
    if (
      !Number.isInteger(branch.cursor) ||
      branch.cursor < 0 ||
      branch.cursor > branch.bonds.length
    ) {
      throw new Error('Assembly Variant cursor is outside its Bond lineage.');
    }
    for (const ref of branch.sourceRefs) requireIndex(ref, graph.sources.length, 'lineage');
    if (
      !Number.isInteger(branch.forkIndex) ||
      branch.forkIndex < 0 ||
      branch.forkIndex > branch.bonds.length
    ) {
      throw new Error('Invalid Assembly Variant fork index.');
    }
    if (
      branch.parentId != null &&
      (typeof branch.parentId !== 'string' || branch.parentId === branch.id)
    ) {
      throw new Error('Invalid Assembly Variant parent reference.');
    }
    const baseline = materialize(graph, branch, branch.bonds.length); // strict Bond replay
    if (branch.postBondSteps !== undefined) {
      if (!Array.isArray(branch.postBondSteps)) {
        throw new Error('Invalid source-aware post-Bond Recipe record.');
      }
      if (graph.version === 1 && branch.postBondSteps.length) {
        throw new Error('Post-Bond geometry requires Assembly Variant format v2.');
      }
      if (branch.postBondSteps.length > 0 && branch.bonds.length < 1) {
        throw new Error('Post-Bond Recipe requires at least one canonical Bond.');
      }
      if (
        branch.postBondCursor !== undefined &&
        (!Number.isSafeInteger(branch.postBondCursor) ||
          branch.postBondCursor < 0 ||
          branch.postBondCursor > branch.postBondSteps.length)
      ) {
        throw new Error('Post-Bond Process cursor is outside its Recipe timeline.');
      }
      if (branch.postBondSteps.length) replayPostBondGeometry(baseline, branch.postBondSteps);
    }
  }
  if (graph.branches[0].id !== 'main' || graph.branches[0].parentId != null) {
    throw new Error('Assembly Variant graph must have a root Main branch.');
  }
  for (const branch of graph.branches) {
    if (branch.parentId === null && branch.forkProcessIndex !== undefined) {
      throw new Error('Root Assembly Variant cannot contain a Process fork checkpoint.');
    }
    if (branch.parentId != null) {
      const parent = graph.branches.find((candidate) => candidate.id === branch.parentId);
      if (!parent || parent === branch || branch.forkIndex > parent.bonds.length) {
        throw new Error('Assembly Variant parent branch or fork index is invalid.');
      }
      if (
        JSON.stringify(branch.sourceRefs.slice(0, branch.forkIndex + 1)) !==
          JSON.stringify(parent.sourceRefs.slice(0, branch.forkIndex + 1)) ||
        JSON.stringify(branch.bonds.slice(0, branch.forkIndex)) !==
          JSON.stringify(parent.bonds.slice(0, branch.forkIndex))
      ) {
        throw new Error('Assembly Variant fork must retain its immutable parent Bond prefix.');
      }
      if (branch.forkProcessIndex !== undefined) {
        const index = branch.forkProcessIndex;
        const parentSteps = parent.postBondSteps || [];
        const steps = branch.postBondSteps || [];
        if (
          graph.version !== ASSEMBLY_VARIANTS_VERSION ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= parentSteps.length ||
          index > steps.length ||
          branch.forkIndex !== parent.bonds.length ||
          branch.bonds.length !== parent.bonds.length
        ) {
          throw new Error('Invalid Assembly Variant Process fork checkpoint.');
        }
        if (
          JSON.stringify(steps.slice(0, index)) !== JSON.stringify(parentSteps.slice(0, index))
        ) {
          throw new Error('Assembly Variant fork must retain immutable parent Process prefix.');
        }
      }
    }
  }
  // Cyclic parent metadata is not a valid branch topology even when the
  // physical source prefixes happen to match.
  for (const branch of graph.branches) {
    const seen = new Set();
    let candidate = branch;
    while (candidate?.parentId != null) {
      if (seen.has(candidate.id)) {
        throw new Error('Assembly Variant parent graph contains a cycle.');
      }
      seen.add(candidate.id);
      candidate = graph.branches.find((item) => item.id === candidate.parentId);
    }
  }
  if (!branchIds.has(graph.activeBranchId)) {
    throw new Error('Assembly Variant active branch does not exist.');
  }
  // An active source registry must be bound to its actual parent lineage; do
  // not allow orphan donors that would be silently dropped during export.
  const used = new Set(graph.branches.flatMap((branch) => branch.sourceRefs));
  if (used.size !== graph.sources.length) {
    throw new Error('Assembly Variant source registry contains orphaned provenance.');
  }
  return graph;
}

export function createAssemblyVariantGraph(product) {
  validateProjectFile(product);
  validateBondedAssemblyProject(product);
  const source = product.waferAssembly ?? createWaferAssembly(product, 'receiver');
  const graph = {
    version: ASSEMBLY_VARIANTS_VERSION,
    sources: structuredClone(source.sources),
    activeBranchId: 'main',
    branches: [
      {
        id: 'main',
        name: 'Main',
        parentId: null,
        forkIndex: 0,
        sourceRefs: source.sources.map((_, index) => index),
        bonds: structuredClone(source.bonds),
        postBondSteps: [],
        postBondCursor: 0,
        cursor: source.bonds.length,
      },
    ],
  };
  validateAssemblyVariantGraph(graph);
  return graph;
}

export function assemblyVariantProject(graph, branchId = graph?.activeBranchId, cursor = null) {
  validateAssemblyVariantGraph(graph);
  const branch = graph.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error('Assembly Variant branch does not exist.');
  return materialize(graph, branch, cursor ?? branch.cursor);
}

export function setAssemblyVariantCursor(graph, index, branchId = graph?.activeBranchId) {
  validateAssemblyVariantGraph(graph);
  const next = structuredClone(graph);
  const branch = next.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error('Assembly Variant branch does not exist.');
  if (!Number.isInteger(index) || index < 0 || index > branch.bonds.length) {
    throw new Error('Assembly Variant cursor is outside its Bond lineage.');
  }
  branch.cursor = index;
  validateAssemblyVariantGraph(next);
  return next;
}

export function forkAssemblyVariant(graph, { id, name, atIndex } = {}) {
  validateAssemblyVariantGraph(graph);
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || graph.branches.some((b) => b.id === id)) {
    throw new Error('Assembly Variant requires a unique, valid branch ID.');
  }
  const active = graph.branches.find((branch) => branch.id === graph.activeBranchId);
  const index = atIndex ?? active.cursor;
  if (!Number.isInteger(index) || index < 0 || index >= active.bonds.length) {
    throw new Error('Assembly Variant fork requires a historical Bond checkpoint.');
  }
  const next = structuredClone(graph);
  next.branches.push({
    id,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : id,
    parentId: active.id,
    forkIndex: index,
    sourceRefs: active.sourceRefs.slice(0, index + 1),
    bonds: active.bonds.slice(0, index),
    postBondSteps: [],
    postBondCursor: 0,
    cursor: index,
  });
  next.activeBranchId = id;
  validateAssemblyVariantGraph(next);
  return next;
}

/**
 * Fork an independent Process continuation at an undone Recipe stage.
 * The shared wafer source pool, complete Bond lineage and the selected
 * immutable Process prefix remain unchanged. Only future steps diverge.
 */
export function forkAssemblyProcessVariant(graph, { id, name, atProcessIndex } = {}) {
  validateAssemblyVariantGraph(graph);
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || graph.branches.some((b) => b.id === id)) {
    throw new Error('Assembly Process Variant requires a unique, valid branch ID.');
  }
  const active = graph.branches.find((branch) => branch.id === graph.activeBranchId);
  const stages = active.postBondSteps || [];
  const index = atProcessIndex ?? active.postBondCursor ?? stages.length;
  if (active.cursor !== active.bonds.length || active.bonds.length === 0) {
    throw new Error('Assembly Process Variant fork requires a completed Bond HEAD.');
  }
  if (!Number.isSafeInteger(index) || index < 0 || index >= stages.length) {
    throw new Error('Assembly Process Variant fork requires a historical Process checkpoint.');
  }
  const next = structuredClone(graph);
  next.version = ASSEMBLY_VARIANTS_VERSION;
  next.branches.push({
    id,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : id,
    parentId: active.id,
    forkIndex: active.bonds.length,
    forkProcessIndex: index,
    sourceRefs: structuredClone(active.sourceRefs),
    bonds: structuredClone(active.bonds),
    postBondSteps: structuredClone(stages.slice(0, index)),
    postBondCursor: index,
    cursor: active.bonds.length,
  });
  next.activeBranchId = id;
  validateAssemblyVariantGraph(next);
  return next;
}

export function activateAssemblyVariant(graph, branchId) {
  validateAssemblyVariantGraph(graph);
  const branch = graph.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error('Assembly Variant branch does not exist.');
  const next = structuredClone(graph);
  next.activeBranchId = branchId;
  next.branches.find((item) => item.id === branchId).cursor = branch.bonds.length;
  validateAssemblyVariantGraph(next);
  return next;
}

export function appendAssemblyVariantBond(graph, donorProject, request) {
  validateAssemblyVariantGraph(graph);
  const active = graph.branches.find((b) => b.id === graph.activeBranchId);
  if (active.cursor !== active.bonds.length) {
    throw new Error('Bond from a historical checkpoint requires an explicit new Variant.');
  }
  if (active.postBondSteps?.length || active.forkProcessIndex !== undefined) {
    throw new Error(
      'Further Bond after post-Bond Process requires a source-aware continuation boundary.',
    );
  }
  const receiver = materialize(graph, active, active.bonds.length);
  const prepared = prepareWaferBondTransaction(receiver, donorProject, request);
  const appended = prepared.project.waferAssembly;
  const donor = appended.sources.at(-1);
  const record = appended.bonds.at(-1);
  const next = structuredClone(graph);
  let ref = next.sources.findIndex((source) => JSON.stringify(source) === JSON.stringify(donor));
  if (ref < 0) {
    ref = next.sources.length;
    next.sources.push(structuredClone(donor));
  }
  const target = next.branches.find((b) => b.id === graph.activeBranchId);
  target.sourceRefs.push(ref);
  target.bonds.push(structuredClone(record));
  target.cursor = target.bonds.length;
  validateAssemblyVariantGraph(next);
  const project = materialize(next, target, target.cursor);
  if (!sameCanonicalModel(project.model, prepared.project.model)) {
    throw new Error('Assembly Variant commit failed deterministic model parity.');
  }
  return { graph: next, project, operation: prepared.operation };
}

/**
 * Replay a derived post-Bond Process model for the active or selected Variant.
 * Only the Model returned here is processed; the portable v15 source Assembly
 * remains canonical and unchanged. Historical Bond checkpoints show baseline
 * geometry until their full Bond HEAD is active.
 */
export function assemblyVariantPostBondModel(graph, branchId = graph?.activeBranchId) {
  validateAssemblyVariantGraph(graph);
  const branch = graph.branches.find((entry) => entry.id === branchId);
  if (!branch) throw new Error('Post-Bond Variant branch does not exist.');
  const baseline = materialize(graph, branch, branch.bonds.length);
  const steps = branch.postBondSteps || [];
  const index = branch.postBondCursor ?? steps.length;
  return replayPostBondGeometry(baseline, steps.slice(0, index)).model;
}

export function appendAssemblyVariantPostBondStep(graph, recipeStep) {
  validateAssemblyVariantGraph(graph);
  const branch = graph.branches.find((entry) => entry.id === graph.activeBranchId);
  if (!branch || branch.bonds.length < 1 || branch.cursor !== branch.bonds.length) {
    throw new Error('Post-Bond Process requires a completed Bond Variant HEAD.');
  }
  const steps = branch.postBondSteps || [];
  if ((branch.postBondCursor ?? steps.length) !== steps.length) {
    throw new Error('Post-Bond Process from historical Recipe requires a new Variant.');
  }
  const base = materialize(graph, branch, branch.bonds.length);
  const result = appendPostBondGeometryStep(base, steps, recipeStep);
  const next = structuredClone(graph);
  next.version = ASSEMBLY_VARIANTS_VERSION;
  const target = next.branches.find((entry) => entry.id === graph.activeBranchId);
  target.postBondSteps = result.steps;
  target.postBondCursor = result.steps.length;
  validateAssemblyVariantGraph(next);
  if (!sameCanonicalModel(assemblyVariantPostBondModel(next), result.model)) {
    throw new Error('Post-Bond Variant replay changed its final material.');
  }
  return { graph: next, model: result.model, step: result.steps.at(-1) };
}

/**
 * Move the Process-only History cursor without truncating its Recipe HEAD.
 * The active Variant's original Bond stages and source projects stay intact.
 * Older v2 sidecars without a cursor are interpreted at the Recipe HEAD.
 */
export function setAssemblyVariantPostBondCursor(graph, index) {
  validateAssemblyVariantGraph(graph);
  const current = graph.branches.find((branch) => branch.id === graph.activeBranchId);
  const length = current.postBondSteps?.length || 0;
  if (current.cursor !== current.bonds.length) {
    throw new Error('Post-Bond Process navigation requires the completed Bond HEAD.');
  }
  if (!Number.isSafeInteger(index) || index < 0 || index > length) {
    throw new Error('Post-Bond Process cursor is outside its Recipe timeline.');
  }
  const next = structuredClone(graph);
  next.version = ASSEMBLY_VARIANTS_VERSION;
  next.branches.find((branch) => branch.id === graph.activeBranchId).postBondCursor = index;
  validateAssemblyVariantGraph(next);
  return next;
}
