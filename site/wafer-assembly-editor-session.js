// Source-aware transaction owner for incremental Bond editing.
// Only a host capable of *durable* Recovery checkpointing may commit a Bond.
// The canonical product owns source provenance once; History contains pointers.
import { prepareWaferBondTransaction, commitWaferBondTransaction } from './wafer-bond-transaction.js';
import { createAssemblyBondHistorySession } from './wafer-assembly-history-session.js';
import { validateBondedAssemblyProject } from './wafer-assembly.js';

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesRecordedBond(operation, step) {
  return (
    operation?.kind === 'bond' &&
    step?.kind === 'bond' &&
    operation.donorId === step.donorId &&
    same(operation.spec, step.spec) &&
    operation.contactAreaUm2 === step.contactAreaUm2 &&
    same(operation.donorLayerIds, step.donorLayerIds)
  );
}

export function createAssemblyBondEditorSession(
  initialProduct,
  { checkpointRecovery, applyVisibleProject, getVisibleModel, onCommit = () => {} } = {},
) {
  if (typeof checkpointRecovery !== 'function') {
    throw new Error('Assembly editor requires a durable Recovery checkpoint owner.');
  }
  if (typeof applyVisibleProject !== 'function' || typeof getVisibleModel !== 'function') {
    throw new Error('Assembly editor requires an observable workspace and rollback owner.');
  }
  validateBondedAssemblyProject(initialProduct);
  if (!initialProduct?.waferAssembly) {
    throw new Error('Assembly editor requires an existing bonded source lineage.');
  }

  let history = createAssemblyBondHistorySession(initialProduct);
  let committing = false;
  let revision = 0;

  const visibleParity = () => same(getVisibleModel(), history.currentProject().model);
  const assertReadable = () => {
    if (committing) throw new Error('Bond transaction is in progress.');
  };

  function restoreIndex(index) {
    assertReadable();
    if (!visibleParity()) throw new Error('Bond workspace material drift; navigation refused.');
    const prior = history.currentIndex();
    const next = history.restoreIndex(index);
    try {
      if (applyVisibleProject(structuredClone(next)) === false) {
        throw new Error('Bond stage change rejected by the workstation.');
      }
    } catch (error) {
      history.restoreIndex(prior);
      try {
        applyVisibleProject(history.currentProject());
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Bond navigation rollback failed.');
      }
      throw error;
    }
    return structuredClone(next);
  }

  async function bond(donorProject, request) {
    assertReadable();
    if (history.currentIndex() !== history.maxIndex()) {
      throw new Error('Bond from a historical checkpoint requires an explicit new Variant.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; commit refused.');
    // Preflight first. No IndexedDB writer or UI mutation is needed for bad input.
    const previous = history.fullProduct();
    const prepared = prepareWaferBondTransaction(previous, donorProject, request);
    const expectedRevision = revision;
    committing = true;
    try {
      const result = await commitWaferBondTransaction(prepared, {
        getCurrentProject: () => history.fullProduct(),
        canCommit: () =>
          revision === expectedRevision &&
          history.currentIndex() === history.maxIndex() &&
          visibleParity(),
        checkpointRecovery: (reason) => checkpointRecovery(structuredClone(previous), reason),
        captureTransaction: () => ({
          project: history.fullProduct(),
          index: history.currentIndex(),
        }),
        applyProject: (project) => {
          const nextHistory = createAssemblyBondHistorySession(project);
          const nextVisible = nextHistory.currentProject();
          if (applyVisibleProject(structuredClone(nextVisible)) === false) {
            throw new Error('Bond workspace rejected the assembled material.');
          }
          history = nextHistory;
          return true;
        },
        recordOperation: (operation) => {
          const nodes = history.listHistory();
          if (!matchesRecordedBond(operation, nodes.at(-1)?.operation)) {
            throw new Error('Bond History did not record the canonical donor operation.');
          }
          onCommit(structuredClone(operation));
          revision++;
          return true;
        },
        restoreTransaction: (snapshot) => {
          const previousHistory = createAssemblyBondHistorySession(snapshot.project);
          previousHistory.restoreIndex(snapshot.index);
          // Restore the exact source-owned timeline even if the failed host
          // changed the current physical view before throwing.
          applyVisibleProject(previousHistory.currentProject());
          history = previousHistory;
          revision = expectedRevision;
          return true;
        },
      });
      return result;
    } finally {
      committing = false;
    }
  }

  return {
    bond,
    currentProject: () => history.currentProject(),
    fullProduct: () => history.fullProduct(),
    currentIndex: () => history.currentIndex(),
    maxIndex: () => history.maxIndex(),
    listHistory: () => history.listHistory(),
    exportCompactHistory: () => history.exportCompactHistory(),
    restoreIndex,
    undo: () => restoreIndex(Math.max(0, history.currentIndex() - 1)),
    redo: () => restoreIndex(Math.min(history.maxIndex(), history.currentIndex() + 1)),
    isCommitting: () => committing,
  };
}
