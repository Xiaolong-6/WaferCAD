import { assertLayoutByteLength } from '../layout-io.js';
import { downloadProject, readProjectFile } from '../project-io.js';
import { migrateProjectFile, validateProjectFile } from '../project-schema.js';
import { createVisualizationExample } from '../welcome-example.js';

export function createProjectController({
  root = document,
  importLayoutBuffer,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs,
  renderAll,
  fit3d,
  status,
  onProjectChanged = () => {},
  checkpointBeforeReplace = async () => false,
  readProjectFileTask = readProjectFile,
  exportProjectFileTask = null,
  normalizedProjectName,
  getProjectName,
  setProjectName,
  syncProjectNameInput,
  scheduleWorkspacePersistence,
  resetProjectState,
  resetRoughDraftControls,
  clearRoiDrawingMode,
  clearMaskRoiDrawingMode,
  buildProjectSnapshot,
  confirmAction = async () => false,
}) {
  const $ = (id) => root.getElementById(id);

  function refreshAfterSnapshotLoad() {
    syncBaseControls();
    syncTransformInputs();
    renderAll();
    fit3d();
  }

  function renderSnapshots() {
    const host = $('snapshotList'),
      records = snapshotManager.list(),
      historyNodes = snapshotManager.listHistory(),
      branches = snapshotManager.listBranches(),
      activeBranch = snapshotManager.activeBranch(),
      continuation = snapshotManager.continuationContext(),
      recordById = new Map(records.map((record) => [record.id, record]));

    $('snapshotCount').textContent = String(records.length);
    host.innerHTML = '';

    async function switchToBranch(targetId) {
      if (targetId === snapshotManager.activeBranch().id && !snapshotManager.continuationContext()) {
        return true;
      }
      try {
        if (snapshotManager.continuationContext()) {
          await checkpointBeforeReplace('pre-snapshot-variant-switch');
        } else {
          snapshotManager.syncActiveHeadState();
        }
      } catch (error) {
        console.error(error);
        status(`Variant switch cancelled: ${error.message}`, 'error');
        return false;
      }
      if (!snapshotManager.switchBranch(targetId)) {
        status('Variant switch failed validation.', 'error');
        return false;
      }
      refreshAfterSnapshotLoad();
      onProjectChanged();
      const nextBranch = snapshotManager.activeBranch();
      renderSnapshots();
      status(`Switched to variant "${nextBranch.name}" HEAD.`);
      return true;
    }

    const branchBar = root.createElement('div');
    branchBar.className = 'snapshot-branch-bar';

    const branchLabel = root.createElement('label');
    branchLabel.className = 'snapshot-branch-label';
    branchLabel.textContent = 'Current variant';

    const branchSelect = root.createElement('select');
    branchSelect.id = 'snapshotBranchSelect';
    branchSelect.className = 'snapshot-branch-select';
    branchSelect.title = 'Switch to another process variant HEAD';
    for (const branch of branches) {
      const option = root.createElement('option');
      option.value = branch.id;
      option.textContent = branch.name;
      branchSelect.append(option);
    }
    branchSelect.value = activeBranch.id;
    branchSelect.onchange = async () => {
      const selected = branchSelect.value;
      const ok = await switchToBranch(selected);
      if (!ok) branchSelect.value = snapshotManager.activeBranch().id;
    };

    const branchState = root.createElement('span');
    branchState.className = 'snapshot-branch-state';
    branchState.textContent = continuation ? 'historical' : 'HEAD';
    if (continuation) branchState.dataset.historical = 'true';

    branchBar.append(branchLabel, branchSelect, branchState);
    host.append(branchBar);

    if (continuation) {
      const banner = root.createElement('div');
      banner.className = 'snapshot-continuation-banner';

      const copy = root.createElement('div');
      const title = root.createElement('strong');
      title.textContent = 'Historical working state';
      const detail = root.createElement('span');
      detail.textContent = continuation.snapshotName
        ? `Viewing "${continuation.snapshotName}". Edits here stay in this working state; a successful Apply will create a new variant from it.`
        : 'Undo moved before the variant HEAD. Edits here stay in this working state; a successful Apply will create a milestone and new variant from it.';
      copy.append(title, detail);

      const returnButton = root.createElement('button');
      returnButton.type = 'button';
      returnButton.className = 'snapshot-return-head';
      returnButton.textContent = `Return to ${activeBranch.name} HEAD`;
      returnButton.onclick = async () => {
        try {
          await checkpointBeforeReplace('pre-snapshot-return-head');
        } catch (error) {
          console.error(error);
          status(`Return to HEAD cancelled: ${error.message}`, 'error');
          return;
        }
        if (!snapshotManager.restoreActiveBranchHead()) {
          status('Could not restore the current variant HEAD.', 'error');
          return;
        }
        refreshAfterSnapshotLoad();
        onProjectChanged();
        renderSnapshots();
        status(`Returned to "${activeBranch.name}" HEAD.`);
      };

      banner.append(copy, returnButton);
      host.append(banner);
    }

    if (!records.length && !historyNodes.length) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'Apply a process step or save a milestone to start the process history.';
      host.append(empty);
      return;
    }

    function closeMenu(details) {
      if (details) details.open = false;
    }

    function createActionMenu(items, label = 'More milestone actions') {
      const details = root.createElement('details');
      details.className = 'snapshot-more-menu';

      const summary = root.createElement('summary');
      summary.className = 'snapshot-more-trigger';
      summary.textContent = '⋯';
      summary.setAttribute('aria-label', label);
      summary.title = label;

      const menu = root.createElement('div');
      menu.className = 'snapshot-more-popover';

      for (const item of items) {
        const button = root.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        if (item.danger) button.dataset.danger = 'true';
        if (item.disabled) button.disabled = true;
        if (item.title) button.title = item.title;
        button.onclick = async () => {
          if (button.disabled) return;
          closeMenu(details);
          await item.run();
        };
        menu.append(button);
      }

      details.append(summary, menu);
      return details;
    }

    function createMilestoneRow(record) {
      const wrap = root.createElement('div');
      wrap.className = 'snapshot-milestone-row';
      if (record.id === activeBranch.headSnapshotId) wrap.dataset.milestoneHead = 'true';
      if (continuation?.snapshotId === record.id) wrap.dataset.cursor = 'true';

      const marker = root.createElement('span');
      marker.className = 'snapshot-milestone-marker';
      marker.textContent = '★';
      marker.title = 'Milestone';
      marker.setAttribute('aria-hidden', 'true');

      const body = root.createElement('div');
      body.className = 'snapshot-milestone-body';
      const name = root.createElement('strong');
      name.textContent = record.name;
      name.title = record.createdAt;
      const meta = root.createElement('span');
      meta.textContent =
        record.id === activeBranch.headSnapshotId
          ? 'milestone · latest milestone'
          : 'milestone';
      body.append(name, meta);

      const renameEditor = root.createElement('div');
      renameEditor.className = 'snapshot-inline-editor';
      renameEditor.hidden = true;

      const renameInput = root.createElement('input');
      renameInput.type = 'text';
      renameInput.maxLength = 256;
      renameInput.value = record.name;
      renameInput.setAttribute('aria-label', 'Snapshot name');

      const saveRename = root.createElement('button');
      saveRename.type = 'button';
      saveRename.textContent = 'Save';

      const cancelRename = root.createElement('button');
      cancelRename.type = 'button';
      cancelRename.textContent = 'Cancel';

      const commitRename = () => {
        const next = renameInput.value.trim();
        if (!next || !snapshotManager.rename(record.id, next)) {
          renameInput.value = record.name;
          return;
        }
        onProjectChanged();
        renderSnapshots();
        status(`Renamed milestone to "${next}".`);
      };
      saveRename.onclick = commitRename;
      cancelRename.onclick = () => {
        renameEditor.hidden = true;
      };
      renameInput.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitRename();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          renameEditor.hidden = true;
        }
      };
      renameEditor.append(renameInput, saveRename, cancelRename);

      const branchUsers = snapshotManager.branchesUsingSnapshot(record.id);
      const menu = createActionMenu([
        {
          label: 'Restore milestone',
          run: async () => {
            try {
              await checkpointBeforeReplace('pre-snapshot-restore');
            } catch (error) {
              console.error(error);
              status(`Milestone restore cancelled: ${error.message}`, 'error');
              return;
            }
            if (!snapshotManager.restore(record.id)) {
              status('Milestone restore failed validation.', 'error');
              return;
            }
            refreshAfterSnapshotLoad();
            onProjectChanged();
            renderSnapshots();
            status(`Restored milestone "${record.name}".`);
          },
        },
        {
          label: 'Variant from here',
          run: async () => {
            try {
              await checkpointBeforeReplace('pre-snapshot-branch-create');
              const created = snapshotManager.createBranch(record.id);
              if (!snapshotManager.switchBranch(created.id)) {
                throw new Error('The variant origin could not be restored.');
              }
              refreshAfterSnapshotLoad();
              onProjectChanged();
              renderSnapshots();
              status(`Created variant "${created.name}" from "${record.name}".`);
            } catch (error) {
              console.error(error);
              status(`Variant creation failed: ${error.message}`, 'error');
            }
          },
        },
        {
          label: 'Rename milestone',
          run: async () => {
            renameEditor.hidden = false;
            renameInput.focus();
            renameInput.select();
          },
        },
        {
          label: 'Delete milestone',
          danger: true,
          disabled: branchUsers.length > 0,
          title: branchUsers.length
            ? `Used as the origin of ${branchUsers.map((branch) => branch.name).join(', ')}.`
            : 'Delete this milestone.',
          run: async () => {
            const confirmed = await confirmAction({
              title: 'Delete milestone?',
              message: `Delete "${record.name}"?`,
              detail: 'Process history remains intact.',
              confirmLabel: 'Delete milestone',
            });
            if (!confirmed) return;
            if (!snapshotManager.remove(record.id)) {
              status('This milestone is used as a variant origin and cannot be deleted.', 'warning');
              return;
            }
            onProjectChanged();
            renderSnapshots();
            status(`Deleted milestone "${record.name}".`);
          },
        },
      ]);

      const row = root.createElement('div');
      row.className = 'snapshot-timeline-row';
      row.append(marker, body, menu);

      wrap.append(row, renameEditor);
      return wrap;
    }

    function createProcessRow(node) {
      const row = root.createElement('div');
      row.className = 'process-history-row';
      if (node.id === activeBranch.headNodeId) row.dataset.head = 'true';
      if (continuation?.cursorNodeId === node.id) row.dataset.cursor = 'true';

      const marker = root.createElement('span');
      marker.className = 'process-history-marker';
      marker.setAttribute('aria-hidden', 'true');

      const body = root.createElement('div');
      body.className = 'process-history-body';

      const label = root.createElement('strong');
      label.textContent = node.operation?.label || node.operation?.kind || 'Process step';

      const meta = root.createElement('span');
      const face = node.operation?.face
        ? node.operation.face[0].toUpperCase() + node.operation.face.slice(1)
        : '';
      const area = node.operation?.areaLabel || '';
      meta.textContent = [face, area, `r${node.processRevision}`].filter(Boolean).join(' · ');

      body.append(label, meta);
      row.append(marker, body);
      return row;
    }

    const activeGroup = root.createElement('section');
    activeGroup.className = 'snapshot-branch-group snapshot-active-branch';
    activeGroup.dataset.active = 'true';

    const branchHead = root.createElement('div');
    branchHead.className = 'snapshot-branch-head';

    const branchTitle = root.createElement('div');
    branchTitle.className = 'snapshot-branch-title';
    const dot = root.createElement('span');
    dot.className = 'snapshot-branch-dot';
    dot.setAttribute('aria-hidden', 'true');
    const title = root.createElement('strong');
    title.textContent = activeBranch.name;
    const count = root.createElement('span');
    count.className = 'snapshot-branch-count';
    count.textContent = `${activeBranch.processStepCount} step${activeBranch.processStepCount === 1 ? '' : 's'} · ${activeBranch.ownSnapshotCount} milestone${activeBranch.ownSnapshotCount === 1 ? '' : 's'}`;
    branchTitle.append(dot, title, count);

    const branchMenuItems = [
      {
        label: 'Rename variant',
        run: async () => {
          branchRename.hidden = false;
          branchRenameInput.focus();
          branchRenameInput.select();
        },
      },
    ];
    if (activeBranch.id !== 'main') {
      branchMenuItems.push({
        label: 'Delete variant',
        danger: true,
        run: async () => {
          const confirmed = await confirmAction({
            title: 'Delete variant?',
            message: `Delete "${activeBranch.name}" and its private process history?`,
            detail: 'Its origin milestone is kept. Child variants must be deleted first. A Recovery checkpoint is created before deletion.',
            confirmLabel: 'Delete variant',
            danger: true,
          });
          if (!confirmed) return;
          try {
            await checkpointBeforeReplace('pre-snapshot-variant-delete');
            const removed = snapshotManager.removeBranch(activeBranch.id);
            if (!removed) throw new Error('Variant was not found.');
            refreshAfterSnapshotLoad();
            onProjectChanged();
            renderSnapshots();
            status(`Deleted variant "${removed.name}".`);
          } catch (error) {
            console.error(error);
            status(`Variant deletion failed: ${error.message}`, 'error');
          }
        },
      });
    }
    const branchMenu = createActionMenu(branchMenuItems, 'More variant actions');

    branchHead.append(branchTitle, branchMenu);
    activeGroup.append(branchHead);

    const branchRename = root.createElement('div');
    branchRename.className = 'snapshot-inline-editor snapshot-branch-rename';
    branchRename.hidden = true;

    const branchRenameInput = root.createElement('input');
    branchRenameInput.type = 'text';
    branchRenameInput.maxLength = 256;
    branchRenameInput.value = activeBranch.name;
    branchRenameInput.setAttribute('aria-label', 'Variant name');

    const saveBranchRename = root.createElement('button');
    saveBranchRename.type = 'button';
    saveBranchRename.textContent = 'Save';

    const cancelBranchRename = root.createElement('button');
    cancelBranchRename.type = 'button';
    cancelBranchRename.textContent = 'Cancel';

    const commitBranchRename = () => {
      const next = branchRenameInput.value.trim();
      if (!next || !snapshotManager.renameBranch(activeBranch.id, next)) return;
      onProjectChanged();
      renderSnapshots();
      status(`Renamed variant to "${snapshotManager.activeBranch().name}".`);
    };
    saveBranchRename.onclick = commitBranchRename;
    cancelBranchRename.onclick = () => {
      branchRename.hidden = true;
    };
    branchRenameInput.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitBranchRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        branchRename.hidden = true;
      }
    };
    branchRename.append(branchRenameInput, saveBranchRename, cancelBranchRename);
    activeGroup.append(branchRename);

    if (activeBranch.rootSnapshotId) {
      const source = recordById.get(activeBranch.rootSnapshotId);
      const origin = root.createElement('div');
      origin.className = 'snapshot-branch-origin';
      origin.textContent = source ? `↳ from ${source.name}` : '↳ variant origin';
      activeGroup.append(origin);
    }

    const timeline = root.createElement('div');
    timeline.className = 'snapshot-tree';

    const ownRecords = records.filter((record) => record.branchId === activeBranch.id),
      nodeById = new Map(historyNodes.map((node) => [node.id, node])),
      ancestry = [];
    let ancestryId = activeBranch.headNodeId;
    const seenAncestry = new Set();
    while (ancestryId && !seenAncestry.has(ancestryId)) {
      seenAncestry.add(ancestryId);
      const node = nodeById.get(ancestryId);
      if (!node) break;
      ancestry.push(node);
      ancestryId = node.parentId;
    }
    ancestry.reverse();
    const nodeOrder = new Map(ancestry.map((node, index) => [node.id, index])),
      ownNodes = ancestry.filter((node) => node.branchId === activeBranch.id),
      events = [
        ...ownNodes.map((node) => ({
          type: 'process',
          order: nodeOrder.get(node.id) ?? Number.POSITIVE_INFINITY,
          createdAt: node.createdAt,
          value: node,
        })),
        ...ownRecords.map((record) => ({
          type: 'milestone',
          order:
            record.historyNodeId && nodeOrder.has(record.historyNodeId)
              ? nodeOrder.get(record.historyNodeId) + 0.5
              : -0.5,
          createdAt: record.createdAt,
          value: record,
        })),
      ].sort((left, right) => {
        if (left.order !== right.order) return left.order - right.order;
        const delta = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (delta !== 0) return delta;
        return left.type === 'process' ? -1 : 1;
      });

    if (!events.length) {
      const emptyBranch = root.createElement('div');
      emptyBranch.className = 'snapshot-branch-empty';
      emptyBranch.textContent =
        activeBranch.rootSnapshotId
          ? 'Variant ready. The next successful Apply becomes its first process step.'
          : 'No process steps or milestones on this variant yet.';
      timeline.append(emptyBranch);
    }

    for (const event of events) {
      timeline.append(
        event.type === 'process'
          ? createProcessRow(event.value)
          : createMilestoneRow(event.value),
      );
    }

    activeGroup.append(timeline);
    host.append(activeGroup);

    const otherBranches = branches.filter((branch) => branch.id !== activeBranch.id);
    if (otherBranches.length) {
      const otherHead = root.createElement('div');
      otherHead.className = 'snapshot-other-heading';
      otherHead.textContent = 'Other variants';
      host.append(otherHead);

      const otherList = root.createElement('div');
      otherList.className = 'snapshot-other-list';

      for (const branch of otherBranches) {
        const source = branch.rootSnapshotId ? recordById.get(branch.rootSnapshotId) : null;
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'snapshot-other-branch';

        const branchCopy = root.createElement('span');
        branchCopy.className = 'snapshot-other-copy';
        const branchName = root.createElement('strong');
        branchName.textContent = branch.name;
        const branchOrigin = root.createElement('span');
        branchOrigin.textContent = source
          ? `from ${source.name}`
          : 'independent variant';
        branchCopy.append(branchName, branchOrigin);

        const stats = root.createElement('span');
        stats.className = 'snapshot-other-stats';
        stats.textContent = `${branch.processStepCount} step${branch.processStepCount === 1 ? '' : 's'} · ${branch.ownSnapshotCount} milestone${branch.ownSnapshotCount === 1 ? '' : 's'}`;

        button.append(branchCopy, stats);
        button.onclick = () => switchToBranch(branch.id);
        otherList.append(button);
      }

      host.append(otherList);
    }
  }

  async function openLayoutFile(file) {
    try {
      assertLayoutByteLength(file.size);
      status(`Reading ${file.name}…`);
      const imported = await importLayoutBuffer(await file.arrayBuffer(), file.name, file.name);
      if (!imported) return false;
      status(`Opened ${file.name}.`);
      return true;
    } catch (error) {
      console.error(error);
      status(`Layout import failed: ${error.message}`);
      return false;
    }
  }

  async function openProjectFile(file) {
    try {
      const project = await readProjectFileTask(file);
      if (!project) return false;
      await checkpointBeforeReplace('pre-open-project');
      if (!project.name) {
        project.name =
          String(file.name || '')
            .replace(/\.(?:wafercad|json)$/i, '')
            .trim() || 'Untitled';
      }
      loadProjectSnapshot(project);
      snapshotManager.importRecords(project.snapshots || [], project.snapshotBranches);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      fit3d();
      status(`Opened ${file.name}.`);
      return true;
    } catch (error) {
      console.error(error);
      status(`Open failed: ${error.message}`);
      return false;
    }
  }

  function openVisualizationExample() {
    try {
      status('Building example…');
      const project = validateProjectFile(migrateProjectFile(createVisualizationExample()));
      if (!project.name) project.name = 'Visualization example';
      loadProjectSnapshot(project);
      snapshotManager.importRecords(project.snapshots || [], project.snapshotBranches);
      syncBaseControls();
      syncTransformInputs();
      renderAll();
      renderSnapshots();
      fit3d();
      status('Opened Visualization example.');
      return true;
    } catch (error) {
      console.error(error);
      status(`Example failed: ${error.message}`);
      return false;
    }
  }


  function projectExportFilename() {
    const stem = normalizedProjectName(getProjectName())
      .replace(/[<>:"|?*\u0000-\u001f]/g, '-')
      .replace(/[\\/]/g, '-')
      .replace(/[. ]+$/g, '')
      .trim();
    return `${stem || 'Untitled'}.wafercad`;
  }

  function bind() {
    $('projectNameInput').oninput = (event) => {
      setProjectName(String(event.target.value ?? '').slice(0, 256));
      scheduleWorkspacePersistence();
    };
    $('projectNameInput').onchange = () => {
      const projectName = normalizedProjectName(getProjectName());
      setProjectName(projectName);
      $('projectNameInput').value = projectName;
      scheduleWorkspacePersistence();
    };

    $('newProjectBtn').onclick = async () => {
      if (
        !(await confirmAction({
          title: 'Create new project?',
          message: 'The current workspace will be replaced.',
          detail: 'A local recovery checkpoint is created before the replacement.',
          confirmLabel: 'New project',
          danger: true,
        }))
      ) {
        return;
      }
      try {
        await checkpointBeforeReplace('pre-new-project');
        resetProjectState();
        resetRoughDraftControls();
        clearRoiDrawingMode();
        clearMaskRoiDrawingMode();
        snapshotManager.clear();
        syncBaseControls();
        renderAll();
        renderSnapshots();
        fit3d();
        status('New empty project.');
      } catch (error) {
        console.error(error);
        status(`New project cancelled: ${error.message}`, 'error');
      }
    };

    $('exportProjectBtn').onclick = async () => {
      try {
        const projectName = normalizedProjectName(getProjectName());
        setProjectName(projectName);
        syncProjectNameInput();
        const filename = projectExportFilename(),
          project = buildProjectSnapshot(true);
        if (exportProjectFileTask) {
          if (!(await exportProjectFileTask(project, filename))) return;
        } else {
          downloadProject(project, filename);
        }
        status(`Download requested: ${filename}.`);
      } catch (error) {
        console.error(error);
        status(`Export failed: ${error.message}`, 'error');
      }
    };

    $('openProjectInput').onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (
        !(await confirmAction({
          title: 'Open project?',
          message: 'The current workspace will be replaced by the selected project file.',
          detail: 'A local recovery checkpoint is created before the replacement.',
          confirmLabel: 'Open project',
          danger: true,
        }))
      ) {
        event.target.value = '';
        return;
      }
      await openProjectFile(file);
      event.target.value = '';
    };
  }

  return {
    bind,
    renderSnapshots,
    openLayoutFile,
    openProjectFile,
    openVisualizationExample,
  };
}
