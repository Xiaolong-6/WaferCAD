// Retain the v2/Recovery data-integrity assertions formerly mixed into
// Legacy-only Settings UI DOM tests. Source retirement must not retire them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [controller, workflow, persistence] = await Promise.all([
  readFile(new URL('../controllers/workspace-persistence-controller.js', import.meta.url), 'utf8'),
  readFile(new URL('../ui-v2/workstation-workflow.js', import.meta.url), 'utf8'),
  readFile(new URL('../workspace-persistence.js', import.meta.url), 'utf8'),
]);

test('v2 uses progressive worker-backed workspace restore with safe fallback', () => {
  assert.match(controller, /progressiveWorkspaceRestore = false/);
  assert.match(
    controller,
    /loadWorkspaceState\(\{ background: progressiveWorkspaceRestore \}\)/,
  );
  assert.match(persistence, /!background \|\| typeof globalThis\.Worker !== 'function'/);
  assert.match(workflow, /progressiveWorkspaceRestore: true/);
});

test('workspace and Recovery reads avoid redundant whole-project cloning', () => {
  assert.equal((persistence.match(/const project = record\.project;/g) || []).length, 2);
  assert.doesNotMatch(persistence, /const project = structuredClone\(record\.project\)/);
  assert.match(persistence, /validateProjectFile\(migrateProjectFile\(project\)\)/);
  assert.match(persistence, /prepareProjectForWorkspaceStorage\(project\)/);
  assert.match(persistence, /expandProjectStorage\(project\)/);
});
