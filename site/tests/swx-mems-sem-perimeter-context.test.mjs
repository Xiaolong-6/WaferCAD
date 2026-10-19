import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { createSwxSemGroundReturnCandidate } from '../../scripts/swx-mems-sem-ground-return-candidate.mjs';
import { SWX_PERIMETER_CONTEXT_ASSUMPTIONS as a, createSwxSemPerimeterContext } from '../../scripts/swx-mems-sem-perimeter-context.mjs';
await loadGeometryKernel();
const v = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const multi = (rings) => v.unionGeometries(rings.map(ring=>[[[...ring,ring[0]]]]));
for(const state of ['off','on']){
  test('registered SEM mesa mask does not short original silicon '+state,()=>{
    const base=createSwxSemGroundReturnCandidate(state);
    const study=createSwxSemPerimeterContext(state);
    const add=study.physicalGroups.semPerimeterContext;
    assert.equal(a.sourceOuterMesaMaterialVerified,false);
    assert.equal(a.semContrastIsPositiveSiliconHypothesis,true);
    assert.ok(add.length>=100);
    assert.equal(study.maskPolygons.get(1).length, base.maskPolygons.get(1).length+add.length);
    assert.deepEqual(study.maskPolygons.get(2),base.maskPolygons.get(2));
    assert.deepEqual(study.maskPolygons.get(3),base.maskPolygons.get(3));
    const mask=multi(base.maskPolygons.get(1));
    const added=multi(add);
    assert.ok(geometryArea(added)>950);
    assert.ok(geometryArea(v.intersection(added,mask))<1e-7,'Exterior mesa shorts existing Si Mask');
    assert.equal(study.layout.elements.length,base.layout.elements.length+add.length);
  });
}
