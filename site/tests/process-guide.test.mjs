import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROCESS_GUIDE, processGuideEntry, processGuideKey } from '../process-guide.js';
import { processGuideSvg } from '../process-guide-svg.js';
import { processOperationsMarkdown } from '../../scripts/build-process-guide.mjs';

test('every Process variant has distinct catalog metadata and a valid diagram', () => {
  assert.equal(PROCESS_GUIDE.length, 18);
  assert.equal(new Set(PROCESS_GUIDE.map((entry) => entry.id)).size, PROCESS_GUIDE.length);
  for (const entry of PROCESS_GUIDE) {
    assert.strictEqual(processGuideEntry(entry.id), entry);
    for (const field of [
      'title',
      'family',
      'summary',
      'detail',
      'parameters',
      'limits',
      'example',
      'effect',
    ]) {
      assert.ok(entry[field], entry.id + ' missing ' + field);
    }
    for (const after of [false, true]) {
      const svg = processGuideSvg(entry.id, after);
      assert.match(svg, /^<svg\b/);
      assert.match(svg, /<\/svg>$/);
      assert.ok(svg.includes('viewBox="0 0 220 124"'));
    }
  }
});

test('all current manual selector combinations resolve to intended operation diagrams', () => {
  const cases = [
    [{ type: 'add', growth: 'direct' }, 'deposit-directional'],
    [{ type: 'add', growth: 'conformal' }, 'deposit-conformal'],
    [{ type: 'add', growth: 'transfer', placement: 'follow' }, 'deposit-transfer-follow'],
    [{ type: 'add', growth: 'transfer', placement: 'flat' }, 'deposit-transfer-flat'],
    [{ type: 'grow', growth: 'direct' }, 'extend-directional'],
    [{ type: 'grow', growth: 'conformal' }, 'extend-conformal'],
    [{ type: 'etch', profile: 'directional', surface: 'smooth' }, 'etch-directional'],
    [
      { type: 'etch', profile: 'directional', surface: 'smooth', targetMaterial: true },
      'etch-selective',
    ],
    [{ type: 'etch', profile: 'isotropic' }, 'etch-isotropic'],
    [{ type: 'etch', profile: 'undercut' }, 'etch-undercut'],
    [{ type: 'etch', profile: 'planarize' }, 'etch-planarize'],
    [{ type: 'etch', surface: 'rough', polarity: 'normal' }, 'etch-rough-normal'],
    [{ type: 'etch', surface: 'rough', polarity: 'inverted' }, 'etch-rough-inverted'],
    [{ type: 'etch', surface: 'pyramid', polarity: 'normal' }, 'etch-pyramid-normal'],
    [{ type: 'etch', surface: 'pyramid', polarity: 'inverted' }, 'etch-pyramid-inverted'],
    [{ type: 'implant' }, 'implant'],
    [{ type: 'electrical' }, 'electrical'],
    [{ type: 'record' }, 'record'],
  ];
  assert.deepEqual(
    new Set(cases.map(([input]) => processGuideKey(input))),
    new Set(PROCESS_GUIDE.map((entry) => entry.id)),
  );
  for (const [state, id] of cases) assert.equal(processGuideKey(state), id);
});

test('generated Wiki operation documentation is identical to current Process catalog', async () => {
  const tracked = await readFile(
    new URL('../../docs/wiki/Process-Operations.md', import.meta.url),
    'utf8',
  );
  assert.equal(tracked, processOperationsMarkdown());
  for (const entry of PROCESS_GUIDE) {
    assert.ok(tracked.includes('<a id="' + entry.id + '"></a>'));
    assert.ok(tracked.includes(entry.summary));
  }
});

test('both product manual entry points and the inline guide are wired', async () => {
  const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
  const guide = await readFile(new URL('../guide/index.html', import.meta.url), 'utf8');
  const panel = await readFile(
    new URL('../controllers/process-panel-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(html, /id="processVisualGuide"/);
  assert.match(html, /id="processGuideLink"/);
  assert.match(panel, /processGuideKey\(/);
  assert.match(panel, /processGuideSvg\(/);
  assert.match(guide, /process-guide\.js/);
  assert.match(guide, /process-guide-svg\.js/);
});
