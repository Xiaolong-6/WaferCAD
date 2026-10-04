import { assertLayoutByteLength } from '../layout-io.js';
import { downloadProject, readProjectFile } from '../project-io.js';
import { migrateProjectFile, validateProjectFile } from '../project-schema.js';
import { bundledExampleById } from '../bundled-examples.js';

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
  beginHistoricalStepEdit = async () => false,
  getHistoricalStepEdit = () => null,
  cancelHistoricalStepEdit = () => {},
}) {
  const $ = (id) => root.getElementById(id);
  const expandedHistoryVariants = new Set();

  function refreshAfterSnapshotLoad() {
    syncBaseControls();
    syncTransformInputs();
    renderAll();
    // loadProjectSnapshot restores the saved 3D camera (or fits when no camera
    // exists). Fitting again here would overwrite inspection view state and
    // make a freshly restored History Step look edited.
  }

  function renderSnapshots() {
    const host = $('snapshotList'),
      bookmarks = snapshotManager.list(),
      historyNodes = snapshotManager.listHistory(),
      branches = snapshotManager.listBranches(),
      activeBranch = snapshotManager.activeBranch(),
      continuation = snapshotManager.continuationContext(),
      historyEdit = getHistoricalStepEdit(),
      position = snapshotManager.currentPosition(),
      nodeById = new Map(historyNodes.map((node) => [node.id, node])),
      branchById = new Map(branches.map((variant) => [variant.id, variant])),
      bookmarksByNode = new Map(),
      legacyBookmarks = [];

    for (const bookmark of bookmarks) {
      if (bookmark.historyNodeId && nodeById.has(bookmark.historyNodeId)) {
        const list = bookmarksByNode.get(bookmark.historyNodeId) || [];
        list.push(bookmark);
        bookmarksByNode.set(bookmark.historyNodeId, list);
      } else {
        legacyBookmarks.push(bookmark);
      }
    }

    $('snapshotCount').textContent = String(historyNodes.length + legacyBookmarks.length);
    host.innerHTML = '';

    async function prepareHistoryReplacement(reason, label = 'History navigation') {
      if (getHistoricalStepEdit()) cancelHistoricalStepEdit();
      const currentContinuation = snapshotManager.continuationContext();
      if (!currentContinuation) {
        if (!snapshotManager.syncActiveHeadState()) {
          status('Could not preserve the current Variant HEAD before navigation.', 'error');
          return false;
        }
        return true;
      }

      if (!snapshotManager.hasHistoricalWorkingEdits()) return true;
      try {
        await checkpointBeforeReplace(reason);
        return true;
      } catch (error) {
        console.error(error);
        status(`${label} cancelled: ${error.message}`, 'error');
        return false;
      }
    }

    async function switchToBranch(targetId) {
      if (
        targetId === snapshotManager.activeBranch().id &&
        !snapshotManager.continuationContext()
      ) {
        return true;
      }
      if (
        !(await prepareHistoryReplacement(
          'pre-snapshot-variant-switch',
          'Variant switch',
        ))
      ) {
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
      status(`Switched to Variant "${nextBranch.name}" HEAD.`);
      return true;
    }

    if (continuation) {
      const banner = root.createElement('div');
      banner.className = 'snapshot-continuation-banner';
      if (historyEdit) banner.dataset.editingStep = 'true';

      const copy = root.createElement('div');
      const title = root.createElement('strong');
      title.textContent = historyEdit ? 'Editing historical Step' : 'Historical state';
      const detail = root.createElement('span');
      if (historyEdit) {
        const modeText =
          historyEdit.mode === 'update-recompute'
            ? `Apply replaces this Step in "${historyEdit.branchName}" and recomputes ${historyEdit.downstreamCount} downstream Step${historyEdit.downstreamCount === 1 ? '' : 's'}.`
            : historyEdit.mode === 'branch-recompute'
              ? `Apply creates a new Variant and recomputes ${historyEdit.downstreamCount} downstream Step${historyEdit.downstreamCount === 1 ? '' : 's'}.`
              : 'Apply creates a new Variant from this edited Step without carrying downstream Steps.';
        detail.textContent = `Editing "${historyEdit.originalLabel}". ${modeText}`;
      } else {
        detail.textContent = continuation.processLabel
          ? `Viewing Step "${continuation.processLabel}". Edits stay here; a successful Apply creates a new Variant from this Step.`
          : 'Viewing an older state. Edits stay here; a successful Apply creates a new Variant.';
      }
      copy.append(title, detail);

      const returnButton = root.createElement('button');
      returnButton.type = 'button';
      returnButton.className = 'snapshot-return-head';
      returnButton.textContent = historyEdit ? 'Cancel edit' : `Return to ${activeBranch.name}`;
      returnButton.onclick = async () => {
        if (
          !(await prepareHistoryReplacement(
            'pre-snapshot-return-head',
            'Return to Variant HEAD',
          ))
        ) {
          return;
        }
        if (!snapshotManager.restoreActiveBranchHead()) {
          status('Could not restore the current Variant HEAD.', 'error');
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

    if (!historyNodes.length && !legacyBookmarks.length) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'Apply a process Step to start History.';
      host.append(empty);
      return;
    }

    function closeMenu(details) {
      if (details) details.open = false;
    }

    function createActionMenu(items, label = 'More actions') {
      const details = root.createElement('details');
      details.className = 'snapshot-more-menu';

      const summary = root.createElement('summary');
      summary.className = 'snapshot-more-trigger';
      summary.textContent = '⋯';
      summary.setAttribute('aria-label', label);
      summary.title = label;
      summary.onclick = (event) => event.stopPropagation();
      // Keyboard activation of a nested menu must not bubble into a restorable
      // History row, otherwise Enter/Space can restore the Step instead of
      // opening or using the menu.
      details.onkeydown = (event) => event.stopPropagation();

      const menu = root.createElement('div');
      menu.className = 'snapshot-more-popover';
      menu.onclick = (event) => event.stopPropagation();

      for (const item of items) {
        const button = root.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        if (item.danger) button.dataset.danger = 'true';
        if (item.disabled) button.disabled = true;
        if (item.title) button.title = item.title;
        button.onclick = async (event) => {
          event.stopPropagation();
          if (button.disabled) return;
          closeMenu(details);
          await item.run();
        };
        menu.append(button);
      }

      details.append(summary, menu);
      return details;
    }

    function createBookmarkRow(bookmark) {
      const wrap = root.createElement('div');
      wrap.className = 'snapshot-milestone-row history-bookmark-row';

      const row = root.createElement('div');
      row.className = 'snapshot-timeline-row';

      const marker = root.createElement('span');
      marker.className = 'snapshot-milestone-marker';
      marker.textContent = '★';
      marker.title = 'Bookmark';
      marker.setAttribute('aria-hidden', 'true');

      const body = root.createElement('div');
      body.className = 'snapshot-milestone-body';
      const name = root.createElement('strong');
      name.textContent = bookmark.name;
      name.title = bookmark.createdAt;
      const meta = root.createElement('span');
      meta.textContent = bookmark.legacyCheckpoint ? 'legacy saved state' : 'bookmark';
      body.append(name, meta);

      const editor = root.createElement('div');
      editor.className = 'snapshot-inline-editor';
      editor.hidden = true;
      const input = root.createElement('input');
      input.type = 'text';
      input.maxLength = 256;
      input.value = bookmark.name;
      input.setAttribute('aria-label', 'Bookmark name');
      const save = root.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      const cancel = root.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';

      const commit = () => {
        const next = input.value.trim();
        if (!next || !snapshotManager.rename(bookmark.id, next)) return;
        onProjectChanged();
        renderSnapshots();
        status(`Renamed bookmark to "${next}".`);
      };
      save.onclick = commit;
      cancel.onclick = () => {
        editor.hidden = true;
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editor.hidden = true;
        }
      };
      editor.append(input, save, cancel);

      const protectedByLegacyVariant = snapshotManager.branchesUsingSnapshot(bookmark.id);
      const bookmarkActions = [];
      if (bookmark.legacyCheckpoint) {
        bookmarkActions.push({
          label: 'Restore legacy state',
          run: async () => {
            if (
              !(await prepareHistoryReplacement(
                'pre-legacy-bookmark-restore',
                'Legacy state restore',
              ))
            ) {
              return;
            }
            if (!snapshotManager.restore(bookmark.id)) {
              status('Legacy saved state failed validation.', 'error');
              return;
            }
            refreshAfterSnapshotLoad();
            onProjectChanged();
            renderSnapshots();
            status(`Restored legacy saved state "${bookmark.name}".`);
          },
        });
      }
      bookmarkActions.push(
        {
          label: 'Rename bookmark',
          run: async () => {
            editor.hidden = false;
            input.focus();
            input.select();
          },
        },
        {
          label: 'Delete bookmark',
          danger: true,
          disabled: protectedByLegacyVariant.length > 0,
          title: protectedByLegacyVariant.length
            ? 'This legacy bookmark is still referenced by a Variant.'
            : 'Delete this bookmark label. The Step remains restorable.',
          run: async () => {
            if (!snapshotManager.remove(bookmark.id)) {
              status('This legacy bookmark is still referenced by a Variant.', 'warning');
              return;
            }
            onProjectChanged();
            renderSnapshots();
            status(`Deleted bookmark "${bookmark.name}".`);
          },
        },
      );
      const menu = createActionMenu(bookmarkActions, 'Bookmark actions');

      row.append(marker, body, menu);
      wrap.append(row, editor);
      return wrap;
    }

    async function restoreStep(node) {
      if (
        !(await prepareHistoryReplacement(
          'pre-process-history-restore',
          'Step restore',
        ))
      ) {
        return;
      }
      if (!snapshotManager.restoreProcessNode(node.id)) {
        status('This legacy Step does not contain a restorable checkpoint.', 'warning');
        return;
      }
      refreshAfterSnapshotLoad();
      onProjectChanged();
      renderSnapshots();
      status(`Restored Step "${node.operation?.label || node.operation?.kind || 'Process step'}".`);
    }

    async function createVariantFromStep(node) {
      if (
        !(await prepareHistoryReplacement(
          'pre-history-variant-create',
          'Variant creation',
        ))
      ) {
        return;
      }
      try {
        const created = snapshotManager.createBranchFromNode(node.id);
        refreshAfterSnapshotLoad();
        onProjectChanged();
        renderSnapshots();
        status(
          `Created Variant "${created.name}" from Step "${node.operation?.label || node.operation?.kind || 'Process step'}".`,
        );
      } catch (error) {
        console.error(error);
        status(`Variant creation failed: ${error.message}`, 'error');
      }
    }

    function createStepRow(node, variant) {
      const wrap = root.createElement('div');
      wrap.className = 'history-step-wrap';
      wrap.dataset.stepId = node.id;

      const row = root.createElement('div');
      row.className = 'process-history-row history-step-row';
      const isVariantHead = node.id === variant.headNodeId;
      const isCursor = position.nodeId === node.id && position.branchId === activeBranch.id;
      if (isVariantHead) row.dataset.head = 'true';
      if (isCursor) row.dataset.cursor = 'true';

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
      meta.textContent = [
        face,
        area,
        `r${node.processRevision}`,
        !node.restorable ? 'legacy · unavailable' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      body.append(label, meta);

      const actions = [];
      if (node.restorable) {
        const editContext = snapshotManager.stepEditContext(node.id);
        actions.push({
          label: 'Edit Step…',
          disabled: !node.replayable || !editContext?.editable,
          title: !node.replayable
            ? 'This Step predates replay metadata and cannot be deterministically recalculated.'
            : !editContext?.editable
              ? editContext?.reason || 'This Step cannot be edited in place.'
              : 'Edit this Step and choose how downstream process history should be handled.',
          run: () => beginHistoricalStepEdit(node),
        });
        actions.push({
          label: 'Variant from here',
          run: () => createVariantFromStep(node),
        });
        actions.push({
          label: 'Add bookmark',
          run: async () => {
            try {
              const bookmark = snapshotManager.bookmarkStep(node.id);
              onProjectChanged();
              renderSnapshots();
              status(`Bookmarked Step as "${bookmark.name}".`);
            } catch (error) {
              console.error(error);
              status(`Bookmark failed: ${error.message}`, 'error');
            }
          },
        });
      }
      const menu = actions.length ? createActionMenu(actions, 'Step actions') : null;

      row.append(marker, body);
      if (menu) row.append(menu);

      if (node.restorable) {
        row.classList.add('is-restorable');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `Restore Step ${label.textContent}`);
        row.title = 'Restore this Step';
        row.onclick = () => void restoreStep(node);
        row.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          void restoreStep(node);
        };
      } else {
        row.classList.add('is-unavailable');
        row.title = 'This legacy Step was saved without a restorable checkpoint.';
      }

      wrap.append(row);
      for (const bookmark of bookmarksByNode.get(node.id) || []) {
        wrap.append(createBookmarkRow(bookmark));
      }
      return wrap;
    }

    function ownNodesForVariant(variant) {
      const result = [];
      const seen = new Set();
      let nodeId = variant.headNodeId;
      while (nodeId && !seen.has(nodeId)) {
        seen.add(nodeId);
        if (variant.id !== 'main' && nodeId === variant.rootNodeId) break;
        const node = nodeById.get(nodeId);
        if (!node) break;
        if (node.branchId === variant.id) result.push(node);
        nodeId = node.parentId;
      }
      return result.reverse();
    }

    const childrenByOrigin = new Map();
    const rootChildrenByVariant = new Map();
    for (const variant of branches) {
      if (variant.id === 'main') continue;
      const parentId = variant.parentBranchId || 'main';
      if (variant.rootNodeId) {
        const key = `${parentId}::${variant.rootNodeId}`;
        const list = childrenByOrigin.get(key) || [];
        list.push(variant);
        childrenByOrigin.set(key, list);
      } else {
        const list = rootChildrenByVariant.get(parentId) || [];
        list.push(variant);
        rootChildrenByVariant.set(parentId, list);
      }
    }
    for (const list of [...childrenByOrigin.values(), ...rootChildrenByVariant.values()]) {
      list.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    }

    const activePath = new Set();
    let pathId = activeBranch.id;
    while (pathId && !activePath.has(pathId)) {
      activePath.add(pathId);
      pathId = branchById.get(pathId)?.parentBranchId || null;
    }

    const renderedVariants = new Set();

    function createVariantHeader(variant, depth) {
      const header = root.createElement('div');
      header.className = 'history-variant-head';

      const toggle = root.createElement('button');
      toggle.type = 'button';
      toggle.className = 'history-variant-toggle';
      toggle.setAttribute('aria-label', `Collapse or expand ${variant.name}`);

      const nameButton = root.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'history-variant-name';
      nameButton.textContent = variant.name;
      nameButton.title = `Switch to ${variant.name} HEAD`;
      nameButton.onclick = (event) => {
        event.stopPropagation();
        void switchToBranch(variant.id);
      };

      const stats = root.createElement('span');
      stats.className = 'history-variant-stats';
      stats.textContent = `${variant.processStepCount} step${variant.processStepCount === 1 ? '' : 's'}`;

      const renameButton = root.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'history-variant-rename-trigger';
      renameButton.textContent = '✎';
      renameButton.title = 'Rename Variant';
      renameButton.setAttribute('aria-label', `Rename ${variant.name}`);

      const editor = root.createElement('div');
      editor.className = 'snapshot-inline-editor history-variant-editor';
      editor.hidden = true;
      const input = root.createElement('input');
      input.type = 'text';
      input.maxLength = 256;
      input.value = variant.name;
      input.setAttribute('aria-label', 'Variant name');
      const save = root.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      const cancel = root.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      const commit = () => {
        const next = input.value.trim();
        if (!next || !snapshotManager.renameBranch(variant.id, next)) return;
        onProjectChanged();
        renderSnapshots();
        status(`Renamed Variant to "${snapshotManager.listBranches().find((item) => item.id === variant.id)?.name || next}".`);
      };
      save.onclick = commit;
      cancel.onclick = () => {
        editor.hidden = true;
      };
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editor.hidden = true;
        }
      };
      editor.append(input, save, cancel);
      renameButton.onclick = (event) => {
        event.stopPropagation();
        editor.hidden = false;
        input.focus();
        input.select();
      };
      nameButton.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.hidden = false;
        input.focus();
        input.select();
      };

      const menuItems = [];
      if (variant.id !== 'main') {
        menuItems.push({
          label: 'Delete Variant',
          danger: true,
          run: async () => {
            const confirmed = await confirmAction({
              title: 'Delete Variant?',
              message: `Delete "${variant.name}" and its private Steps?`,
              detail: 'Child Variants must be deleted first. The origin Step is preserved.',
              confirmLabel: 'Delete Variant',
              danger: true,
            });
            if (!confirmed) return;
            try {
              await checkpointBeforeReplace('pre-history-variant-delete');
              const removed = snapshotManager.removeBranch(variant.id);
              if (!removed) throw new Error('Variant was not found.');
              refreshAfterSnapshotLoad();
              onProjectChanged();
              renderSnapshots();
              status(`Deleted Variant "${removed.name}".`);
            } catch (error) {
              console.error(error);
              status(`Variant deletion failed: ${error.message}`, 'error');
            }
          },
        });
      }
      const menu = menuItems.length
        ? createActionMenu(menuItems, 'Variant actions')
        : null;

      header.append(toggle, nameButton, stats, renameButton);
      if (menu) header.append(menu);
      return { header, toggle, editor };
    }

    function renderVariant(variant, depth = 0) {
      if (!variant || renderedVariants.has(variant.id)) return null;
      renderedVariants.add(variant.id);

      const section = root.createElement('section');
      section.className = 'snapshot-branch-group history-variant';
      section.dataset.variantId = variant.id;
      section.style.setProperty('--history-depth', String(depth));
      if (variant.id === activeBranch.id) section.dataset.active = 'true';
      if (activePath.has(variant.id)) section.dataset.activePath = 'true';

      const { header, toggle, editor } = createVariantHeader(variant, depth);
      const body = root.createElement('div');
      body.className = 'history-variant-body';

      const collapsed =
        !activePath.has(variant.id) && !expandedHistoryVariants.has(variant.id);
      body.hidden = collapsed;
      toggle.textContent = collapsed ? '▸' : '▾';
      toggle.onclick = () => {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? '▸' : '▾';
        if (body.hidden) expandedHistoryVariants.delete(variant.id);
        else expandedHistoryVariants.add(variant.id);
      };

      section.append(header, editor, body);

      for (const child of rootChildrenByVariant.get(variant.id) || []) {
        const childTree = renderVariant(child, depth + 1);
        if (childTree) body.append(childTree);
      }

      const ownNodes = ownNodesForVariant(variant);
      const ownNodeIds = new Set(ownNodes.map((node) => node.id));
      for (const node of ownNodes) {
        body.append(createStepRow(node, variant));
        const key = `${variant.id}::${node.id}`;
        for (const child of childrenByOrigin.get(key) || []) {
          const childTree = renderVariant(child, depth + 1);
          if (childTree) body.append(childTree);
        }
      }

      const unplacedChildren = branches.filter(
        (child) =>
          child.id !== variant.id &&
          child.parentBranchId === variant.id &&
          child.rootNodeId &&
          !ownNodeIds.has(child.rootNodeId) &&
          !renderedVariants.has(child.id),
      );
      for (const child of unplacedChildren) {
        const childTree = renderVariant(child, depth + 1);
        if (childTree) body.append(childTree);
      }

      if (!body.children.length) {
        const empty = root.createElement('div');
        empty.className = 'snapshot-branch-empty';
        empty.textContent =
          variant.id === 'main'
            ? 'No Steps yet.'
            : 'Variant ready. The next successful Apply creates its first Step.';
        body.append(empty);
      }

      return section;
    }

    const mainVariant = branchById.get('main') || branches[0];
    const tree = root.createElement('div');
    tree.className = 'history-tree-root';
    const mainTree = renderVariant(mainVariant, 0);
    if (mainTree) tree.append(mainTree);

    for (const variant of branches) {
      if (renderedVariants.has(variant.id)) continue;
      const orphan = renderVariant(variant, 0);
      if (orphan) {
        orphan.dataset.orphan = 'true';
        tree.append(orphan);
      }
    }
    host.append(tree);

    if (legacyBookmarks.length) {
      const legacy = root.createElement('details');
      legacy.className = 'history-legacy-bookmarks';
      const summary = root.createElement('summary');
      summary.textContent = `Legacy bookmarks (${legacyBookmarks.length})`;
      const list = root.createElement('div');
      list.className = 'history-legacy-bookmark-list';
      for (const bookmark of legacyBookmarks) {
        const row = createBookmarkRow(bookmark);
        const restore = root.createElement('button');
        restore.type = 'button';
        restore.className = 'compact-btn history-legacy-restore';
        restore.textContent = 'Restore';
        restore.onclick = async () => {
          if (
            !(await prepareHistoryReplacement(
              'pre-legacy-bookmark-restore',
              'Legacy bookmark restore',
            ))
          ) {
            return;
          }
          if (!snapshotManager.restore(bookmark.id)) {
            status('Legacy bookmark restore failed validation.', 'error');
            return;
          }
          refreshAfterSnapshotLoad();
          onProjectChanged();
          renderSnapshots();
          status(`Restored legacy bookmark "${bookmark.name}".`);
        };
        row.append(restore);
        list.append(row);
      }
      legacy.append(summary, list);
      host.append(legacy);
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
      cancelHistoricalStepEdit();
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

  async function openBundledExample(exampleId) {
    const example = bundledExampleById(exampleId);
    if (!example || example.kind !== 'project' || !example.path) {
      status('Bundled example was not found.', 'error');
      return false;
    }

    try {
      status(`Loading ${example.title}…`);
      const response = await fetch(example.path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer(),
        file = new File([arrayBuffer], example.filename, { type: 'application/json' });
      return await openProjectFile(file);
    } catch (error) {
      console.error(error);
      status(`Example failed: ${error.message}`, 'error');
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
        cancelHistoricalStepEdit();
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
    openBundledExample,
  };
}
