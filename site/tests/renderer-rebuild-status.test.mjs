import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRendererBuildFailure,
  describeRendererBuildFailure,
  setRendererBuildFailure,
} from '../renderer-rebuild-status.js';

test('bounded array ROI rejection has an explicit recoverable 3D error state', () => {
  const host = { dataset: { renderState: 'building', renderPhase: 'assembly' } };
  const stats = { textContent: 'rebuilding 3D…' };
  const error = new Error(
    'The requested array area exceeds the bounded geometry point budget. Reduce the process or inspection area.',
  );
  const result = setRendererBuildFailure(host, stats, error, { roi: true });

  assert.equal(result.code, 'geometry-point-budget');
  assert.equal(host.dataset.renderState, 'error');
  assert.equal(host.dataset.renderPhase, 'failed');
  assert.equal(host.dataset.rendererErrorCode, 'geometry-point-budget');
  assert.match(host.dataset.renderError, /bounded geometry point budget/);
  assert.match(stats.textContent, /reduce or clear ROI/);
  clearRendererBuildFailure(host);
  assert.equal(host.dataset.renderError, undefined);
  assert.equal(host.dataset.rendererErrorCode, undefined);
  // State is deliberately controlled by the renderer: clearing error metadata
  // alone must not pretend that a new valid WebGL frame has completed.
  assert.equal(host.dataset.renderState, 'error');
});

test('unexpected render failures retain a diagnostic without suppressing the budget guard', () => {
  const host = { dataset: {} };
  const stats = { textContent: '' };
  const result = setRendererBuildFailure(host, stats, new Error('shader compilation failed'));
  assert.equal(result.code, 'build-failed');
  assert.equal(host.dataset.renderPhase, 'failed');
  assert.match(stats.textContent, /3D rendering failed/);
  assert.match(host.dataset.renderError, /shader compilation failed/);
});

test('bounded point guard stays visible for non-ROI render failures', () => {
  const described = describeRendererBuildFailure(
    new Error('The requested array area exceeds the bounded geometry point budget.'),
    { roi: false },
  );
  assert.equal(described.code, 'geometry-point-budget');
  assert.doesNotMatch(described.label, /reduce or clear ROI/);
});
