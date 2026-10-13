import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { renderHistoricalSectionSvg } = await import('../report-section-svg.js');

function sample() {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
  const state = { model, section: { a: [-9, 0], b: [9, 0] } };
  return state;
}

test('historical SVG derives actual physical X/Z coordinates from canonical Section slices', () => {
  const state = sample();
  const original = structuredClone(state);
  const rendered = renderHistoricalSectionSvg({ state, nodeId: 'process-base' });
  const e = rendered.evidence;
  assert.equal(e.nodeId, 'process-base');
  assert.equal(e.lineLengthUm, 18);
  assert.equal(e.zMinUm, -5);
  assert.equal(e.zMaxUm, 5);
  assert.equal(e.physicalSliceCount, 1);
  assert.deepEqual(e.layerIds, ['base']);
  assert.equal(e.zBreak, false);
  assert.equal(e.geometrySynthesized, false);
  assert.equal(e.stateOrigin, 'caller-supplied-isolated-state');
  assert.equal(e.provenanceVerified, false);
  assert.ok(Math.abs(e.pixelsPerUm * 10 - (480 - 64)) < 1e-8);
  assert.match(rendered.svg, /data-layer-id="base"/);
  assert.doesNotMatch(rendered.svg, /<script/i);
  assert.deepEqual(state, original, 'SVG generation must not mutate historical model or Section');
  assert.deepEqual(
    renderHistoricalSectionSvg({ state, nodeId: 'process-base' }),
    rendered,
    'Identical saved states must render deterministic offline SVG',
  );
});

test('Both-face independent Layer IDs remain distinguishable in historical Section', () => {
  const state = sample();
  state.model.layers.push(
    { id: 'front-oxide', name: 'SiO2', color: '#aabbcc' },
    { id: 'back-oxide', name: 'SiO2', color: '#bbccdd' },
  );
  state.model.regions[0].stack = [
    { layerId: 'back-oxide', z0: -6, z1: -5 },
    { layerId: 'base', z0: -5, z1: 5 },
    { layerId: 'front-oxide', z0: 5, z1: 6 },
  ];
  const { svg, evidence } = renderHistoricalSectionSvg({ state, nodeId: 'process-both' });
  assert.equal(evidence.zMinUm, -6);
  assert.equal(evidence.zMaxUm, 6);
  assert.equal(evidence.physicalSliceCount, 3);
  assert.deepEqual(evidence.layerIds.sort(), ['back-oxide', 'base', 'front-oxide'].sort());
  assert.match(svg, /data-layer-id="front-oxide"/);
  assert.match(svg, /data-layer-id="back-oxide"/);
  assert.ok(Math.abs(evidence.pixelsPerUm * 12 - (480 - 64)) < 1e-9);
});

test('no historical state, invalid section, missing Layer, and unsafe viewport fail explicitly', () => {
  const state = sample();
  assert.throws(() => renderHistoricalSectionSvg({ nodeId: 'missing' }), /model and A–B/);
  assert.throws(() => renderHistoricalSectionSvg({ state, nodeId: '' }), /stable History node ID/);
  assert.throws(
    () =>
      renderHistoricalSectionSvg({
        state: { ...state, section: { a: [1, 1], b: [1, 1] } },
        nodeId: 'node',
      }),
    /degenerate/,
  );
  assert.throws(() => renderHistoricalSectionSvg({ state, nodeId: 'node', width: 12 }), /viewport/);
  assert.throws(
    () => renderHistoricalSectionSvg({ state, nodeId: 'node', maxSlices: 0 }),
    /slice limit/,
  );
  assert.throws(
    () => renderHistoricalSectionSvg({ state, nodeId: 'node', maxSlices: 1.5 }),
    /slice limit/,
  );
  const twoSlices = sample();
  twoSlices.model.layers.push({ id: 'film', name: 'Film', color: '#aabbcc' });
  twoSlices.model.regions[0].stack.push({ layerId: 'film', z0: 5, z1: 6 });
  assert.throws(
    () => renderHistoricalSectionSvg({ state: twoSlices, nodeId: 'node', maxSlices: 1 }),
    /slice limit/,
  );
  const invalid = sample();
  invalid.model.regions[0].stack[0].layerId = 'deleted-layer';
  assert.throws(
    () => renderHistoricalSectionSvg({ state: invalid, nodeId: 'node' }),
    /unknown material Layer ID/,
  );
});

test('SVG metadata and material IDs are escaped, colors never become executable markup', () => {
  const state = sample();
  state.model.layers[0].color = 'red" onload="alert(1)';
  const output = renderHistoricalSectionSvg({ state, nodeId: '<unsafe>&"node' });
  assert.ok(output.svg.includes('&lt;unsafe&gt;&amp;&quot;node'));
  assert.match(output.svg, /fill="#8896a6"/);
  assert.doesNotMatch(output.svg, /onload/);
});
