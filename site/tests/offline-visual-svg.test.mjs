import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMainSvg, renderSectionSvg } from '../../scripts/offline-visual-svg.mjs';

const rectangle = (x0, y0, x1, y1) => [[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]];
const model = {
  boundary: rectangle(-10,-10,10,10),
  layers: [{id:'base', name:'Silicon', color:'#aabbcc'}, {id:'metal', name:'Metal', color:'#dda066'}],
};
const sections = [
  {t0:0,t1:1,z0:-5,z1:5,layerId:'base'},
  {t0:.25,t1:.75,z0:5,z1:7,layerId:'metal'},
];
test('Main uses physical XY scale and explicit material IDs without changing input', () => {
  const before=structuredClone(model);
  const result=renderMainSvg({model,patches:[{layerId:'base',z:5,geom:model.boundary},{layerId:'metal',z:7,geom:rectangle(-5,-2,5,2)}]});
  assert.equal(result.evidence.pixelsPerUm, 27.35);
  assert.equal(result.evidence.materialSurfaces,2);
  assert.match(result.svg,/fill-rule="evenodd"/);
  assert.match(result.svg,/Silicon/);
  assert.deepEqual(model,before);
});
test('Section auto scale reports independent XYZ mapping and never edits input', () => {
  const before=structuredClone(sections);
  const result=renderSectionSvg({model,slices:sections,a:[-10,0],b:[10,0]});
  assert.equal(result.evidence.lineLengthUm,20);
  assert.equal(result.evidence.zMinUm,-5);
  assert.equal(result.evidence.zMaxUm,7);
  assert.equal(result.evidence.pixelsPerUmX,46);
  assert.ok(result.evidence.pixelsPerUmZ > 45 && result.evidence.pixelsPerUmZ < 46);
  assert.deepEqual(sections,before);
});
test('Section physical mode uses identical pixel/µm for X and Z', () => {
  const r=renderSectionSvg({model,slices:sections,a:[-10,0],b:[10,0],scaleMode:'physical'});
  assert.equal(r.evidence.pixelsPerUmX,r.evidence.pixelsPerUmZ);
});
test('Reject invalid scientific slice, empty input and nonfinite polygons', () => {
  assert.throws(()=>renderSectionSvg({model,slices:[{...sections[0],z0:NaN}],a:[-10,0],b:[10,0]}),/Invalid z0/);
  assert.throws(()=>renderMainSvg({model,patches:[]}),/No actual material/);
  assert.throws(()=>renderMainSvg({model:{...model,boundary:rectangle(0,0,Infinity,10)},patches:[{layerId:'base',z:5,geom:model.boundary}]}),/Invalid x/);
});
test('XML escapes untrusted display names', () => {
  const hostile={...model,layers:[{id:'base',name:'<script>alert(1)</script>',color:'#ccc'}]};
  const r=renderMainSvg({model:hostile,patches:[{layerId:'base',z:0,geom:model.boundary}]});
  assert.ok(!r.svg.includes('<script>'));
  assert.ok(r.svg.includes('&lt;script&gt;'));
});