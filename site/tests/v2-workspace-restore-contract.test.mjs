// Preserve native-v2/Recovery integrity assertions after retiring Legacy Settings.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [controller, workflow, persistence] = await Promise.all([
  read('controllers/workspace-persistence-controller.js'),
  read('ui-v2/workstation-workflow.js'),
  read('workspace-persistence.js'),
]);

test('v2 uses progressive worker-backed workspace restore with safe fallback', () => {
  const progressiveLoad = /loadWorkspaceState\(\{ background: progressiveWorkspaceRestore \}\)/;
  const workerFallback = /!background \|\| typeof globalThis\.Worker !== 'function'/;
  assert.match(controller, /progressiveWorkspaceRestore = false/);
  assert.match(controller, progressiveLoad);
  assert.match(persistence, workerFallback);
  assert.match(workflow, /progressiveWorkspaceRestore: true/);
});

test('workspace and Recovery reads avoid redundant whole-project cloning', () => {
  const directReads = persistence.match(/const project = record\.project;/g) || [];
  const redundantClone = /const project = structuredClone\(record\.project\)/;
  assert.equal(directReads.length, 2);
  assert.doesNotMatch(persistence, redundantClone);
  assert.match(persistence, /validateProjectFile\(migrateProjectFile\(project\)\)/);
  assert.match(persistence, /prepareProjectForWorkspaceStorage\(project\)/);
  assert.match(persistence, /expandProjectStorage\(project\)/);
});
