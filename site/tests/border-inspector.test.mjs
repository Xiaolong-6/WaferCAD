import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  BORDER_CATEGORIES,
  BORDER_PRESETS,
  normalizeBorderSettings,
  resolvedBorderStyle,
  borderNeedsInternalGeometry,
  borderPresentationState,
} from '../border-inspector.js';
import {
  buriedInterfaceContours,
  buriedSidewallContours,
  borderInspectorContours,
} from '../three-outline-geometry.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel, applyOperation } = await import('../model.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');

test('preset and custom state preserve independent physical categories', () => {
  assert.deepEqual(BORDER_CATEGORIES, ['exterior', 'interface', 'buried', 'occluded', 'roi']);
  assert.equal(normalizeBorderSettings().preset, 'structure');
  assert.equal(resolvedBorderStyle({}, 'interface', 0.45), 'solid');
  assert.equal(resolvedBorderStyle({}, 'interface', 1), 'off');
  assert.equal(resolvedBorderStyle({}, 'buried', 0.45), 'dashed');
  assert.equal(resolvedBorderStyle({}, 'occluded', 0.45), 'off');
  assert.equal(resolvedBorderStyle({ preset: 'xray' }, 'occluded', 0.45), 'dashed');
  assert.equal(resolvedBorderStyle({ preset: 'clean' }, 'buried', 0.45), 'off');
  assert.equal(BORDER_PRESETS.clean.exterior, 'solid');
  const custom = normalizeBorderSettings({
    preset: 'custom',
    styles: { ...BORDER_PRESETS.structure, interface: 'dashed' },
    strength: 0.38,
  });
  assert.equal(custom.preset, 'custom');
  assert.equal(custom.styles.interface, 'dashed');
  assert.equal(custom.styles.buried, 'auto');
  assert.equal(normalizeBorderSettings(custom).strength, 0.38);
  assert.equal(borderNeedsInternalGeometry(custom, 0.45, true), true);
  assert.equal(borderNeedsInternalGeometry({}, 1, true), false);
  assert.equal(borderNeedsInternalGeometry({ preset: 'clean' }, 0.45, true), false);
  assert.equal(borderNeedsInternalGeometry(custom, 0.45, false), false);
});

test('buried wall corners retained but collinear computation partitions suppressed', () => {
  const walls = [
    { layerId: 'metal', buried: true, p: [0, 0], q: [2, 0], z0: 0, z1: 1 },
    { layerId: 'metal', buried: true, p: [2, 0], q: [4, 0], z0: 0, z1: 1 },
    { layerId: 'metal', buried: true, p: [4, 0], q: [4, 2], z0: 0, z1: 1 },
  ];
  const lines = buriedSidewallContours(walls);
  assert.equal(lines.length, 9); // 3 real vertical endpoints and 6 top/bottom edges
  assert.equal(
    lines.some(([a, b]) => a[0] === 2 && a[1] === 0 && a[0] === b[0] && a[1] === b[1]),
    false,
    'collinear seam must not become a vertical border',
  );
  const duplicate = buriedSidewallContours(
    [walls[0]],
    [
      [
        [0, 0, 0],
        [0, 0, 1],
      ],
    ],
  );
  assert.equal(duplicate.length, 3); // other vertical endpoint plus bottom and top edges remain
  assert.deepEqual(buriedSidewallContours([{ ...walls[0], buried: false }]), []);
});

test('buried interfaces and walls use real geometry and array translations', () => {
  const square = [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ];
  const cap = {
    z: 0.5,
    buried: true,
    interfaceLayerId: 'metal',
    polys: [square],
  };
  assert.equal(buriedInterfaceContours([cap]).length, 4);
  const wall = {
    layerId: 'metal',
    buried: true,
    p: [0, 0],
    q: [2, 0],
    z0: 0,
    z1: 1,
    instanceTranslations: [
      [0, 0],
      [10, 0],
    ],
  };
  const result = buriedSidewallContours([wall]);
  assert.equal(result.length, 8);
  assert.ok(result.some(([a]) => a[0] === 10));
});

test('buried sidewall interval splits do not create false middle Z seams', () => {
  const part = { layerId: 'via', buried: true, p: [0, 0], q: [2, 0] };
  const contours = buriedSidewallContours([
    { ...part, z0: 0, z1: 1 },
    { ...part, z0: 1, z1: 2 },
  ]);
  assert.equal(contours.filter(([a, b]) => a[2] === 1 && b[2] === 1).length, 0);
  assert.equal(contours.filter(([a, b]) => a[2] === 0 && b[2] === 0).length, 1);
  assert.equal(contours.filter(([a, b]) => a[2] === 2 && b[2] === 2).length, 1);
});

test('real two-film Process topology retains buried interface without mutating model', () => {
  const model = createModel({
    shape: 'rect',
    width: 20,
    height: 10,
    thickness: 8,
  });
  const added = applyOperation(model, {
    type: 'add',
    name: 'Oxide',
    thickness: 1,
    face: 'front',
    area: model.boundary,
    growth: 'direct',
  });
  assert.equal(added.changed, true);
  const source = JSON.stringify(model);
  const plan = buildRenderSurfacePlan(model);
  const classified = borderInspectorContours(plan);
  assert.equal(classified.interface.length, 4);
  assert.ok(classified.exterior.length > 0);
  assert.equal(
    classified.interface.every(([a, b]) => a[2] === 4 && b[2] === 4),
    true,
  );
  assert.equal(classified.buried.length, 0);
  assert.equal(
    JSON.stringify(model),
    source,
    'view-only outlines must not affect model or History',
  );
});

// Regression: this control is in the native v2 page, which does not load site/style.css.
test('Border Inspector styles are loaded by the real v2 Workstation', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../app.html', import.meta.url), 'utf8'),
    readFile(new URL('../ui-v2/workstation-views.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /href="ui-v2\/workstation-views\.css"/);
  assert.match(css, /\.v2-border-inspector\s*\{/);
  assert.match(css, /\.v2-border-row\s*\{/);
  assert.match(css, /\.v2-main-tools:has\(> \.v2-border-inspector\)/);
});

// Border Inspector follows the central v2 Tooltip contract: no instructional
// microcopy in the actual tool menu or ad hoc title tooltip fallbacks.
test('Border Inspector explanations are owned by the central Tooltip catalog', async () => {
  const [view, catalog] = await Promise.all([
    readFile(new URL('../ui-v2/three-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../ui-v2/tooltip-catalog.js', import.meta.url), 'utf8'),
  ]);
  for (const key of [
    'three.border.enabled',
    'three.border.preset.clean',
    'three.border.preset.structure',
    'three.border.preset.xray',
    'three.border.exterior',
    'three.border.interface',
    'three.border.buried',
    'three.border.occluded',
    'three.border.roi',
    'three.border.strength',
  ]) {
    assert.ok(catalog.includes(`'${key}'`), `Missing curated Tooltip: ${key}`);
  }
  assert.match(view, /'data-help': `three\.border\.\$\{category\}`/);
  assert.match(view, /'data-help': `three\.border\.preset\.\$\{preset\}`/);
  assert.doesNotMatch(
    view,
    /v2-border-hint|Outer surfaces, steps and exposed edges|Auto shows buried geometry when transparent/,
  );
});

test('border line presentation is view-only and preserves old depth/opacity semantics', () => {
  for (const preset of ['clean', 'structure', 'xray']) {
    for (const opacity of [1, 0.7, 0.45, 0.15]) {
      for (const category of BORDER_CATEGORIES) {
        for (const lineStyle of ['solid', 'dashed']) {
          const kind =
            category === 'occluded'
              ? 'hidden-border'
              : ['interface', 'buried'].includes(category)
                ? 'internal-border'
                : 'border';
          const descriptor = { kind, category, lineStyle };
          const result = borderPresentationState(descriptor, { preset }, opacity, true);
          const resolved = resolvedBorderStyle({ preset }, category, opacity);
          assert.equal(
            result.visible,
            resolved === lineStyle && (kind !== 'hidden-border' || opacity < 0.999),
            `${preset}/${opacity}/${category}/${lineStyle}`,
          );
          assert.equal(result.materialState.transparent, true);
          assert.equal(result.materialState.depthTest, kind !== 'internal-border');
          assert.equal(result.materialState.depthWrite, false);
          assert.equal(result.transparentSort, false);
          assert.ok(result.materialState.opacity >= 0 && result.materialState.opacity <= 1);
          assert.equal(
            borderPresentationState(descriptor, { preset }, opacity, false).visible,
            false,
          );
        }
      }
    }
  }
  const inner = {
    kind: 'internal-border',
    category: 'interface',
    lineStyle: 'solid',
  };
  const faint = borderPresentationState(inner, { preset: 'xray', strength: 0.15 }, 0.45, true);
  const strong = borderPresentationState(inner, { preset: 'xray', strength: 1 }, 0.45, true);
  assert.ok(strong.materialState.opacity > faint.materialState.opacity);
  assert.equal(strong.materialState.opacity, 0.7);
  assert.equal(borderPresentationState({ kind: 'electrical-internal' }, {}, 0.45, true), null);
  assert.deepEqual(
    borderPresentationState({ kind: 'hidden-border' }, { preset: 'xray' }, 1, true).visible,
    false,
  );
});