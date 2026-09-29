import {selectedLayerSourcePolygons,selectedSourceFingerprint} from './layout-model.js';

// Explicit async preparation shared by Main's Fill toggle and Pattern preview.
// Weak keys keep requests local to their imported layer objects, not layer IDs.
const pendingFills=new WeakMap();

export async function ensureLayerFilledPolygons(layer){
  if(layer.fillPattern!==true)return;
  const sources=selectedLayerSourcePolygons(layer),fingerprint=selectedSourceFingerprint(layer,sources);
  if(Array.isArray(layer.filledPolygons)&&layer.filledSelectionFingerprint===fingerprint)return;
  if(pendingFills.get(layer)?.fingerprint===fingerprint)return pendingFills.get(layer).promise;
  delete layer.filledPolygons;delete layer.filledSelectionFingerprint;
  if(!sources.length){layer.filledPolygons=[];layer.filledSelectionFingerprint=fingerprint;return;}
  const request={fingerprint,promise:null};
  request.promise=(async()=>{
    try{
      const response=await fetch('/api/geometry/fill-holes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:sources})});
      if(!response.ok){const data=await response.json().catch(()=>({detail:response.statusText}));throw new Error(data.detail||response.statusText);}
      const data=await response.json();
      if(!Array.isArray(data.regions))throw new Error('Fill returned an invalid result.');
      if(pendingFills.get(layer)!==request||layer.fillPattern!==true||selectedSourceFingerprint(layer)!==fingerprint)return;
      layer.filledPolygons=data.regions;layer.filledSelectionFingerprint=fingerprint;
    }catch(error){
      if(pendingFills.get(layer)!==request||layer.fillPattern!==true||selectedSourceFingerprint(layer)!==fingerprint)return;
      throw error;
    }finally{
      if(pendingFills.get(layer)===request)pendingFills.delete(layer);
    }
  })();
  pendingFills.set(layer,request);
  return request.promise;
}
