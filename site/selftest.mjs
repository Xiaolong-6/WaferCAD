import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
globalThis.polygonClipping=require('./vendor/polygon-clipping.umd.js');

const vg=await import('./vector-geometry.js');
const modelApi=await import('./model.js');
const {makeDemoLayout}=await import('./gds.js');
const {applyOperation,createModel,layerById,recolorLayer,renameLayer,surfaceSegment}=modelApi;
const {difference,intersection,isEmpty,pointInMulti,rectMulti}=vg;

function regionAt(model,point){
  return model.regions.find(region=>pointInMulti(point,region.geom))||null;
}

const m=createModel({shape:'rect',width:20,height:20,thickness:10});
const area=rectMulti(4,4);
const add=applyOperation(m,{type:'add',name:'Film',thickness:2,face:'front',area,growth:'direct'});
assert.equal(add.changed,true);
assert.equal(layerById(m,add.layerId).name,'Film');
assert.equal(surfaceSegment(regionAt(m,[0,0]).stack).layerId,add.layerId);

const beforeTop=surfaceSegment(regionAt(m,[0,0]).stack).z1;
applyOperation(m,{type:'grow',targetLayerId:add.layerId,thickness:1,face:'front',area,growth:'direct'});
assert.equal(surfaceSegment(regionAt(m,[0,0]).stack).z1,beforeTop+1);

applyOperation(m,{type:'etch',thickness:4,face:'front',area});
assert.equal(surfaceSegment(regionAt(m,[0,0]).stack).layerId,'base');

const direct=createModel({shape:'rect',width:20,height:20,thickness:10});
const d=applyOperation(direct,{type:'add',name:'D',thickness:2,face:'front',area,growth:'direct'});
assert.notEqual(surfaceSegment(regionAt(direct,[2.5,0]).stack).layerId,d.layerId);

const conformal=createModel({shape:'rect',width:20,height:20,thickness:10});
const c=applyOperation(conformal,{type:'add',name:'C',thickness:2,face:'front',area,growth:'conformal'});
assert.equal(surfaceSegment(regionAt(conformal,[2.5,0]).stack).layerId,c.layerId);

assert.equal(renameLayer(conformal,c.layerId,'Contact'),true);
assert.equal(layerById(conformal,c.layerId).name,'Contact');
assert.equal(recolorLayer(conformal,c.layerId,'#55aacc'),true);
assert.equal(layerById(conformal,c.layerId).color,'#55aacc');

const full=rectMulti(20,20),inside=intersection(full,area),outside=difference(full,area);
assert.equal(isEmpty(inside),false);assert.equal(pointInMulti([0,0],outside),false);assert.equal(pointInMulti([7,0],outside),true);

const circle=createModel({shape:'circle',width:20,height:20,thickness:10});
assert.ok(circle.boundary[0][0].length>100);
assert.equal(pointInMulti([0,0],circle.boundary),true);
assert.equal(pointInMulti([10.1,0],circle.boundary),false);

const demo=makeDemoLayout();
assert.equal(demo.linework.length,1);
assert.ok(!demo.combos.some(x=>x.layer===99));

console.log('WaferCAD vector self-test: OK');
