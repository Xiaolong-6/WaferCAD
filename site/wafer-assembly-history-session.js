// Read-only Bond navigation using the existing History/Variant graph engine.
// Snapshot states contain only an immutable Bond index and process revision.
// The full donor source lineage remains owned by one canonical v15 product.
import { createSnapshotManager } from './workspace-snapshots.js';
import { validateBondedAssemblyProject } from './wafer-assembly.js';
import {
  assemblyBondCheckpoint,
  assemblyBondHistoryTimeline,
} from './wafer-assembly-history.js';

export function createAssemblyBondHistorySession(inputProject, options = {}) {
  validateBondedAssemblyProject(inputProject);
  if (!inputProject?.waferAssembly) {
    throw new Error('Bond History session requires an assembled v15 project.');
  }
  const canonicalProduct = structuredClone(inputProject);
  const timeline = assemblyBondHistoryTimeline(canonicalProduct);
  let cursorIndex = 0;
  let visibleProject = assemblyBondCheckpoint(canonicalProduct.waferAssembly, 0);
  const validPointer = (state) =>
    Number.isInteger(state?.assemblyBondIndex) &&
    state.assemblyBondIndex >= 0 &&
    state.assemblyBondIndex <= timeline.head &&
    state?.model?.processRevision === state.assemblyBondIndex &&
    Object.keys(state).length === 2 &&
    Object.keys(state.model).length === 1;

  const snapshotManager = createSnapshotManager({
    capture: () => ({
      assemblyBondIndex: cursorIndex,
      model: { processRevision: cursorIndex },
    }),
    restore: (state) => {
      if (!validPointer(state)) {
        throw new Error('Invalid source-bound Bond History state.');
      }
      const restored = assemblyBondCheckpoint(
        canonicalProduct.waferAssembly,
        state.assemblyBondIndex,
      );
      cursorIndex = state.assemblyBondIndex;
      visibleProject = restored;
    },
    validateState: validPointer,
    validateStates: (states) => states.every(validPointer),
    ...(options.now ? { now: options.now } : {}),
    ...(options.idFactory ? { idFactory: options.idFactory } : {}),
    ...(options.nodeIdFactory ? { nodeIdFactory: options.nodeIdFactory } : {}),
  });

  const receiverBookmark = snapshotManager.create('Receiver · Before Bond');
  const nodeIds = [];
  for (const operation of timeline.steps) {
    // Prepare the full physical stage before publishing its compact node.
    const nextProject = assemblyBondCheckpoint(
      canonicalProduct.waferAssembly,
      operation.bondIndex,
    );
    const previousIndex = cursorIndex;
    const previousProject = visibleProject;
    cursorIndex = operation.bondIndex;
    visibleProject = nextProject;
    try {
      nodeIds.push(snapshotManager.recordOperation(operation).id);
    } catch (error) {
      cursorIndex = previousIndex;
      visibleProject = previousProject;
      throw error;
    }
  }

  function restoreIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index > timeline.head) {
      throw new Error('Bond History navigation is outside the source lineage.');
    }
    const restored =
      index === 0
        ? snapshotManager.restore(receiverBookmark.id)
        : snapshotManager.restoreProcessNode(nodeIds[index - 1]);
    if (!restored) throw new Error('Bond History restoration failed validation.');
    return structuredClone(visibleProject);
  }

  return {
    currentIndex: () => cursorIndex,
    maxIndex: () => timeline.head,
    currentProject: () => structuredClone(visibleProject),
    fullProduct: () => structuredClone(canonicalProduct),
    listHistory: () => snapshotManager.listHistory(),
    listVariants: () => snapshotManager.listBranches(),
    undo: () => restoreIndex(Math.max(0, cursorIndex - 1)),
    redo: () => restoreIndex(Math.min(timeline.head, cursorIndex + 1)),
    restoreIndex,
    exportCompactHistory: () => ({
      records: snapshotManager.exportRecords(),
      branchState: snapshotManager.exportBranchState(),
    }),
  };
}
