export function createHistoryMutationController({
  snapshotManager,
  getProcessPanelController = () => null,
  confirmationDialog,
  checkpointWorkspace = async () => {},
  refreshAfterHistoricalLoad = () => {},
  markProjectDirty = () => {},
  renderSnapshots = () => {},
  openProcessPanel = () => {},
  updateOperationUI = () => {},
  captureReplayTransaction = () => null,
  restoreReplayTransaction = () => false,
  beginReplayInteraction = () => {},
  endReplayInteraction = () => {},
  status = () => {},
}) {
  let pendingEdit = null,
    pendingInsert = null;

  function cancelEdit() {
    pendingEdit = null;
  }

  function cancelInsert() {
    pendingInsert = null;
  }

  function currentInsert() {
    if (!pendingInsert) return null;
    const {
      nodeId,
      branchId,
      branchName,
      parentNodeId,
      mode,
      originalLabel,
      laterStepCount,
    } = pendingInsert;
    return {
      nodeId,
      branchId,
      branchName,
      parentNodeId,
      mode,
      originalLabel,
      laterStepCount,
    };
  }

  function currentEdit() {
    if (!pendingEdit) return null;
    const {
      nodeId,
      branchId,
      branchName,
      parentNodeId,
      mode,
      originalLabel,
      downstreamCount,
    } = pendingEdit;
    return {
      nodeId,
      branchId,
      branchName,
      parentNodeId,
      mode,
      originalLabel,
      downstreamCount,
    };
  }

  async function beginEdit(node) {
    const context = snapshotManager.stepEditContext(node?.id, { includeReplayStates: true }),
      processPanelController = getProcessPanelController();
    if (!context?.editable) {
      status(context?.reason || 'This Step cannot be edited from History.', 'warning');
      return false;
    }
    if (!node?.replayable || !processPanelController?.canReplayOperation(node.operation)) {
      status(
        'This Step predates replay metadata. Restore it or create a Variant from here instead.',
        'warning',
      );
      return false;
    }

    await checkpointWorkspace('pre-history-step-edit');
    const transaction = captureReplayTransaction(),
      restored = snapshotManager.restoreStepInput(node.id);
    if (!restored) {
      status('Could not restore the input state for this Step.', 'error');
      return false;
    }

    pendingEdit = {
      nodeId: node.id,
      branchId: context.branchId,
      branchName: context.branchName,
      parentNodeId: context.parentNodeId,
      mode: null,
      originalLabel:
        node.displayLabel || node.operation?.label || node.operation?.kind || 'Process step',
      downstreamCount: context.downstreamCount,
      downstreamReplayable: context.downstreamReplayable,
      canReplaceCurrentVariant: context.canReplaceCurrentVariant,
      dependentVariants: context.dependentVariants.map((item) => ({ ...item })),
      downstream: context.downstream.map((item) => structuredClone(item)),
      transaction,
    };

    refreshAfterHistoricalLoad();
    if (!processPanelController.loadOperationForEdit(node.operation)) {
      pendingEdit = null;
      snapshotManager.restoreActiveBranchHead();
      refreshAfterHistoricalLoad();
      status('This Step cannot be loaded into the current Process editor.', 'error');
      return false;
    }

    markProjectDirty();
    renderSnapshots();
    openProcessPanel();
    updateOperationUI();
    status(
      `Editing "${pendingEdit.originalLabel}". Change the Process parameters, then choose Save edited Step.`,
      'success',
    );
    return true;
  }

  async function beginInsert(node) {
    const context = snapshotManager.insertBeforeContext(node?.id, {
        includeReplayStates: true,
      }),
      processPanelController = getProcessPanelController();
    if (!context?.editable) {
      status(context?.reason || 'This Step cannot accept an inserted predecessor Step.', 'warning');
      return false;
    }

    const currentLabel =
        node.displayLabel || node.operation?.label || node.operation?.kind || 'Process step',
      replayableTail =
        context.replayableTail &&
        context.replaySteps.every((step) =>
          processPanelController?.canReplayOperation(step.operation),
        ),
      canCurrentReplay =
        context.canReplaceCurrentVariant &&
        replayableTail &&
        snapshotManager.canRecordOperation(1),
      canBranchStart =
        snapshotManager.canCreateVariant() && snapshotManager.canRecordOperation(1),
      canBranchReplay =
        canBranchStart &&
        replayableTail &&
        snapshotManager.canRecordOperation(context.replaySteps.length + 1),
      actions = [{ value: 'cancel', label: 'Cancel' }];

    if (canCurrentReplay) {
      actions.push({
        value: 'current-replay',
        label: 'Update current Variant',
        kind: 'primary',
        default: true,
      });
    }
    if (canBranchReplay) {
      actions.push({
        value: 'branch-replay',
        label: 'New Variant · Carry later Steps',
        kind: canCurrentReplay ? undefined : 'primary',
        default: !canCurrentReplay,
      });
    }
    if (canBranchStart) {
      actions.push({
        value: 'branch-start',
        label: 'New Variant · Start from here',
        kind: !canCurrentReplay && !canBranchReplay ? 'primary' : undefined,
        default: !canCurrentReplay && !canBranchReplay,
      });
    }

    if (actions.length === 1) {
      status('No safe insertion strategy is available for this Step.', 'warning');
      return false;
    }

    const detail = [
      `The new Step will be applied immediately before this Step using its saved workspace/mask context and predecessor geometry. ${context.laterStepCount} existing Step${context.laterStepCount === 1 ? '' : 's'} follow the insertion point.`,
      !context.canReplaceCurrentVariant
        ? `The current Variant cannot be rewritten because ${context.dependentVariants
            .map((item) => `"${item.name}"`)
            .join(', ')} depend on this history tail.`
        : '',
      !replayableTail
        ? 'Some existing Steps predate deterministic replay metadata, so carrying them forward is unavailable.'
        : 'Recompute stops at the first failed/no-change Step. A Recovery checkpoint preserves the pre-insert workspace.',
    ]
      .filter(Boolean)
      .join(' ');

    const mode = await confirmationDialog.ask({
      title: 'Insert before Step',
      message: `Insert a new process Step before "${currentLabel}"?`,
      detail,
      actions,
      cancelValue: 'cancel',
    });
    if (mode === 'cancel') return false;

    await checkpointWorkspace('pre-history-step-insert');
    const transaction = captureReplayTransaction(),
      restored = snapshotManager.restoreStepInput(node.id);
    if (!restored) {
      status('Could not restore the input state for this insertion point.', 'error');
      return false;
    }

    pendingInsert = {
      nodeId: node.id,
      branchId: context.branchId,
      branchName: context.branchName,
      parentNodeId: context.parentNodeId,
      mode,
      originalLabel: currentLabel,
      laterStepCount: context.laterStepCount,
      replaySteps: context.replaySteps.map((item) => structuredClone(item)),
      canReplaceCurrentVariant: context.canReplaceCurrentVariant,
      transaction,
    };

    refreshAfterHistoricalLoad();
    markProjectDirty();
    renderSnapshots();
    openProcessPanel();
    updateOperationUI();
    status(
      mode === 'current-replay'
        ? `Insert mode: add a Step before "${currentLabel}", then the current Variant will recompute its later Steps.`
        : mode === 'branch-replay'
          ? `Insert mode: add a Step in a new Variant before "${currentLabel}", then carry and recompute the later Steps.`
          : `Insert mode: start a new Variant before "${currentLabel}" without carrying later Steps.`,
      'success',
    );
    return true;
  }

  async function finishInsert({ applyGate, branchCommit } = {}) {
    if (!applyGate?.historyStepInsert) return false;
    const insert = pendingInsert;
    if (
      !insert ||
      insert.nodeId !== applyGate.nodeId ||
      insert.branchId !== applyGate.branchId ||
      insert.parentNodeId !== applyGate.parentNodeId ||
      insert.mode !== applyGate.mode
    ) {
      status('History insertion context changed before completion.', 'error');
      pendingInsert = null;
      updateOperationUI();
      return true;
    }

    const replaySteps = insert.replaySteps.map((step) => structuredClone(step)),
      mode = insert.mode,
      targetVariant = snapshotManager.activeBranch().name,
      transaction = insert.transaction;
    pendingInsert = null;
    updateOperationUI();

    if (mode === 'branch-start') {
      markProjectDirty();
      renderSnapshots();
      status(
        `Inserted the Step and started new Variant "${branchCommit?.name || targetVariant}" from this point.`,
        'success',
      );
      return true;
    }

    beginReplayInteraction();
    let replay;
    try {
      replay = await getProcessPanelController()?.replayOperations(replaySteps, {
        taskLabel: `Recomputing ${replaySteps.length} existing Step${replaySteps.length === 1 ? '' : 's'}…`,
      });
      if (!replay?.ok) restoreReplayTransaction(transaction);
    } finally {
      endReplayInteraction();
    }

    if (!replay?.ok) {
      const failedLabel =
          replay?.failedOperation?.label || replay?.failedOperation?.kind || 'later Step',
        completed = replay?.completed ?? 0;
      status(
        `Recompute stopped after ${completed}/${replaySteps.length} existing Steps at "${failedLabel}": ${replay?.error || 'Replay failed.'} Original Variant restored; the pre-insertion Recovery checkpoint is also available.`,
        'warning',
      );
      return true;
    }

    markProjectDirty();
    renderSnapshots();
    status(
      mode === 'current-replay'
        ? `Inserted the Step and recomputed ${replay.completed} existing Step${replay.completed === 1 ? '' : 's'} in Variant "${snapshotManager.activeBranch().name}".`
        : `Inserted the Step in new Variant "${branchCommit?.name || snapshotManager.activeBranch().name}" and recomputed ${replay.completed} existing Step${replay.completed === 1 ? '' : 's'}.`,
      'success',
    );
    return true;
  }

  async function finishEdit({ applyGate, branchCommit } = {}) {
    if (applyGate?.historyStepInsert) {
      return finishInsert({ applyGate, branchCommit });
    }
    if (!applyGate?.historyStepEdit) return false;
    const edit = pendingEdit;
    if (
      !edit ||
      edit.nodeId !== applyGate.nodeId ||
      edit.branchId !== applyGate.branchId ||
      edit.parentNodeId !== applyGate.parentNodeId
    ) {
      status('Historical Step edit context changed before completion.', 'error');
      pendingEdit = null;
      updateOperationUI();
      return true;
    }

    const downstream = edit.downstream.map((step) => structuredClone(step)),
      mode = edit.mode,
      targetVariant = snapshotManager.activeBranch().name,
      transaction = edit.transaction;
    pendingEdit = null;
    updateOperationUI();

    if (mode !== 'replace-replay' || !downstream.length) {
      markProjectDirty();
      renderSnapshots();
      status(
        mode === 'branch-edit'
          ? `Saved the edited Step as new Variant "${branchCommit?.name || targetVariant}".`
          : downstream.length
            ? `Updated "${targetVariant}" and discarded ${downstream.length} later Step${downstream.length === 1 ? '' : 's'}.`
            : `Updated the last Step in "${targetVariant}".`,
        'success',
      );
      return true;
    }

    beginReplayInteraction();
    let replay;
    try {
      replay = await getProcessPanelController()?.replayOperations(downstream, {
        taskLabel: `Recalculating ${downstream.length} later Step${downstream.length === 1 ? '' : 's'}…`,
      });
      if (!replay?.ok) restoreReplayTransaction(transaction);
    } finally {
      endReplayInteraction();
    }

    if (!replay?.ok) {
      const failedLabel =
          replay?.failedOperation?.label || replay?.failedOperation?.kind || 'later Step',
        completed = replay?.completed ?? 0;
      status(
        `Replay stopped after ${completed}/${downstream.length} later Steps at "${failedLabel}": ${replay?.error || 'Replay failed.'} Original Variant restored; the pre-edit Recovery checkpoint is also available.`,
        'warning',
      );
      return true;
    }

    markProjectDirty();
    renderSnapshots();
    status(
      `Replayed ${replay.completed} later Step${replay.completed === 1 ? '' : 's'} in Variant "${snapshotManager.activeBranch().name}".`,
      'success',
    );
    return true;
  }

  async function beforeApply() {
    const continuation = snapshotManager.continuationContext();

    if (pendingInsert) {
      const insert = pendingInsert;
      if (
        !continuation ||
        continuation.branchId !== insert.branchId ||
        continuation.cursorNodeId !== insert.parentNodeId
      ) {
        pendingInsert = null;
        updateOperationUI();
        status('History insertion context changed. Start the insertion again from History.', 'error');
        return false;
      }

      if (
        insert.mode === 'current-replay' &&
        (!insert.canReplaceCurrentVariant || !snapshotManager.canRecordOperation(1))
      ) {
        status(
          'The current Variant can no longer be safely rewritten at this insertion point.',
          'error',
        );
        return false;
      }
      if (insert.mode !== 'current-replay') {
        const requiredHistoryNodes =
          insert.mode === 'branch-replay' ? insert.replaySteps.length + 1 : 1;
        if (
          !snapshotManager.canCreateVariant() ||
          !snapshotManager.canRecordOperation(requiredHistoryNodes)
        ) {
          status(
            'Variant or History capacity was exhausted before insertion could complete.',
            'error',
          );
          return false;
        }
      }

      return {
        historyStepInsert: true,
        nodeId: insert.nodeId,
        branchId: insert.branchId,
        parentNodeId: insert.parentNodeId,
        mode: insert.mode,
      };
    }

    if (pendingEdit) {
      const edit = pendingEdit;
      if (
        !continuation ||
        continuation.branchId !== edit.branchId ||
        continuation.cursorNodeId !== edit.parentNodeId
      ) {
        pendingEdit = null;
        updateOperationUI();
        status('Historical Step edit context changed. Start the edit again from History.', 'error');
        return false;
      }

      let mode = edit.mode;
      if (!mode) {
        const actions = [{ value: 'cancel', label: 'Cancel' }];
        if (edit.canReplaceCurrentVariant) {
          actions.push({
            value: 'replace-discard',
            label: edit.downstreamCount ? 'Replace & discard later Steps' : 'Replace Step',
            kind: edit.downstreamCount ? 'danger' : 'primary',
            default: true,
          });
          if (edit.downstreamCount && edit.downstreamReplayable) {
            actions.push({
              value: 'replace-replay',
              label: 'Replace & replay later Steps',
            });
          }
        }
        if (snapshotManager.canCreateVariant() && snapshotManager.canRecordOperation(1)) {
          actions.push({
            value: 'branch-edit',
            label: 'Save as new Variant',
            kind: edit.canReplaceCurrentVariant ? undefined : 'primary',
            default: !edit.canReplaceCurrentVariant,
          });
        }

        if (actions.length === 1) {
          status('No safe save strategy is available for this edited Step.', 'warning');
          return false;
        }

        const detail = [
          edit.downstreamCount
            ? `${edit.downstreamCount} later Step${edit.downstreamCount === 1 ? '' : 's'} follow this Step.`
            : 'This is the current Variant HEAD Step.',
          !edit.canReplaceCurrentVariant
            ? `The current Variant cannot be rewritten because ${edit.dependentVariants
                .map((item) => `"${item.name}"`)
                .join(', ')} depend on this Step.`
            : '',
          edit.downstreamCount && !edit.downstreamReplayable
            ? 'Some later Steps predate replay metadata, so replay is unavailable.'
            : '',
        ]
          .filter(Boolean)
          .join(' ');

        mode = await confirmationDialog.ask({
          title: 'Save edited Step',
          message: `Save changes to "${edit.originalLabel}"?`,
          detail,
          actions,
          cancelValue: 'cancel',
        });
        if (mode === 'cancel') return false;
        edit.mode = mode;
      }

      if (mode === 'branch-edit') {
        if (!snapshotManager.canCreateVariant()) {
          status('Variant limit reached before this edit could be saved.', 'error');
          return false;
        }
        if (!snapshotManager.canRecordOperation(1)) {
          status('Process history limit reached before this edit could be saved.', 'error');
          return false;
        }
      }

      return {
        historyStepEdit: true,
        nodeId: edit.nodeId,
        branchId: edit.branchId,
        parentNodeId: edit.parentNodeId,
        mode,
      };
    }

    if (!snapshotManager.canRecordOperation()) {
      status('Process history limit reached. Delete or export this project before adding more steps.', 'error');
      return false;
    }

    if (!continuation) return { createVariant: false };

    const confirmed = await confirmationDialog.confirm({
      title: 'Continue from historical state?',
      message: continuation.processLabel
        ? `Step "${continuation.processLabel}" is behind the current Variant HEAD.`
        : continuation.snapshotName
          ? `Legacy bookmark "${continuation.snapshotName}" is behind the current Variant HEAD.`
          : 'The workspace is behind the current Variant HEAD.',
      detail:
        'If this operation succeeds, WaferCAD will create a new Variant from this historical state. The existing Variant and its HEAD remain unchanged.',
      confirmLabel: 'Create Variant & apply',
    });
    if (!confirmed) return false;

    return {
      createVariant: true,
      branchId: continuation.branchId,
      snapshotId: continuation.snapshotId,
      cursorNodeId: continuation.cursorNodeId,
    };
  }

  function commitApplyBranch(gate) {
    if (gate?.historyStepInsert) {
      const insert = pendingInsert,
        continuation = snapshotManager.continuationContext();
      if (
        !insert ||
        insert.nodeId !== gate.nodeId ||
        insert.branchId !== gate.branchId ||
        insert.parentNodeId !== gate.parentNodeId ||
        insert.mode !== gate.mode ||
        !continuation ||
        continuation.branchId !== insert.branchId ||
        continuation.cursorNodeId !== insert.parentNodeId
      ) {
        throw new Error('History insertion context changed before the operation completed.');
      }

      const created =
        insert.mode === 'current-replay'
          ? (snapshotManager.replaceBranchTailFrom(insert.nodeId), null)
          : snapshotManager.createBranchFromCursor();
      markProjectDirty();
      renderSnapshots();
      return created;
    }

    if (gate?.historyStepEdit) {
      const edit = pendingEdit,
        continuation = snapshotManager.continuationContext();
      if (
        !edit ||
        edit.nodeId !== gate.nodeId ||
        edit.branchId !== gate.branchId ||
        edit.parentNodeId !== gate.parentNodeId ||
        !continuation ||
        continuation.branchId !== edit.branchId ||
        continuation.cursorNodeId !== edit.parentNodeId
      ) {
        throw new Error('Historical Step edit context changed before the operation completed.');
      }

      const created =
        edit.mode === 'branch-edit'
          ? snapshotManager.createBranchFromCursor()
          : (snapshotManager.replaceBranchTailFrom(edit.nodeId), null);
      markProjectDirty();
      renderSnapshots();
      return created;
    }

    if (!gate?.createVariant) return null;
    const continuation = snapshotManager.continuationContext();
    if (
      !continuation ||
      continuation.branchId !== gate.branchId ||
      continuation.snapshotId !== gate.snapshotId ||
      continuation.cursorNodeId !== gate.cursorNodeId
    ) {
      throw new Error('Historical state changed before the operation completed.');
    }

    const created = snapshotManager.createBranchFromCursor();
    markProjectDirty();
    renderSnapshots();
    status(`Created variant "${created.name}" for continued processing.`);
    return created;
  }

  return {
    cancelEdit,
    cancelInsert,
    currentEdit,
    currentInsert,
    beginEdit,
    beginInsert,
    beforeApply,
    commitApplyBranch,
    afterApply: finishEdit,
  };
}
