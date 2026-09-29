import {state} from './core.js';
import {waferOutline} from './geometry.js';

const JOB_POLL_MS=80;
const CANCELLABLE_OPERATIONS=new Set(['surface-partition','split-by-mask','isotropic-offset']);
const activeGeometryJobs=new Set();
const activeCancellableScopes=new Set();
let currentCancellableScope=null;

export class GeometryJobCancelledError extends Error{
  constructor(message='Geometry operation stopped by user.'){super(message);this.name='GeometryJobCancelledError';}
}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function jobJson(response,errorPrefix){
  if(response.ok)return response.json();
  const detail=await response.json().catch(()=>({detail:response.statusText}));
  throw new Error(`${errorPrefix}: ${detail.detail||response.statusText}`);
}

function cancelled(scope){return scope?.cancelled===true;}

async function directPostGeometry(path,payload,errorPrefix,scope=null){
  let response;
  try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:scope?.controller.signal});}
  catch(error){if(cancelled(scope)||error?.name==='AbortError')throw new GeometryJobCancelledError();throw new Error(`${errorPrefix}: ${error.message}`);}
  if(cancelled(scope))throw new GeometryJobCancelledError();
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}
  return response.json();
}

async function postGeometry(path,payload,errorPrefix){
  const operation=path.split('/').filter(Boolean).at(-1);
  const scope=currentCancellableScope;
  if(!scope||!CANCELLABLE_OPERATIONS.has(operation))return directPostGeometry(path,payload,errorPrefix,scope);
  if(cancelled(scope))throw new GeometryJobCancelledError();
  let created;
  try{created=await jobJson(await fetch('/api/geometry/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,payload})}),errorPrefix);}
  catch(error){throw new Error(`${errorPrefix}: ${error.message}`);}
  const jobId=created.id;activeGeometryJobs.add(jobId);
  try{
    if(cancelled(scope)){await fetch(`/api/geometry/jobs/${encodeURIComponent(jobId)}`,{method:'DELETE'}).catch(()=>{});throw new GeometryJobCancelledError();}
    for(;;){
      await wait(JOB_POLL_MS);
      if(cancelled(scope)){await fetch(`/api/geometry/jobs/${encodeURIComponent(jobId)}`,{method:'DELETE'}).catch(()=>{});throw new GeometryJobCancelledError();}
      const job=await jobJson(await fetch(`/api/geometry/jobs/${encodeURIComponent(jobId)}`),errorPrefix);
      if(job.status==='running')continue;
      if(job.status==='completed')return job.result;
      if(job.status==='cancelled')throw new GeometryJobCancelledError(job.error);
      throw new Error(job.error||`${errorPrefix}: geometry worker failed`);
    }
  }finally{activeGeometryJobs.delete(jobId);}
}

export async function runCancellableGeometry(callback){
  const previous=currentCancellableScope,scope={cancelled:false,controller:new AbortController()};
  currentCancellableScope=scope;activeCancellableScopes.add(scope);
  try{return await callback();}
  finally{activeCancellableScopes.delete(scope);currentCancellableScope=previous;}
}

export async function cancelActiveGeometryJobs(){
  for(const scope of activeCancellableScopes){scope.cancelled=true;scope.controller.abort();}
  const ids=[...activeGeometryJobs];
  if(ids.length)await Promise.allSettled(ids.map(id=>fetch(`/api/geometry/jobs/${encodeURIComponent(id)}`,{method:'DELETE'})));
  return ids.length;
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

export async function partitionTopSurface(masks=[], side=state.activeFace){
  if(!state.wafer)return [];
  const data=await postGeometry('/api/geometry/surface-partition',{
    outline:waferOutline(),thickness:state.wafer.thickness,side,
    solids:state.solids,cuts:state.cuts,masks,
  },'Top-surface partition failed');
  if(!Array.isArray(data.atoms)||data.exact!==true)throw new Error('Top-surface partition returned an invalid result.');
  return data.atoms;
}
