import { assertLayoutByteLength } from '../layout-io.js';
import { downloadProject, readProjectFile } from '../project-io.js';
import { clearWorkspaceState } from '../workspace-persistence.js';
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
}) {
  const $ = (id) => root.getElementById(id);

  function renderSnapshots() {
    const host = $('snapshotList'),
      records = snapshotManager.list();
    $('snapshotCount').textContent = String(records.length);
    host.innerHTML = '';

    if (!records.length) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'No snapshots';
      host.append(empty);
      onProjectChanged();
      return;
    }

    for (const record of records) {
      const row = root.createElement('div');
      row.className = 'snapshot-row';

      const name = root.createElement('input');
      name.className = 'snapshot-name';
      name.value = record.name;
      name.title = record.createdAt;
      name.onchange = () => {
        if (!snapshotManager.rename(record.id, name.value)) name.value = record.name;
        renderSnapshots();
      };

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
          status('Snapshot restore failed validation.');
          return;
        }
        syncBaseControls();
        syncTransformInputs();
        renderAll();
        fit3d();
        onProjectChanged();
        status(`Restored snapshot "${record.name}".`);
      };

      const deleteButton = root.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'snapshot-delete';
      deleteButton.textContent = '×';
      deleteButton.title = 'Delete snapshot';
      deleteButton.onclick = () => {
        snapshotManager.remove(record.id);
        renderSnapshots();
        status(`Deleted snapshot "${record.name}".`);
      };

      row.append(name, restoreButton, deleteButton);
      host.append(row);
    }
    onProjectChanged();
  }

  async function openLayoutFile(file) {
    try {
      assertLayoutByteLength(file.size);
      status(`Reading ${file.name}…`);
      await importLayoutBuffer(await file.arrayBuffer(), file.name, file.name);
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
      await checkpointBeforeReplace('pre-open-project');
      if (!project.name) {
        project.name =
          String(file.name || '')
            .replace(/\.(?:wafercad|json)$/i, '')
            .trim() || 'Untitled';
      }
      loadProjectSnapshot(project);
      snapshotManager.importRecords(project.snapshots || []);
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
      snapshotManager.importRecords(project.snapshots || []);
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
      if (!globalThis.confirm('New project will replace the current workspace. Continue?')) return;
      try {
        await checkpointBeforeReplace('pre-new-project');
        await clearWorkspaceState();
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

    $('exportProjectBtn').onclick = () => {
      try {
        const projectName = normalizedProjectName(getProjectName());
        setProjectName(projectName);
        syncProjectNameInput();
        downloadProject(buildProjectSnapshot(true), projectExportFilename());
        status(`Exported ${projectExportFilename()}.`);
      } catch (error) {
        console.error(error);
        status(`Export failed: ${error.message}`, 'error');
      }
    };

    $('openProjectInput').onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (!globalThis.confirm('Open project will replace the current workspace. Continue?')) {
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
