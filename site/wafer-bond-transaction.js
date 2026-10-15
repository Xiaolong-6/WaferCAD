// Staged Bond transaction boundary. No UI/import gate is lifted by this module.
// The host supplies the existing workspace/History snapshot and rollback owners.
import { CURRENT_PROJECT_VERSION } from './project-schema.js';
import {
  appendWaferToAssembly,
  createBondedAssemblyProject,
  createWaferAssembly,
  validateBondedAssemblyProject,
} from './wafer-assembly.js';

const VIEW_FIELDS = [
  'layout',
  'selectedLayerKeys',
  'activeCell',
  'maskTransform',
  'maskSourceMode',
  'drawMask',
  'maskRoi',
  'maskRoiAnchor',
  'activeFace',
  'roi',
  'roiAnchor',
  'section',
  'planViews',
  'display',
];

function exactProject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNoUnownedPostBondHistory(project) {
  if (
    project.processRecipe != null ||
    (project.snapshots?.length || 0) > 0 ||
    (project.snapshotBranches?.nodes?.length || 0) > 0 ||
    (project.snapshotBranches?.branches?.length || 0) > 0
  ) {
    throw new Error('Bonded product History/Recipe requires a source-aware transaction owner.');
  }
}

/**
 * Pure preflight for an existing standalone wafer or an immutable bonded baseline.
 * Original receiver/donor projects and History remain untouched on any failure.
 */
export function prepareWaferBondTransaction(receiverProject, donorProject, request) {
  if (!receiverProject || !donorProject || !request || typeof request !== 'object') {
    throw new Error('Bond requires receiver, donor and alignment specification.');
  }
  const receiver = structuredClone(receiverProject);
  const donor = structuredClone(donorProject);
  const alreadyBonded = receiver.waferAssembly != null;
  if (alreadyBonded) {
    validateBondedAssemblyProject(receiver);
    assertNoUnownedPostBondHistory(receiver);
  }
  const initial = alreadyBonded
    ? receiver.waferAssembly
    : createWaferAssembly(receiver, request.receiverId ?? 'receiver');
  const { assembly, model, interface: bondInterface } = appendWaferToAssembly(
    initial,
    donor,
    request,
  );
  const project = createBondedAssemblyProject(assembly);

  // Preserve the inspected receiver workspace while keeping pre-bond History
  // and Recipe exclusively in the corresponding immutable source project.
  for (const key of VIEW_FIELDS) {
    if (Object.hasOwn(receiver, key)) project[key] = structuredClone(receiver[key]);
  }
  if (alreadyBonded && receiver.name) project.name = receiver.name;
  project.version = CURRENT_PROJECT_VERSION;
  delete project.snapshots;
  delete project.snapshotBranches;
  delete project.processRecipe;
  validateBondedAssemblyProject(project);

  const bond = assembly.bonds.at(-1);
  return {
    expectedReceiver: receiver,
    project,
    operation: {
      kind: 'bond',
      label: `Bond · ${bond.donorId}`,
      donorId: bond.donorId,
      spec: structuredClone(bond.spec),
      contactAreaUm2: bond.contactAreaUm2,
      donorLayerIds: structuredClone(bond.donorLayerIds),
      // Replay is deliberately not advertised until Process supports Bond.
    },
    model: structuredClone(model),
    interface: structuredClone(bondInterface),
  };
}

function requireCallback(host, name) {
  if (typeof host?.[name] !== 'function') {
    throw new Error(`Bond commit requires host.${name}().`);
  }
}

function synchronousResult(result, name) {
  if (result && typeof result.then === 'function') {
    throw new Error(`Bond ${name} must be synchronous to guarantee atomic rollback.`);
  }
  if (result === false) throw new Error(`Bond ${name} rejected the transaction.`);
}

/**
 * Commit through an existing workspace + History transaction owner.
 * The owner must snapshot *all* state and History/Variant graph in one
 * captureTransaction(), and restore it synchronously on failure.
 * The checkpoint is durable and must succeed before any in-memory mutation.
 */
export async function commitWaferBondTransaction(prepared, host) {
  for (const name of [
    'getCurrentProject',
    'checkpointRecovery',
    'captureTransaction',
    'applyProject',
    'recordOperation',
    'restoreTransaction',
  ]) {
    requireCallback(host, name);
  }
  if (!prepared?.project || !prepared.expectedReceiver || !prepared.operation) {
    throw new Error('Bond preflight candidate is missing.');
  }
  validateBondedAssemblyProject(prepared.project);
  const assertFresh = () => {
    if (!exactProject(host.getCurrentProject(), prepared.expectedReceiver)) {
      throw new Error('Bond receiver changed since preflight; rebuild the candidate.');
    }
  };
  assertFresh();
  if (host.canCommit && !host.canCommit()) {
    throw new Error('Bond commit cancelled before Recovery checkpoint.');
  }
  if ((await host.checkpointRecovery('pre-wafer-bond')) !== true) {
    throw new Error('Bond commit refused: durable Recovery checkpoint was not created.');
  }
  assertFresh();
  if (host.canCommit && !host.canCommit()) {
    throw new Error('Bond commit cancelled; the workspace remains unchanged.');
  }

  // After checkpoint, do not yield to another editor event between apply,
  // History record and rollback. An async host cannot meet this contract.
  const before = host.captureTransaction();
  if (before == null || (before && typeof before.then === 'function')) {
    throw new Error('Bond requires a synchronous complete transaction snapshot.');
  }
  try {
    synchronousResult(host.applyProject(structuredClone(prepared.project)), 'applyProject');
    synchronousResult(host.recordOperation(structuredClone(prepared.operation)), 'recordOperation');
  } catch (error) {
    try {
      const restored = host.restoreTransaction(before);
      if (restored !== true) {
        throw new Error('Host did not confirm complete workspace/History restoration.');
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Bond commit failed and rollback was not confirmed; restore the pre-bond Recovery checkpoint.',
      );
    }
    throw error;
  }
  return { project: structuredClone(prepared.project), operation: structuredClone(prepared.operation) };
}
