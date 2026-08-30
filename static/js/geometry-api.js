import {state} from './core.js';
import {waferOutline} from './geometry.js';

async function postGeometry(path,payload,errorPrefix){
  let response;
  try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
  catch(error){throw new Error(`${errorPrefix}: ${error.message}`);}
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}
  return response.json();
}

export async function clipPolygonsToWafer(polygons){
  if(!state.wafer)return polygons.map(()=>[]);
  const data=await postGeometry('/api/geometry/intersection',{subjects:polygons,clip:waferOutline()},'Substrate clipping request failed');
  if(!Array.isArray(data.results)||data.results.length!==polygons.length)throw new Error('Substrate clipping returned an invalid result.');
  return data.results;
}

export async function resolveMaskRegions(maskPolygons,invert){
  const data=await postGeometry('/api/geometry/mask-regions',{mask:maskPolygons,substrate:waferOutline(),invert},'Mask Boolean request failed');
  if(!Array.isArray(data.regions))throw new Error('Mask Boolean operation returned an invalid result.');
  return data.regions;
}

export async function composeMaskRegions(polygons,polarity='transmit',substrate=null){
  const payload={polygons,polarity};
  if(Array.isArray(substrate)&&substrate.length>=3)payload.substrate=substrate;
  const data=await postGeometry('/api/geometry/mask-compose',payload,'Physical mask composition failed');
  if(!Array.isArray(data.regions)||!Array.isArray(data.components))throw new Error('Mask composition returned an invalid result.');
  return data;
}

export async function isotropicOffset(polygons,distance){
  const data=await postGeometry('/api/geometry/isotropic-offset',{subjects:polygons,distance,clip:waferOutline()},'Isotropic geometry request failed');
  if(!Array.isArray(data.regions))throw new Error('Isotropic geometry operation returned an invalid result.');
  return data.regions;
}

export async function splitPolygonsByMask(subjects,masks){
  const data=await postGeometry('/api/geometry/split-by-mask',{subjects,masks},'Material split request failed');
  if(!Array.isArray(data.remaining)||!Array.isArray(data.overlaps)||data.remaining.length!==subjects.length||data.overlaps.length!==subjects.length)throw new Error('Material split returned an invalid result.');
  return data;
}

export async function partitionTopSurface(masks=[]){
  if(!state.wafer)return [];
  const data=await postGeometry('/api/geometry/surface-partition',{
    outline:waferOutline(),thickness:state.wafer.thickness,side:state.activeFace,
    solids:state.solids,cuts:state.cuts,masks,
  },'Top-surface partition failed');
  if(!Array.isArray(data.atoms)||data.exact!==true)throw new Error('Top-surface partition returned an invalid result.');
  return data.atoms;
}
