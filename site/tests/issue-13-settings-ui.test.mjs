import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const persistence = await readFile(new URL('../workspace-persistence.js', import.meta.url), 'utf8');
const workspacePersistenceController = await readFile(
  new URL('../controllers/workspace-persistence-controller.js', import.meta.url),
  'utf8',
);
const workspaceSessionController = await readFile(
  new URL('../controllers/workspace-session-controller.js', import.meta.url),
  'utf8',
);
const buildController = await readFile(
  new URL('../controllers/build-controller.js', import.meta.url),
  'utf8',
);
const projectController = await readFile(
  new URL('../controllers/project-controller.js', import.meta.url),
  'utf8',
);

test('Project is the first and default workspace tab and owns the XYZ unit selector', () => {
  assert.ok(html.indexOf('id="settingsTab"') < html.indexOf('id="baseTab"'));
  assert.match(html, /id="settingsTab"[\s\S]*?class="tool-tab active"[\s\S]*?aria-selected="true"/);
  assert.match(html, /id="baseTools"[\s\S]*?data-tab-panel="base"[\s\S]*?hidden/);
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.doesNotMatch(header, /id="xyUnitSelect"/);
  const settings = html.slice(
    html.indexOf('id="settingsTools"'),
    html.indexOf('</section>', html.indexOf('id="settingsTools"')),
  );
  assert.match(settings, /id="xyUnitSelect"/);
  assert.match(settings, /id="projectNameInput"/);
});

test('project replacement controls warn, Save is local, and Export downloads the project file', () => {
  assert.match(projectController, /New project will replace the current workspace/);
  assert.match(projectController, /Open project will replace the current workspace/);
  assert.match(workspacePersistenceController, /manual-save · \$\{projectName\}/);
  assert.match(workspacePersistenceController, /createWorkspaceRecoveryCheckpoint\(project/);
  assert.match(projectController, /\$\('exportProjectBtn'\)\.onclick/);
  assert.match(projectController, /exportProjectFileTask/);
  assert.match(app, /project-export-worker\.js/);
  assert.match(projectController, /\.wafercad/);
});

test('workspace state is restored locally after app reload', () => {
  assert.match(workspacePersistenceController, /loadWorkspaceState\(\)/);
  assert.match(workspacePersistenceController, /saveWorkspaceState\([\s\S]*canCommit/);
  assert.match(workspaceSessionController, /hasWriteLease/);
  assert.match(persistence, /const DB_VERSION = 2/);
  assert.match(persistence, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(persistence, /META_STORE_NAME = 'workspace-metadata'/);
  assert.match(persistence, /createWorkspaceRecoveryCheckpoint/);
  assert.match(persistence, /pre-migration-v/);
  assert.match(persistence, /const project = structuredClone\(record\.project\)/);
  assert.match(persistence, /validateProjectFile\(migrateProjectFile\(project\)\)/);
  assert.match(persistence, /prepareProjectForWorkspaceStorage\(project\)/);
  assert.match(persistence, /expandProjectStorage\(project\)/);
});

test('workspace safety UI exposes local save state, recovery, and safe reload', () => {
  for (const id of [
    'workspaceSaveStatus',
    'safeReloadBtn',
    'workspaceConflictDialog',
    'workspaceTakeOverBtn',
    'workspaceRecoverySelect',
    'workspaceRestoreBtn',
    'workspaceRecoveryClearBtn',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(workspacePersistenceController, /createWorkspaceRecoveryCheckpoint/);
  assert.match(workspacePersistenceController, /clearWorkspaceRecoveryPoints/);
  assert.match(persistence, /export async function clearWorkspaceRecoveryPoints/);
  assert.match(app, /workspaceSession\.start\(\)/);
  assert.match(workspacePersistenceController, /globalThis\.location\.reload\(\)/);
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
    'exportProjectBtn',
    'workspaceRecoveryClearBtn',
    'mainZoomOut',
    'mainZoomIn',
    'mainZoomFit',
    'maskZoomFit',
    'fit3dBtn',
  ]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*title="`));
  }
});
