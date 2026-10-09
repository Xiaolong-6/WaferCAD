import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIntelligentCommands } from '../intelligent-ui.js';

test('quick actions expose the core workspace and view destinations', () => {
  const all = filterIntelligentCommands('');
  assert.equal(all.length, 10);
  assert.deepEqual(
    all.filter((item) => item.tool).map((item) => item.tool),
    ['project', 'base', 'mask', 'process', 'snapshots'],
  );
  assert.deepEqual(
    all.filter((item) => item.view).map((item) => item.view),
    ['overview', 'main', 'mask', 'three', 'split'],
  );
});

test('quick actions search label and context, matching every query word', () => {
  assert.deepEqual(filterIntelligentCommands('history').map((item) => item.id), ['history']);
  assert.deepEqual(filterIntelligentCommands('3D').map((item) => item.id), ['overview', 'three']);
  assert.deepEqual(filterIntelligentCommands('WORKSPACE recovery').map((item) => item.id), ['project']);
  assert.deepEqual(filterIntelligentCommands('no-such-action'), []);
});

test('quick actions leave the canonical command list unchanged', () => {
  const first = filterIntelligentCommands('');
  first.pop();
  assert.equal(filterIntelligentCommands('').length, 10);
});
