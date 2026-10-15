// Standalone Assembly lineage / replay contract.
// Not yet a live .wafercad schema field or a user-visible Process operation.
import { migrateProjectFile, validateProjectFile } from './project-schema.js';
import { bondWaferModels } from './wafer-bonding.js';

export const WAFER_ASSEMBLY_VERSION = 1;
export const MAX_ASSEMBLY_WAFERS = 8;
export const MAX_ASSEMBLY_SOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_ASSEMBLY_TOTAL_BYTES = 64 * 1024 * 1024;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function checkId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('Assembly wafer ID must be 1–64 safe ASCII characters.');
  }
  return id;
}

function byteLength(value) {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new Error('Assembly source is not serializable.');
  return new TextEncoder().encode(json).byteLength;
}

function sourceFromProject(id, input) {
  checkId(id);
  if (input?.waferAssembly != null || input?.assembly != null) {
    throw new Error('Assembly sources must be independent projects, not nested assemblies.');
  }
  // Migration/validation are performed on a clone; imported source project
  // History, Recipe, Mask and Main structure remain fully inspectable.
  const project = validateProjectFile(migrateProjectFile(input));
  const bytes = byteLength(project);
  if (bytes > MAX_ASSEMBLY_SOURCE_BYTES) {
    throw new Error('Assembly source project exceeds 16 MiB; it cannot be embedded safely.');
  }
  return { id, bytes, project: structuredClone(project) };
}

function verifySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > MAX_ASSEMBLY_WAFERS) {
    throw new Error('Assembly must contain 1–8 independently processed source wafers.');
  }
  let total = 0;
  const seen = new Set();
  for (const source of sources) {
    if (!source || typeof source !== 'object') throw new Error('Invalid Assembly source.');
    checkId(source.id);
    if (seen.has(source.id)) throw new Error('Duplicate Assembly source wafer ID.');
    seen.add(source.id);
    if (source.project?.waferAssembly != null || source.project?.assembly != null) {
      throw new Error('Nested Assembly project source is unsupported.');
    }
    validateProjectFile(source.project);
    const bytes = byteLength(source.project);
    if (bytes !== source.bytes || bytes > MAX_ASSEMBLY_SOURCE_BYTES) {
      throw new Error('Assembly source size/provenance record is invalid.');
    }
    total += bytes;
    if (total > MAX_ASSEMBLY_TOTAL_BYTES) {
      throw new Error('Assembly embedded source projects exceed 64 MiB.');
    }
  }
}

function validateRecord(assembly) {
  if (!assembly || typeof assembly !== 'object' || Array.isArray(assembly)) {
    throw new Error('Invalid Assembly record.');
  }
  if (assembly.version !== WAFER_ASSEMBLY_VERSION) {
    throw new Error('Unsupported Assembly version.');
  }
  verifySources(assembly.sources);
  if (!Array.isArray(assembly.bonds) || assembly.bonds.length !== assembly.sources.length - 1) {
    throw new Error('Assembly requires exactly one ordered Bond for each additional wafer.');
  }
  for (let i = 0; i < assembly.bonds.length; i++) {
    const record = assembly.bonds[i];
    if (!record || record.donorId !== assembly.sources[i + 1].id) {
      throw new Error('Assembly Bond source order is invalid.');
    }
    if (!record.spec || typeof record.spec !== 'object') {
      throw new Error('Assembly Bond spec is missing.');
    }
    if (record.spec.donorId !== record.donorId) {
      throw new Error('Assembly Bond donor ID mismatch.');
    }
    if (!Number.isFinite(record.contactAreaUm2) || !(record.contactAreaUm2 > 0)) {
      throw new Error('Assembly Bond contact area is invalid.');
    }
  }
}

/** Create an independent source lineage; no live workspace mutation. */
export function createWaferAssembly(sourceProject, receiverId = 'receiver') {
  return {
    version: WAFER_ASSEMBLY_VERSION,
    sources: [sourceFromProject(receiverId, sourceProject)],
    bonds: [],
  };
}

/** Deterministically reconstruct assembled material from immutable source projects. */
export function replayWaferAssembly(assembly) {
  validateRecord(assembly);
  let model = structuredClone(assembly.sources[0].project.model);
  for (let i = 0; i < assembly.bonds.length; i++) {
    const record = assembly.bonds[i];
    const donor = assembly.sources[i + 1];
    const output = bondWaferModels(model, donor.project.model, record.spec);
    if (
      output.interface.contactAreaUm2 !== record.contactAreaUm2 ||
      JSON.stringify(output.donorLayerIds) !== JSON.stringify(record.donorLayerIds)
    ) {
      throw new Error('Assembly Bond replay differs from recorded material provenance.');
    }
    model = output.model;
  }
  return model;
}

/**
 * Prepare an additional donor and replay the whole lineage. On any failure
 * original Assembly, donor project and the live model remain unchanged.
 * No History or Recovery commit is made by this module.
 */
export function appendWaferToAssembly(assembly, donorProject, request) {
  validateRecord(assembly);
  if (!request || typeof request !== 'object') throw new Error('Assembly Bond spec is required.');
  const donorId = checkId(request.donorId);
  if (assembly.sources.some((source) => source.id === donorId)) {
    throw new Error('Duplicate Assembly source wafer ID.');
  }
  if (assembly.sources.length >= MAX_ASSEMBLY_WAFERS) {
    throw new Error('Assembly exceeds the eight-wafer limit.');
  }
  const prior = replayWaferAssembly(assembly);
  const incoming = sourceFromProject(donorId, donorProject);
  const spec = {
    receiverFace: request.receiverFace ?? 'front',
    donorFace: request.donorFace ?? 'front',
    dx: request.dx ?? 0,
    dy: request.dy ?? 0,
    rotationDeg: request.rotationDeg ?? 0,
    flipAxis: request.flipAxis ?? 'x',
    donorId,
    method: 'direct',
    gapUm: 0,
  };
  if (request.method != null && request.method !== 'direct') {
    throw new Error('Assembly supports only direct bonding.');
  }
  if (request.gapUm != null && request.gapUm !== 0) {
    throw new Error('Assembly direct bond requires zero gap.');
  }
  const result = bondWaferModels(prior, incoming.project.model, spec);
  const next = structuredClone(assembly);
  next.sources.push(incoming);
  next.bonds.push({
    donorId,
    spec,
    contactAreaUm2: result.interface.contactAreaUm2,
    donorLayerIds: structuredClone(result.donorLayerIds),
  });
  verifySources(next.sources);
  validateRecord(next);
  return { assembly: next, model: result.model, interface: result.interface };
}
