import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LAYER_INSPECTION_NEUTRAL,
  LAYER_INSPECTION_DIM,
  layerInspectionTone,
  sectionInspectionFill,
} from '../layer-inspection-presentation.js';

test('layer focus leaves the selected authored color and de-emphasizes every other layer', () => {
  assert.equal(layerInspectionTone('oxide', null), 'normal');
  assert.equal(layerInspectionTone('oxide', 'oxide'), 'focused');
  assert.equal(layerInspectionTone('silicon', 'oxide'), 'deemphasized');
  assert.equal(layerInspectionTone(2, '2'), 'focused');
  assert.equal(sectionInspectionFill('#12ab34', 'oxide', null), '#12ab34');
  assert.equal(sectionInspectionFill('#12ab34', 'oxide', 'oxide'), '#12ab34');
  assert.equal(sectionInspectionFill('#12ab34', 'silicon', 'oxide'), LAYER_INSPECTION_NEUTRAL);
  assert.equal(layerInspectionTone('silicon', null), 'normal');
  assert.equal(sectionInspectionFill('#12ab34', 'silicon', null), '#12ab34');
  assert.ok(LAYER_INSPECTION_DIM > 0.7 && LAYER_INSPECTION_DIM < 1);
});

test('section focus covers both exact polygons and physical rough profiles', () => {
  const section = readFileSync(new URL('../plan-renderers.js', import.meta.url), 'utf8');
  assert.match(section, /sectionInspectionFill\(\s*experimentalOxide[\s\S]*?contour\.layerId/);
  assert.match(
    section,
    /sectionInspectionFill\(layer\.color, segment\.layerId, inspectionLayerId\)/,
  );
  assert.doesNotMatch(section, /rgba\(255, 198, 40/);
});

test('Three.js uses shared focus state without changing geometry or transparency', () => {
  const three = readFileSync(new URL('../three-view.js', import.meta.url), 'utf8');
  assert.match(three, /layerInspectionTone\(descriptor\.layerId, highlightedLayerId\)/);
  assert.match(three, /descriptor\?\.kind === 'material-interface'/);
  assert.match(three, /const exterior = \{ kind: 'material-exterior', layerId: owner\.layerId \}/);
  assert.match(
    three,
    /const oxideExterior = \{\s*kind: 'material-exterior',\s*layerId: data\.oxideLayerId,?\s*\}/,
  );
  assert.match(three, /material\.color\.copy\(original\.color\)/);
  assert.match(three, /material\.color\.lerp\(inspectionNeutralColor, LAYER_INSPECTION_DIM\)/);
  assert.doesNotMatch(
    three.slice(
      three.indexOf('function applyLayerInspectionMaterial'),
      three.indexOf('function updateLayerInspection'),
    ),
    /material\.(?:opacity|transparent|depthWrite|depthTest)\s*=/,
  );
});
