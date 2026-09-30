import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
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
});

test('footer exposes repository and exact deployed commit links', () => {
  const repoLink = html.indexOf('href="https://github.com/Xiaolong-6/WaferCAD"');
  const commitLink = html.indexOf('id="buildCommit"');
  assert.ok(repoLink >= 0 && commitLink > repoLink);
  assert.match(
    buildController,
    /repositoryUrl = 'https:\/\/github\.com\/Xiaolong-6\/WaferCAD'/,
  );
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
