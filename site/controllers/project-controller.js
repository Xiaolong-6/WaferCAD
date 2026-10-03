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
      branches = snapshotManager.listBranches(),
      activeBranch = snapshotManager.activeBranch(),
      recordById = new Map(records.map((record) => [record.id, record]));
    $('snapshotCount').textContent = String(records.length);
    host.innerHTML = '';

    const branchBar = root.createElement('div');
    branchBar.className = 'snapshot-branch-bar';

    const branchLabel = root.createElement('label');
    branchLabel.className = 'snapshot-branch-label';
    branchLabel.textContent = 'Current branch';

    const branchSelect = root.createElement('select');
    branchSelect.id = 'snapshotBranchSelect';
    branchSelect.className = 'snapshot-branch-select';
    branchSelect.title = 'Switch to another snapshot branch';
    for (const branch of branches) {
      const option = root.createElement('option');
      option.value = branch.id;
      option.textContent = branch.name;
      branchSelect.append(option);
    }
    branchSelect.value = activeBranch.id;
    branchSelect.onchange = async () => {
      const targetId = branchSelect.value;
      if (targetId === snapshotManager.activeBranch().id) return;
      try {
        await checkpointBeforeReplace('pre-snapshot-branch-switch');
      } catch (error) {
        console.error(error);
        branchSelect.value = snapshotManager.activeBranch().id;
        status(`Branch switch cancelled: ${error.message}`, 'error');
        return;
      }
      if (!snapshotManager.switchBranch(targetId)) {
        branchSelect.value = snapshotManager.activeBranch().id;
        status('Branch switch failed validation.', 'error');
        return;
      }
      refreshAfterSnapshotLoad();
      onProjectChanged();
      const nextBranch = snapshotManager.activeBranch();
      renderSnapshots();
      status(`Switched to branch "${nextBranch.name}".`);
    };

    branchBar.append(branchLabel, branchSelect);
    host.append(branchBar);

    if (!records.length) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'Save a snapshot to create the first branch point.';
      host.append(empty);
      return;
    }

    for (const branch of branches) {
      const group = root.createElement('section');
      group.className = 'snapshot-branch-group';
      if (branch.active) group.dataset.active = 'true';

      const branchHead = root.createElement('div');
      branchHead.className = 'snapshot-branch-head';

      const branchTitle = root.createElement('div');
      branchTitle.className = 'snapshot-branch-title';
      const dot = root.createElement('span');
      dot.className = 'snapshot-branch-dot';
      dot.setAttribute('aria-hidden', 'true');
      const title = root.createElement('strong');
      title.textContent = branch.name;
      const count = root.createElement('span');
      count.className = 'snapshot-branch-count';
      count.textContent = `${branch.ownSnapshotCount} snapshot${branch.ownSnapshotCount === 1 ? '' : 's'}`;
      branchTitle.append(dot, title, count);
      branchHead.append(branchTitle);
      group.append(branchHead);

      if (branch.rootSnapshotId) {
        const source = recordById.get(branch.rootSnapshotId);
        const origin = root.createElement('div');
        origin.className = 'snapshot-branch-origin';
        origin.textContent = source ? `↳ from ${source.name}` : '↳ branch origin';
        group.append(origin);
      }

      const timeline = root.createElement('div');
      timeline.className = 'snapshot-tree';
      const ownRecords = records
        .filter((record) => record.branchId === branch.id)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

      if (!ownRecords.length) {
        const emptyBranch = root.createElement('div');
        emptyBranch.className = 'snapshot-branch-empty';
        emptyBranch.textContent =
          branch.headSnapshotId && branch.rootSnapshotId
            ? 'Continue from the branch point, then save a snapshot.'
            : 'No snapshots on this branch yet.';
        timeline.append(emptyBranch);
      }

      for (const record of ownRecords) {
        const wrap = root.createElement('div');
        wrap.className = 'snapshot-tree-node';
        if (record.id === branch.headSnapshotId) wrap.dataset.head = 'true';

        const row = root.createElement('div');
        row.className = 'snapshot-row snapshot-tree-row';

        const marker = root.createElement('span');
        marker.className = 'snapshot-tree-marker';
        marker.title = record.id === branch.headSnapshotId ? 'Branch HEAD' : 'Snapshot';
        marker.setAttribute('aria-hidden', 'true');

        const name = root.createElement('input');
        name.className = 'snapshot-name';
        name.value = record.name;
        name.title = record.createdAt;

        const commitState = root.createElement('span');
        commitState.className = 'snapshot-commit-state';
        commitState.textContent = 'Saved';

        let renameTimer = null;
        const commitName = () => {
          if (renameTimer != null) {
            clearTimeout(renameTimer);
            renameTimer = null;
          }
          const next = name.value.trim();
          if (!next || !snapshotManager.rename(record.id, next)) {
            name.value = record.name;
            commitState.textContent = 'Not saved';
            commitState.dataset.failed = 'true';
            return false;
          }
          record.name = next;
          commitState.textContent = 'Saved';
          commitState.dataset.failed = 'false';
          onProjectChanged();
          return true;
        };

        name.oninput = () => {
          commitState.textContent = 'Editing…';
          commitState.dataset.failed = 'false';
          if (renameTimer != null) clearTimeout(renameTimer);
          renameTimer = setTimeout(commitName, 350);
        };
        name.onblur = commitName;
        name.onkeydown = (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commitName();
          name.blur();
        };

        const actions = root.createElement('div');
        actions.className = 'snapshot-node-actions';

        const restoreButton = root.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'snapshot-action';
        restoreButton.textContent = 'Restore';
        restoreButton.onclick = async () => {
          try {
            await checkpointBeforeReplace('pre-snapshot-restore');
          } catch (error) {
            console.error(error);
            status(`Snapshot restore cancelled: ${error.message}`, 'error');
            return;
          }
          if (!snapshotManager.restore(record.id)) {
            status('Snapshot restore failed validation.', 'error');
            return;
          }
          refreshAfterSnapshotLoad();
          onProjectChanged();
          status(`Restored snapshot "${record.name}".`);
        };

        const branchButton = root.createElement('button');
        branchButton.type = 'button';
        branchButton.className = 'snapshot-branch-action';
        branchButton.textContent = 'Branch';
        branchButton.title = 'Create a new branch from this snapshot';

        const deleteButton = root.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'snapshot-delete';
        deleteButton.textContent = '×';
        deleteButton.title = 'Delete snapshot';
        deleteButton.onclick = () => {
          snapshotManager.remove(record.id);
          onProjectChanged();
          renderSnapshots();
          status(`Deleted snapshot "${record.name}".`);
        };

        actions.append(restoreButton, branchButton, deleteButton);
        row.append(marker, name, commitState, actions);

        const branchEditor = root.createElement('div');
        branchEditor.className = 'snapshot-branch-editor';
        branchEditor.hidden = true;

        const branchName = root.createElement('input');
        branchName.type = 'text';
        branchName.maxLength = 256;
        branchName.value = `${record.name} branch`;
        branchName.setAttribute('aria-label', 'Branch name');

        const createBranchButton = root.createElement('button');
        createBranchButton.type = 'button';
        createBranchButton.className = 'snapshot-branch-create';
        createBranchButton.textContent = 'Create';

        const cancelBranchButton = root.createElement('button');
        cancelBranchButton.type = 'button';
        cancelBranchButton.className = 'snapshot-branch-cancel';
        cancelBranchButton.textContent = 'Cancel';

        branchButton.onclick = () => {
          branchEditor.hidden = false;
          branchName.focus();
          branchName.select();
        };
        cancelBranchButton.onclick = () => {
          branchEditor.hidden = true;
        };
        branchName.onkeydown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            branchEditor.hidden = true;
          } else if (event.key === 'Enter') {
            event.preventDefault();
            createBranchButton.click();
          }
        };
        createBranchButton.onclick = async () => {
          try {
            await checkpointBeforeReplace('pre-snapshot-branch-create');
            const created = snapshotManager.createBranch(record.id, branchName.value);
            if (!snapshotManager.switchBranch(created.id)) {
              throw new Error('The branch point could not be restored.');
            }
            refreshAfterSnapshotLoad();
            onProjectChanged();
            renderSnapshots();
            status(`Created branch "${created.name}" from "${record.name}".`);
          } catch (error) {
            console.error(error);
            status(`Branch creation failed: ${error.message}`, 'error');
          }
        };

        branchEditor.append(branchName, createBranchButton, cancelBranchButton);
        wrap.append(row, branchEditor);
        timeline.append(wrap);
      }

      group.append(timeline);
      host.append(group);
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
        status(`Exported ${filename}.`);
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
