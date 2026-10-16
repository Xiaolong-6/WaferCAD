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
import {
  createAssemblyVariantGraph,
  appendAssemblyVariantBond,
  assemblyVariantProject,
  activateAssemblyVariant,
  forkAssemblyVariant,
  setAssemblyVariantCursor,
  validateAssemblyVariantGraph,
  appendAssemblyVariantPostBondStep,
  assemblyVariantPostBondModel,
  setAssemblyVariantPostBondCursor,
} from './wafer-assembly-variants.js';

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
  {
    checkpointRecovery,
    applyVisibleProject,
    getVisibleModel,
    onCommit = () => {},
    variantGraph = null,
    persistVariantGraph = null,
    persistedRevision = 0,
  } = {},
) {
  if (typeof checkpointRecovery !== 'function') {
    throw new Error('Assembly editor requires a durable Recovery checkpoint owner.');
  }
  if (typeof applyVisibleProject !== 'function' || typeof getVisibleModel !== 'function') {
    throw new Error('Assembly editor requires an observable workspace and rollback owner.');
  }
  if (persistVariantGraph != null && typeof persistVariantGraph !== 'function') {
    throw new Error('Assembly editor requires a callable durable graph publisher.');
  }
  if (!Number.isSafeInteger(persistedRevision) || persistedRevision < 0) {
    throw new Error('Invalid Assembly editor durable graph revision.');
  }
  // Index zero may be an independent receiver. Once bonded, this owner
  // handles its entire compact History and every subsequent donor.
  validateProjectFile(initialProduct);
  validateBondedAssemblyProject(initialProduct);
  let graph = variantGraph
    ? structuredClone(validateAssemblyVariantGraph(variantGraph))
    : createAssemblyVariantGraph(initialProduct);
  if (variantGraph && !same(assemblyVariantProject(graph).model, initialProduct.model)) {
    throw new Error('Assembly Variant workspace differs from selected physical project.');
  }
  const activeBranch = graph.branches.find((branch) => branch.id === graph.activeBranchId);
  const graphHead = assemblyVariantProject(graph, graph.activeBranchId, activeBranch.bonds.length);
  let history = graphHead.waferAssembly ? createAssemblyBondHistorySession(graphHead) : null;
  history?.restoreIndex(activeBranch.cursor);
  const fullProduct = () => (history ? history.fullProduct() : assemblyVariantProject(graph));
  const currentProject = () => (history ? history.currentProject() : assemblyVariantProject(graph));
  const currentIndex = () => (history ? history.currentIndex() : 0);
  const maxIndex = () => (history ? history.maxIndex() : 0);
  let committing = false;
  let publishing = false;
  let durableMutation = false;
  let durableRevision = persistedRevision;
  let revision = 0;

  const visibleParity = () => same(getVisibleModel(), currentProject().model);
  const assertReadable = () => {
    if (committing || publishing) throw new Error('Bond transaction is in progress.');
  };

  function restoreIndex(index) {
    assertReadable();
    if (persistVariantGraph && !durableMutation) {
      throw new Error('Assembly cursor navigation requires durable publication.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; navigation refused.');
    const prior = currentIndex();
    if (!history && index !== 0) {
      throw new Error('Bond History navigation is outside the source lineage.');
    }
    const next = history ? history.restoreIndex(index) : assemblyVariantProject(graph);
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
    graph = setAssemblyVariantCursor(graph, index);
    return structuredClone(next);
  }

  function applyVariantProject(next, reason) {
    const previous = currentProject();
    try {
      if (applyVisibleProject(structuredClone(next)) !== true) {
        throw new Error(`Assembly Variant ${reason} was rejected by the workstation.`);
      }
    } catch (error) {
      try {
        if (applyVisibleProject(structuredClone(previous)) !== true) {
          throw new Error('Previous Assembly state was not restored.');
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Assembly Variant update and physical rollback both failed.',
        );
      }
      throw error;
    }
  }

  function createVariant(id, name = '') {
    assertReadable();
    if (persistVariantGraph && !durableMutation) {
      throw new Error('Assembly Variant fork requires durable publication.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; fork refused.');
    const candidate = forkAssemblyVariant(graph, {
      id,
      name,
      atIndex: currentIndex(),
    });
    const project = assemblyVariantProject(candidate);
    if (!same(project.model, currentProject().model)) {
      throw new Error('Assembly Variant fork changed its source geometry.');
    }
    const nextHistory = project.waferAssembly ? createAssemblyBondHistorySession(project) : null;
    applyVariantProject(project, 'fork');
    graph = candidate;
    history = nextHistory;
    revision++;
    return { id, name: candidate.branches.at(-1).name, project: structuredClone(project) };
  }

  function switchVariant(id) {
    assertReadable();
    if (persistVariantGraph && !durableMutation) {
      throw new Error('Assembly Variant switching requires durable publication.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; switch refused.');
    const candidate = activateAssemblyVariant(graph, id);
    const project = assemblyVariantProject(candidate);
    const nextHistory = project.waferAssembly ? createAssemblyBondHistorySession(project) : null;
    applyVariantProject(project, 'switch');
    graph = candidate;
    history = nextHistory;
    revision++;
    return structuredClone(project);
  }

  function captureOwner() {
    return {
      graph: structuredClone(graph),
      index: currentIndex(),
      revision,
    };
  }

  function restoreOwner(snapshot) {
    const restoredGraph = structuredClone(validateAssemblyVariantGraph(snapshot.graph));
    const product = assemblyVariantProject(
      restoredGraph,
      restoredGraph.activeBranchId,
      restoredGraph.branches.find((branch) => branch.id === restoredGraph.activeBranchId).bonds
        .length,
    );
    const restoredHistory = product.waferAssembly
      ? createAssemblyBondHistorySession(product)
      : null;
    restoredHistory?.restoreIndex(snapshot.index);
    const view = restoredHistory ? restoredHistory.currentProject() : product;
    if (applyVisibleProject(structuredClone(view)) !== true) {
      throw new Error('Assembly durable rollback could not restore the physical workspace.');
    }
    graph = restoredGraph;
    history = restoredHistory;
    revision = snapshot.revision;
  }

  async function publishOrRestore(before) {
    if (!persistVariantGraph) return;
    try {
      const result = await persistVariantGraph(structuredClone(graph), durableRevision);
      if (!result || result.revision !== durableRevision + 1) {
        throw new Error('Assembly durable publisher did not confirm the next revision.');
      }
      durableRevision = result.revision;
    } catch (error) {
      try {
        restoreOwner(before);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Assembly Recovery publish failed and workspace rollback was not confirmed.',
        );
      }
      throw error;
    }
  }

  async function durableChange(operation) {
    assertReadable();
    const before = captureOwner();
    durableMutation = true;
    let result;
    try {
      result = operation();
    } finally {
      durableMutation = false;
    }
    publishing = true;
    try {
      await publishOrRestore(before);
      return result;
    } finally {
      publishing = false;
    }
  }

  function postBondPreviewModel() {
    if (currentIndex() !== maxIndex()) return null;
    const active = graph.branches.find((branch) => branch.id === graph.activeBranchId);
    if (!active?.postBondSteps?.length) return null;
    if ((active.postBondCursor ?? active.postBondSteps.length) === 0) return null;
    return assemblyVariantPostBondModel(graph);
  }

  function appendPostBondStep(input) {
    assertReadable();
    if (persistVariantGraph && !durableMutation) {
      throw new Error('Post-Bond Process requires durable Variant publication.');
    }
    if (!visibleParity()) {
      throw new Error('Post-Bond Process workspace material drift; operation refused.');
    }
    const derived = appendAssemblyVariantPostBondStep(graph, input);
    graph = derived.graph;
    revision++;
    // The Workstation's canonical source-bound model stays untouched. The
    // derived Process model is rendered as a presentation-only overlay.
    return { model: structuredClone(derived.model), step: structuredClone(derived.step) };
  }

  function processTimeline() {
    const active = graph.branches.find((branch) => branch.id === graph.activeBranchId);
    const length = active.postBondSteps?.length || 0;
    return {
      index: active.postBondCursor ?? length,
      length,
      available: currentIndex() === maxIndex(),
    };
  }

  function restorePostBondStep(index) {
    assertReadable();
    if (persistVariantGraph && !durableMutation) {
      throw new Error('Post-Bond Process navigation requires durable publication.');
    }
    if (!visibleParity()) {
      throw new Error('Post-Bond Process workspace material drift; navigation refused.');
    }
    const candidate = setAssemblyVariantPostBondCursor(graph, index);
    graph = candidate;
    revision++;
    return postBondPreviewModel();
  }

  async function bond(donorProject, request) {
    assertReadable();
    if (currentIndex() !== maxIndex()) {
      throw new Error('Bond from a historical checkpoint requires an explicit new Variant.');
    }
    if (!visibleParity()) throw new Error('Bond workspace material drift; commit refused.');
    // Preflight first. No IndexedDB writer or UI mutation is needed for bad input.
    const previous = fullProduct();
    const firstStandalone = !previous.waferAssembly && graph.branches.length === 1;
    if (
      !previous.waferAssembly &&
      !firstStandalone &&
      request.receiverId != null &&
      request.receiverId !== graph.sources[0].id
    ) {
      throw new Error('Assembly Variant receiver ID must match its original source identity.');
    }
    const effectiveRequest =
      !previous.waferAssembly && !firstStandalone
        ? { ...request, receiverId: graph.sources[0].id }
        : request;
    const prepared = prepareWaferBondTransaction(previous, donorProject, effectiveRequest);
    const nextGraph = firstStandalone
      ? createAssemblyVariantGraph(prepared.project)
      : appendAssemblyVariantBond(graph, donorProject, effectiveRequest).graph;
    const graphProduct = assemblyVariantProject(nextGraph);
    if (
      !same(graphProduct.model, prepared.project.model) ||
      !same(graphProduct.waferAssembly, prepared.project.waferAssembly)
    ) {
      throw new Error('Bond Variant source registry differs from canonical prepared material.');
    }
    const expectedRevision = revision;
    const beforeDurable = captureOwner();
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
          graph: structuredClone(graph),
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
          graph = nextGraph;
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
          graph = snapshot.graph;
          revision = expectedRevision;
          return true;
        },
      });
      await publishOrRestore(beforeDurable);
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
    listVariants: () =>
      graph.branches.map(({ id, name, parentId, forkIndex, bonds, cursor }) => ({
        id,
        name,
        parentId,
        forkIndex,
        headIndex: bonds.length,
        cursorIndex: cursor,
        active: id === graph.activeBranchId,
      })),
    createVariant,
    switchVariant,
    createVariantDurable: (id, name) => durableChange(() => createVariant(id, name)),
    switchVariantDurable: (id) => durableChange(() => switchVariant(id)),
    restoreIndexDurable: (index) => durableChange(() => restoreIndex(index)),
    appendPostBondStep,
    appendPostBondStepDurable: (input) => durableChange(() => appendPostBondStep(input)),
    restorePostBondStepDurable: (index) => durableChange(() => restorePostBondStep(index)),
    processTimeline,
    postBondPreviewModel,
    durableRevision: () => durableRevision,
    exportVariantGraph: () => structuredClone(graph),
    exportCompactHistory: () => (history ? history.exportCompactHistory() : null),
    restoreIndex,
    undo: () => restoreIndex(Math.max(0, currentIndex() - 1)),
    redo: () => restoreIndex(Math.min(maxIndex(), currentIndex() + 1)),
    isCommitting: () => committing,
  };
}
