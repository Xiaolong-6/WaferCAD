import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStatusMessage } from '../controllers/feedback-controller.js';

test('No-change Process warnings retain their semantic severity', () => {
  assert.equal(classifyStatusMessage('The selected process area is empty.'), 'warning');
  assert.equal(classifyStatusMessage('The operation did not change the model.'), 'warning');
  assert.equal(classifyStatusMessage('The selected material is not exposed.'), 'warning');
  assert.equal(classifyStatusMessage('Process execution failed.'), 'error');
  assert.equal(classifyStatusMessage('Process step applied.'), 'success');
});
