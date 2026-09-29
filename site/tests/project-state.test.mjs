import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url);
globalThis.polygonClipping=require('../vendor/polygon-clipping.umd.js');

const {createModel}=await import('../model.js');
const {parseProjectText,serializeProject}=await import('../project-state.js');

function stateFixture(){
  return {
    model:createModel({shape:'rect',width:200,height:100,thickness:8}),
    layout:{
      name:'fixture.gds',
      root:'TOP',
      elements:[],
      linework:[],
      bounds:{minX:-10,minY:-5,maxX:10,maxY:5,width:20,height:10},
      combos:[],
      hierarchy:{TOP:[]},
      units:{xy:'µm',dbuToMicron:1,hasPhysicalUnits:true}
    },
    selectedLayerKeys:new Set(['1|0','2|0']),
    activeCell:'TOP',
    maskTransform:{x:2,y:-3,scale:1.5,rotation:12},
    activeFace:'back',
    roi:{type:'rect',a:[-1,-2],b:[3,4]},
    section:{a:[-20,0],b:[20,0]},
    planViews:{mask:{zoom:2,panX:1,panY:2},main:{zoom:1,panX:0,panY:0}},
    display:{xyUnit:'mm',structurePalette:'balanced',customStructurePalette:null}
  };
}

test('project save/open round-trip preserves serializable state',()=>{
  const source=serializeProject(stateFixture());
  const loaded=parseProjectText(JSON.stringify(source));
  assert.deepEqual(loaded,source);
  assert.deepEqual(loaded.selectedLayerKeys,['1|0','2|0']);
  assert.equal(loaded.model.width,200);
  assert.equal(loaded.layout.root,'TOP');
  assert.equal(loaded.display.xyUnit,'mm');
});

test('project parser rejects malformed model structure',()=>{
  const source=serializeProject(stateFixture());
  source.model.regions=[{id:'broken',geom:[],stack:[{layerId:'base',z0:4,z1:-4}]}];
  assert.throws(()=>parseProjectText(JSON.stringify(source)),/stack data is invalid/);
});

test('project parser rejects malformed layout structure',()=>{
  const source=serializeProject(stateFixture());
  source.layout.elements={};
  assert.throws(()=>parseProjectText(JSON.stringify(source)),/layout elements is invalid/);
});

test('project parser reports invalid JSON cleanly',()=>{
  assert.throws(()=>parseProjectText('{not json'),/not valid JSON/);
});
