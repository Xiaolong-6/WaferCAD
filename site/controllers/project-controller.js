import { assertLayoutByteLength } from '../layout-io.js';
import { readProjectFile } from '../project-io.js';
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
      restoreButton.onclick = () => {
        if (!snapshotManager.restore(record.id)) {
          status('Snapshot restore failed validation.');
          return;
        }
        syncBaseControls();
        syncTransformInputs();
        renderAll();
        fit3d();
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
      const project = await readProjectFile(file);
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
      const project = createVisualizationExample();
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

  return { renderSnapshots, openLayoutFile, openProjectFile, openVisualizationExample };
}
