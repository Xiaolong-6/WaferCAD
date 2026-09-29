import assert from 'node:assert/strict';
import {createModel,applyOperation,fullFaceMask,topSegment} from './model.js';
import {makeDemoLayout} from './gds.js';

const m=createModel({width:20,height:20,thickness:10});
const one=new Uint8Array(m.columns.length);const center=Math.floor(m.rows/2)*m.cols+Math.floor(m.cols/2);one[center]=1;
applyOperation(m,{type:'add',name:'Film',thickness:2,face:'front',mask:one,growth:'direct'});
assert.equal(topSegment(m.columns[center]).name,'Film');
assert.equal(m.layers.filter(x=>x.name==='Film').length,1);
const beforeLayers=m.layers.length;const beforeTop=topSegment(m.columns[center]).z1;
applyOperation(m,{type:'grow',target:'Film',thickness:1,face:'front',mask:one,growth:'direct'});
assert.equal(m.layers.length,beforeLayers);assert.equal(topSegment(m.columns[center]).z1,beforeTop+1);
applyOperation(m,{type:'etch',thickness:4,face:'front',mask:one,growth:'direct'});
assert.equal(topSegment(m.columns[center]).name,'Base');

const d=createModel({width:20,height:20,thickness:10});applyOperation(d,{type:'add',name:'D',thickness:2,face:'front',mask:one,growth:'direct'});const direct=d.columns.filter(c=>c.at(-1)?.name==='D').length;
const c=createModel({width:20,height:20,thickness:10});applyOperation(c,{type:'add',name:'C',thickness:2,face:'front',mask:one,growth:'conformal'});const conformal=c.columns.filter(x=>x.at(-1)?.name==='C').length;assert.ok(conformal>direct);

const demo=makeDemoLayout();assert.equal(demo.linework.length,1);assert.ok(!demo.combos.some(x=>x.layer===99));assert.ok(fullFaceMask(m).some(Boolean));
console.log('WaferCAD v2 self-test: OK');
