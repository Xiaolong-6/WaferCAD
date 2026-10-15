import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_LAYOUT_DEFAULTS, VIEW_LAYOUT_TEMPLATES, resolveTemplate,
  templateOptions, templateById, templateFits,
} from '../ui-v2/view-layout-templates.js';
import {
  DOCKABLE_VIEWS, createDesktopLayout, normalizeDesktopLayout, reduceDesktopLayout,
  orderedVisible, displayedViews, isOverview, activeTracks, projectDesktopLayout, desktopDockingEnabled,
} from '../ui-v2/view-layout-model.js';
import {
  loadDesktopLayout, saveDesktopLayout, DESKTOP_LAYOUT_STORAGE_KEY,
} from '../ui-v2/view-layout-storage.js';

const apply = (state, type, fields = {}) => reduceDesktopLayout(state, { type, ...fields });

test('desktop templates cover every slot exactly as a rectangle', () => {
  assert.deepEqual([1, 2, 3, 4].map((count) => templateOptions(count).length), [1, 4, 6, 8]);
  for (const template of VIEW_LAYOUT_TEMPLATES) {
    assert.equal(templateById(template.id), template);
    assert.equal(template.spans.length, template.count);
    for (const span of template.spans) {
      let area = 0;
      template.cells.forEach((row, r) => row.forEach((slot, c) => {
        if (slot === span.slot) {
          assert.ok(r >= span.row && r < span.row + span.rowSpan);
          assert.ok(c >= span.column && c < span.column + span.columnSpan);
          area++;
        }
      }));
      assert.equal(area, span.rowSpan * span.columnSpan, template.id);
    }
    assert.equal(resolveTemplate(template.count, template.id), template);
    assert.ok(templateFits(template, 1920, 1000, { minWidth: 80, minHeight: 80 }), template.id);
  }
  assert.equal(resolveTemplate(0, 'four-grid'), null);
  assert.equal(resolveTemplate(3, 'four-grid').id, VIEW_LAYOUT_DEFAULTS[3]);
});

test('Overview, independent toggles, X close and reopen follow deterministic order', () => {
  let state = createDesktopLayout();
  assert.ok(isOverview(state));
  assert.deepEqual(displayedViews(state), DOCKABLE_VIEWS);
  state = apply(state, 'TOGGLE_VIEW', { view: 'mask' });
  assert.deepEqual(displayedViews(state), ['main', 'three', 'section']);
  assert.equal(state.preset, 'three-left');
  state = apply(state, 'CLOSE_VIEW', { view: 'section' });
  assert.deepEqual(displayedViews(state), ['main', 'three']);
  state = apply(state, 'TOGGLE_VIEW', { view: 'main' });
  assert.deepEqual(displayedViews(state), ['three']);
  state = apply(state, 'TOGGLE_VIEW', { view: 'three' });
  assert.deepEqual(displayedViews(state), []);
  assert.equal(state.preset, null);
  state = apply(state, 'TOGGLE_VIEW', { view: 'mask' });
  assert.deepEqual(displayedViews(state), ['mask']);
  state = apply(state, 'RESET_OVERVIEW');
  assert.ok(isOverview(state));
  assert.deepEqual(state.order, DOCKABLE_VIEWS);
});

test('maximize restores prior exact composition, including custom tracks', () => {
  let state = createDesktopLayout();
  state = apply(state, 'APPLY_PRESET', { preset: 'four-right' });
  state = apply(state, 'SET_RATIOS', { axis: 'columns', values: [0.3, 0.7] });
  state = apply(state, 'SWAP', { a: 'main', b: 'section' });
  const before = structuredClone(state);
  state = apply(state, 'MAXIMIZE', { view: 'three' });
  assert.deepEqual(displayedViews(state), ['three']);
  assert.equal(isOverview(state), false);
  state = apply(state, 'RESTORE');
  assert.deepEqual(state, before);
  assert.equal(apply(state, 'RESTORE'), state);
  assert.equal(apply(state, 'MAXIMIZE', { view: 'unknown' }), state);
});

test('a view hidden by maximize is not accidentally closed by a highlighted view button', () => {
  let state = createDesktopLayout();
  state = apply(state, 'MAXIMIZE', { view: 'main' });
  state = apply(state, 'TOGGLE_VIEW', { view: 'section' });
  assert.equal(state.maximized, null);
  assert.equal(state.visible.length, 4);
  state = apply(state, 'MAXIMIZE', { view: 'main' });
  state = apply(state, 'TOGGLE_VIEW', { view: 'main' });
  assert.ok(!state.visible.includes('main'));
  assert.equal(state.maximized, null);
});

test('all counts remember their own presets while view buttons change the composition', () => {
  let state = createDesktopLayout();
  state = apply(state, 'APPLY_PRESET', { preset: 'four-bottom' });
  state = apply(state, 'TOGGLE_VIEW', { view: 'mask' });
  state = apply(state, 'APPLY_PRESET', { preset: 'three-columns' });
  state = apply(state, 'TOGGLE_VIEW', { view: 'main' });
  state = apply(state, 'APPLY_PRESET', { preset: 'two-right' });
  state = apply(state, 'TOGGLE_VIEW', { view: 'main' });
  assert.equal(state.preset, 'three-columns');
  state = apply(state, 'TOGGLE_VIEW', { view: 'mask' });
  assert.equal(state.preset, 'four-bottom');
  assert.equal(isOverview(state), false);
});

test('swap and drag-to-slot reorder visible panels without duplicating IDs', () => {
  let state = apply(createDesktopLayout(), 'SWAP', { a: 'main', b: 'section' });
  assert.deepEqual(orderedVisible(state), ['section', 'mask', 'three', 'main']);
  state = apply(state, 'MOVE_TO_SLOT', { view: 'section', slot: 2 });
  assert.deepEqual(orderedVisible(state), ['mask', 'three', 'section', 'main']);
  assert.equal(apply(state, 'MOVE_TO_SLOT', { view: 'mask', slot: 99 }), state);
  state = apply(state, 'TOGGLE_VIEW', { view: 'three' });
  assert.deepEqual(orderedVisible(state), ['mask', 'section', 'main']);
  assert.equal(new Set(state.order).size, 4);
  state = apply(state, 'TOGGLE_VIEW', { view: 'three' });
  assert.equal(state.order.length, 4);
  assert.equal(new Set(state.order).size, 4);
  const single = apply(createDesktopLayout(), 'TOGGLE_VIEW', { view: 'section' });
  assert.equal(apply(single, 'MOVE_TO_SLOT', { view: 'section', slot: 0 }), single);
});

test('invalid actions/ratios cannot corrupt template geometry or mutate previous state', () => {
  const source = createDesktopLayout();
  const copy = structuredClone(source);
  assert.equal(apply(source, 'TOGGLE_VIEW', { view: 'bad' }), source);
  assert.equal(apply(source, 'APPLY_PRESET', { preset: 'three-left' }), source);
  assert.equal(apply(source, 'SWAP', { a: 'bad', b: 'main' }), source);
  assert.equal(apply(source, 'SET_RATIOS', { axis: 'columns', values: [0, 1] }), source);
  assert.equal(apply(source, 'SET_RATIOS', { axis: 'columns', values: [NaN, 1] }), source);
  assert.equal(apply(source, 'SET_RATIOS', { axis: 'columns', values: [0.01, 0.99] }), source);
  const resized = apply(source, 'SET_RATIOS', { axis: 'columns', values: [3, 7] });
  assert.deepEqual(activeTracks(resized).columns, [0.3, 0.7]);
  assert.deepEqual(source, copy);
});

test('malformed hydrated preferences revert to safe layout without trusting maximized', () => {
  const invalid = [
    null, [], {}, { visible: ['main', 'main'], order: [...DOCKABLE_VIEWS] },
    { visible: ['evil'], order: [...DOCKABLE_VIEWS] },
    { visible: ['main'], order: ['main', 'mask', 'three', 'three'] },
  ];
  for (const value of invalid) assert.deepEqual(normalizeDesktopLayout(value), createDesktopLayout());
  const state = normalizeDesktopLayout({
    visible: ['three', 'main'], order: ['three', 'main', 'mask', 'section'],
    preset: 'two-right', maximized: 'three',
    remembered: { 4: 'four-left', 3: 'bad', 2: 'two-right' },
    tracks: { 'two-right': { columns: [30, 70], rows: [1] } },
  });
  assert.deepEqual(displayedViews(state), ['three', 'main']);
  assert.equal(state.maximized, null);
  assert.equal(state.remembered[3], 'three-left');
  assert.deepEqual(state.tracks['two-right'].columns, [0.3, 0.7]);
});

test('versioned storage is view-only, tolerant of disabled storage and excludes maximize', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  let state = apply(createDesktopLayout(), 'APPLY_PRESET', { preset: 'four-top' });
  state = apply(state, 'MAXIMIZE', { view: 'section' });
  assert.equal(saveDesktopLayout(storage, state), true);
  assert.deepEqual([...values.keys()], [DESKTOP_LAYOUT_STORAGE_KEY]);
  assert.equal(JSON.parse(values.get(DESKTOP_LAYOUT_STORAGE_KEY)).layout.maximized, undefined);
  const restored = loadDesktopLayout(storage);
  assert.equal(restored.preset, 'four-top');
  assert.equal(restored.maximized, null);
  values.set(DESKTOP_LAYOUT_STORAGE_KEY, '{broken');
  assert.deepEqual(loadDesktopLayout(storage), createDesktopLayout());
  const denied = {
    getItem() { throw Error('denied'); },
    setItem() { throw Error('denied'); },
  };
  assert.deepEqual(loadDesktopLayout(denied), createDesktopLayout());
  assert.equal(saveDesktopLayout(denied, state), false);
});

test('desktop layout activation respects exact CSS breakpoint, not touch pointer flags', () => {
  assert.equal(desktopDockingEnabled(820), false);
  assert.equal(desktopDockingEnabled(821), true);
  assert.equal(desktopDockingEnabled(1440), true);
  assert.equal(desktopDockingEnabled(NaN), false);
  assert.equal(desktopDockingEnabled('1440'), false);
});

test('Shell projection maps stable panel IDs onto template slots without changing state', () => {
  const source = apply(createDesktopLayout(), 'APPLY_PRESET', { preset: 'four-right' });
  const snapshot = structuredClone(source);
  const projected = projectDesktopLayout(source);
  assert.equal(projected.preset, 'four-right');
  assert.deepEqual(projected.highlighted, DOCKABLE_VIEWS);
  assert.equal(projected.placements.length, 4);
  assert.deepEqual(projected.placements.map(({ view }) => view), DOCKABLE_VIEWS);
  assert.equal(projected.placements[0].rowSpan, 3);
  const maximized = projectDesktopLayout(apply(source, 'MAXIMIZE', { view: 'section' }));
  assert.equal(maximized.preset, 'one-full');
  assert.deepEqual(maximized.displayed, ['section']);
  assert.deepEqual(maximized.highlighted, ['section']);
  assert.equal(maximized.overviewPressed, false);
  assert.deepEqual(source, snapshot);
});

test('atomic snap places dragged view in a chosen grid cell and rejects invalid drops', () => {
  const source = createDesktopLayout();
  const snapped = apply(source, 'SNAP_TO_SLOT', {
    view: 'section', preset: 'four-right', slot: 0,
  });
  assert.equal(snapped.preset, 'four-right');
  assert.deepEqual(orderedVisible(snapped), ['section', 'main', 'mask', 'three']);
  assert.equal(snapped.remembered[4], 'four-right');
  assert.deepEqual(source, createDesktopLayout());
  assert.equal(apply(snapped, 'SNAP_TO_SLOT', {
    view: 'main', preset: 'three-left', slot: 0,
  }), snapped);
  assert.equal(apply(snapped, 'SNAP_TO_SLOT', {
    view: 'unknown', preset: 'four-left', slot: 0,
  }), snapped);
  assert.equal(apply(snapped, 'SNAP_TO_SLOT', {
    view: 'main', preset: 'four-left', slot: 9,
  }), snapped);
});
