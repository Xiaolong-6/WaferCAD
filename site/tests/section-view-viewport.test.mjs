import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeSectionViewport,
  sectionViewportMap,
  sectionViewportUnmap,
  panSectionViewport,
  zoomSectionViewportAt,
} from '../section-view-viewport.js';

test('Section default transform is identity and finite', () => {
  const view = normalizeSectionViewport();
  assert.deepEqual(view, { zoom: 1, panX: 0, panY: 0 });
  for (const [extent, value] of [
    [600, 0],
    [600, 125.25],
    [960, 782],
  ]) {
    assert.equal(sectionViewportMap(value, extent, 0, 1), value);
    assert.equal(sectionViewportUnmap(value, extent, 0, 1), value);
  }
});

test('Section Pan shifts both axes in pixels without changing zoom or source', () => {
  const source = { zoom: 1.3, panX: 2, panY: -4 };
  const next = panSectionViewport(source, 24, -12);
  assert.deepEqual(next, { zoom: 1.3, panX: 26, panY: -16 });
  assert.deepEqual(source, { zoom: 1.3, panX: 2, panY: -4 });
});

test('Section anchored zoom round-trips independent X and Z screen mapping', () => {
  const source = { zoom: 1.4, panX: -30, panY: 12 };
  const width = 840,
    height = 500,
    anchorX = 281,
    anchorY = 104;
  const originalX = sectionViewportUnmap(anchorX, width, source.panX, source.zoom);
  const originalY = sectionViewportUnmap(anchorY, height, source.panY, source.zoom);
  const changed = zoomSectionViewportAt(source, 1.25, anchorX, anchorY, width, height);
  assert.ok(
    Math.abs(sectionViewportMap(originalX, width, changed.panX, changed.zoom) - anchorX) < 1e-10,
  );
  assert.ok(
    Math.abs(sectionViewportMap(originalY, height, changed.panY, changed.zoom) - anchorY) < 1e-10,
  );
  assert.ok(Math.abs(changed.zoom - source.zoom * 1.25) < 1e-10);
  const restored = zoomSectionViewportAt(changed, 0.8, anchorX, anchorY, width, height);
  assert.ok(Math.abs(restored.panX - source.panX) < 1e-10);
  assert.ok(Math.abs(restored.panY - source.panY) < 1e-10);
  assert.ok(Math.abs(restored.zoom - source.zoom) < 1e-10);
});

test('Section screen transform scales both physical X and Z equally', () => {
  const v = normalizeSectionViewport({ zoom: 2, panX: 33, panY: -71 });
  const x =
    sectionViewportMap(432, 700, v.panX, v.zoom) - sectionViewportMap(401, 700, v.panX, v.zoom);
  const z =
    sectionViewportMap(220, 520, v.panY, v.zoom) - sectionViewportMap(189, 520, v.panY, v.zoom);
  assert.ok(Math.abs(x - z) < 1e-10);
  assert.ok(Math.abs(x - 62) < 1e-10);
});

test('Section view state clamps invalid or extreme user input', () => {
  const value = normalizeSectionViewport({ zoom: Infinity, panX: NaN, panY: 1e99 });
  assert.equal(value.zoom, 1);
  assert.equal(value.panX, 0);
  assert.equal(value.panY, 100000);
  assert.equal(zoomSectionViewportAt({ zoom: 32 }, 2, 50, 50, 100, 100).zoom, 32);
  assert.equal(zoomSectionViewportAt({ zoom: 0.25 }, 0.1, 50, 50, 100, 100).zoom, 0.25);
});
