// Source-aware transaction owner for incremental Bond editing.
// Only a host capable of *durable* Recovery checkpointing may commit a Bond.
// The canonical product owns source provenance once; History contains pointers.
import {
  prepareWaferBondTransaction,
  commitWaferBondTransaction,
} from './wafer-bond-transaction.js';
import { createAssemblyBondHistorySession } from './wafer-assembly-history-session.js';
import { sameCanonicalModel, validateBondedAssemblyProject } from './wafer-assembly.js';
import { validateProjectFile } from './project-schema.js';

function same(left, right) {
  return sameCanonicalModel(left, right);
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
  // Index zero may be an independent receiver. Once bonded, this owner
  // handles its entire compact History and every subsequent donor.
  validateProjectFile(initialProduct);
  validateBondedAssemblyProject(initialProduct);
  const originalReceiver = structuredClone(initialProduct);
  let history = initialProduct.waferAssembly
    ? createAssemblyBondHistorySession(initialProduct)
    : null;
  const fullProduct = () => (history ? history.fullProduct() : structuredClone(originalReceiver));
  const currentProject = () =>
    history ? history.currentProject() : structuredClone(originalReceiver);
  const currentIndex = () => (history ? history.currentIndex() : 0);
  const maxIndex = () => (history ? history.maxIndex() : 0);
  let committing = false;
  let revision = 0;

  const visibleParity = () => same(getVisibleModel(), currentProject().model);
  const assertReadable = () => {
    if (committing) throw new Error('Bond transaction is in progress.');
  };

  function restoreIndex(index) {
    assertReadable();
    if (!visibleParity()) throw new Error('Bond workspace material drift; navigation refused.');
    const prior = currentIndex();
    if (!history && index !== 0) {
      throw new Error('Bond History navigation is outside the source lineage.');
    }
    const next = history ? history.restoreIndex(index) : structuredClone(originalReceiver);
    try {
      if (applyVisibleProject(structuredClone(next)) === false) {
        throw new Error('Bond stage change rejected by the workstation.');
      }
    } catch (error) {
      history?.restoreIndex(prior);
      try {
        applyVisibleProject(currentProject());
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Bond navigation rollback failed.');
      }
      throw error;
    }
    return structuredClone(next);
  }

  async function bond(donorProject, request) {
    assertReadable();
    if (currentIndex() !== maxIndex()) {
      throw new Error('Bond from a historical checkpoint requires an explicit new Variant.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; commit refused.');
    // Preflight first. No IndexedDB writer or UI mutation is needed for bad input.
    const previous = fullProduct();
    const prepared = prepareWaferBondTransaction(previous, donorProject, request);
    const expectedRevision = revision;
    committing = true;
    try {
      const result = await commitWaferBondTransaction(prepared, {
        getCurrentProject: () => fullProduct(),
        canCommit: () =>
          revision === expectedRevision && currentIndex() === maxIndex() && visibleParity(),
        checkpointRecovery: (reason) => checkpointRecovery(structuredClone(previous), reason),
        captureTransaction: () => ({
          project: fullProduct(),
          index: currentIndex(),
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
          const previousHistory = snapshot.project.waferAssembly
            ? createAssemblyBondHistorySession(snapshot.project)
            : null;
          previousHistory?.restoreIndex(snapshot.index);
          // First-Bond rollback must restore standalone source Recipe/History.
          const restoredProject = previousHistory
            ? previousHistory.currentProject()
            : snapshot.project;
          if (applyVisibleProject(restoredProject) !== true) {
            throw new Error('Bond rollback workspace restoration was not confirmed.');
          }
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
    currentProject,
    fullProduct,
    currentIndex,
    maxIndex,
    listHistory: () => (history ? history.listHistory() : []),
    exportCompactHistory: () => (history ? history.exportCompactHistory() : null),
    restoreIndex,
    undo: () => restoreIndex(Math.max(0, currentIndex() - 1)),
    redo: () => restoreIndex(Math.min(maxIndex(), currentIndex() + 1)),
    isCommitting: () => committing,
  };
}
