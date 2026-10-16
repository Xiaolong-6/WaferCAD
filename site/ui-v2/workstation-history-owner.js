// Exactly one writable History authority per Workstation project.
// Assembly products have a source-aware transaction owner and must never
// instantiate the ordinary single-wafer SnapshotManager, even in preview.
import { createSnapshotManager } from '../workspace-snapshots.js';

export function createWorkstationHistoryOwner({ assemblyWorkspace = false, ...options } = {}) {
  if (!assemblyWorkspace) return createSnapshotManager(options);

  const refuse = (operation) => {
    throw new Error(
      `Generic Workstation History ${operation} is forbidden for a multi-wafer Assembly.`,
    );
  };
  const emptyImport = (records, branchState = null) => {
    if (!Array.isArray(records) || records.length !== 0 || branchState != null) {
      refuse('import');
    }
    return 0;
  };
  // Only read-only compatibility queries are exposed to the generic UI.
  // All Bond / post-Bond edits, cursor moves, variants and Recovery remain
  // exclusively under createAssemblyBondEditorSession's durable owner.
  const reads = Object.freeze({
    mode: 'assembly-isolated',
    list: () => [],
    listHistory: () => [],
    listBranches: () => [],
    activeBranch: () => null,
    continuationContext: () => null,
    currentPosition: () => ({
      branchId: null,
      nodeId: null,
      bookmarkId: null,
      atHead: true,
    }),
    readProcessNodeState: () => null,
    hasHistoricalWorkingEdits: () => false,
    canRecordOperation: () => false,
    canCreateVariant: () => false,
    validateHeadState: () => false,
    syncActiveHeadState: () => true,
    syncActiveHeadStateAsync: async () => true,
    exportRecords: () => [],
    exportBranchState: () => null,
    exportForWorkerStorage: () => null,
    importRecords: emptyImport,
    importRecordsAsync: async () => refuse('async import'),
  });
  return new Proxy(reads, {
    get(target, key, receiver) {
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      if (typeof key !== 'string') return undefined;
      return () => refuse(key);
    },
  });
}
