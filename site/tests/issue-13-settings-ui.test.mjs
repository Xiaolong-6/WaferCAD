import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const persistence = await readFile(new URL('../workspace-persistence.js', import.meta.url), 'utf8');
const buildController = await readFile(
  new URL('../controllers/build-controller.js', import.meta.url),
  'utf8',
);

test('Settings is the final workspace tab and owns the XYZ unit selector', () => {
  assert.ok(html.indexOf('id="settingsTab"') > html.indexOf('id="snapshotsTab"'));
  assert.ok(html.indexOf('id="settingsTools"') > html.indexOf('id="snapshotsTools"'));
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.doesNotMatch(header, /id="xyUnitSelect"/);
  const settings = html.slice(
    html.indexOf('id="settingsTools"'),
    html.indexOf('</section>', html.indexOf('id="settingsTools"')),
  );
  assert.match(settings, /id="xyUnitSelect"/);
  assert.match(settings, /id="projectNameInput"/);
});

test('project replacement controls warn and Save uses the project name', () => {
  assert.match(app, /New project will replace the current workspace/);
  assert.match(app, /Open project will replace the current workspace/);
  assert.match(app, /downloadProject\(buildProjectSnapshot\(true\), projectExportFilename\(\)\)/);
  assert.match(app, /\.wafercad/);
});

test('workspace state is restored locally after app reload', () => {
  assert.match(app, /loadWorkspaceState\(\)/);
  assert.match(app, /saveWorkspaceState\(project, \{ appCommit: loadedBuildVersion \}\)/);
  assert.match(persistence, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(persistence, /createWorkspaceRecoveryCheckpoint/);
  assert.match(persistence, /pre-migration-v/);
  assert.match(persistence, /validateProjectFile\(migrateProjectFile\(record\.project\)\)/);
});

test('workspace safety UI exposes local save state, recovery, and safe reload', () => {
  for (const id of [
    'workspaceSaveStatus',
    'safeReloadBtn',
    'workspaceConflictDialog',
    'workspaceTakeOverBtn',
    'workspaceRecoverySelect',
    'workspaceRestoreBtn',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /createWorkspaceRecoveryCheckpoint/);
  assert.match(app, /workspaceSession\.start\(\)/);
  assert.match(app, /globalThis\.location\.reload\(\)/);
});

test('footer exposes repository and exact deployed commit links', () => {
  const repoLink = html.indexOf('href="https://github.com/Xiaolong-6/WaferCAD"');
  const commitLink = html.indexOf('id="buildCommit"');
  assert.ok(repoLink >= 0 && commitLink > repoLink);
  assert.match(buildController, /repositoryUrl = 'https:\/\/github\.com\/Xiaolong-6\/WaferCAD'/);
  assert.match(buildController, /host\.href = `\$\{repositoryUrl\}\/commit\/\$\{commit\}`/);
});

test('compact controls include concise hover tooltips', () => {
  for (const id of [
    'newProjectBtn',
    'saveProjectBtn',
    'mainZoomOut',
    'mainZoomIn',
    'mainZoomFit',
    'maskZoomFit',
    'fit3dBtn',
  ]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*title="`));
  }
});
