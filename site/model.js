import {bufferMulti,circleMulti,cloneGeom,difference,intersection,isEmpty,rectMulti,unionGeometries} from './vector-geometry.js';

export const COLORS=['#6C8EBF','#82B6A6','#D6A85F','#C97B84','#8A7CB8','#6FA9B8','#A98B6C','#7FA178','#B7799C','#7590AA'];
export const BASE_COLOR='#C3CBD4';

function baseGeometry(shape,width,height){
  return shape==='circle'?circleMulti(width,height,192):rectMulti(width,height);
}

export function createModel({shape='circle',width=100000,height=100000,thickness=12}={}){
  const boundary=baseGeometry(shape,width,height);
  return {
    kernel:'vector-2.5d-v1',shape,width,height,thickness,boundary,units:{xy:'µm',z:'relative'},
    layers:[{id:'base',name:'Base',color:BASE_COLOR}],
    regions:[{id:'region-1',geom:cloneGeom(boundary),stack:[{layerId:'base',z0:-thickness/2,z1:thickness/2}]}],
    nextLayerId:1,nextRegionId:2,revision:1,processRevision:0
  };
}

export const cloneModel=model=>structuredClone(model);
export const isVectorModel=model=>model?.kernel==='vector-2.5d-v1'&&Array.isArray(model.regions);
export const fullFaceGeometry=model=>cloneGeom(model.boundary);

export function layerById(model,id){return model.layers.find(layer=>layer.id===id)||null}
export function createLayer(model,name){
  const id=`layer-${model.nextLayerId++}`;
  const layer={id,name:(name||`Layer ${model.nextLayerId}`).trim(),color:COLORS[(model.nextLayerId-2)%COLORS.length]};
  model.layers.push(layer);return layer;
}
export function renameLayer(model,id,name){
  const layer=layerById(model,id);if(!layer)return false;
  const clean=String(name||'').trim();if(!clean)return false;layer.name=clean;model.revision++;return true;
}
export function recolorLayer(model,id,color){
  const layer=layerById(model,id);if(!layer||!/^#[0-9a-f]{6}$/i.test(color||''))return false;
  layer.color=color;model.revision++;return true;
}

export function surfaceSegment(stack,face='front'){
  if(!stack?.length)return null;
  return face==='front'?stack.at(-1):stack[0];
}
export function surfaceZ(stack,face='front'){
  const seg=surfaceSegment(stack,face);return seg?(face==='front'?seg.z1:seg.z0):null;
}
export function normalizeStack(stack){
  const sorted=(stack||[]).filter(seg=>seg.z1>seg.z0+1e-9).map(seg=>({...seg})).sort((a,b)=>a.z0-b.z0);
  const out=[];
  for(const seg of sorted){
    const prev=out.at(-1);
    if(prev&&prev.layerId===seg.layerId&&Math.abs(prev.z1-seg.z0)<1e-8)prev.z1=seg.z1;
    else out.push(seg);
  }
  return out;
}

function stackKey(stack){
  return (stack||[]).map(seg=>`${seg.layerId}:${seg.z0.toFixed(9)}:${seg.z1.toFixed(9)}`).join('|');
}
function mergeRegions(model,regions){
  const groups=new Map();
  for(const region of regions){
    if(isEmpty(region.geom)||!region.stack.length)continue;
    const key=stackKey(region.stack);
    if(!groups.has(key))groups.set(key,{stack:region.stack.map(s=>({...s})),geoms:[]});
    groups.get(key).geoms.push(region.geom);
  }
  const out=[];
  for(const group of groups.values()){
    const geom=unionGeometries(group.geoms);if(isEmpty(geom))continue;
    out.push({id:`region-${model.nextRegionId++}`,geom,stack:group.stack});
  }
  return out;
}

function trimStack(stack,amount,face){
  let left=amount,out=stack.map(seg=>({...seg}));
  while(left>1e-9&&out.length){
    const idx=face==='front'?out.length-1:0,seg=out[idx],height=seg.z1-seg.z0;
    if(left>=height-1e-9){left-=height;out.splice(idx,1)}
    else{if(face==='front')seg.z1-=left;else seg.z0+=left;left=0}
  }
  return normalizeStack(out);
}

function addLayerToSurface(stack,layerId,amount,face){
  const z=surfaceZ(stack,face);if(z==null)return stack;
  const out=stack.map(seg=>({...seg}));
  if(face==='front')out.push({layerId,z0:z,z1:z+amount});
  else out.unshift({layerId,z0:z-amount,z1:z});
  return normalizeStack(out);
}

function growSurfaceLayer(stack,targetLayerId,amount,face){
  const out=stack.map(seg=>({...seg})),seg=surfaceSegment(out,face);
  if(!seg||seg.layerId!==targetLayerId)return out;
  if(face==='front')seg.z1+=amount;else seg.z0-=amount;
  return normalizeStack(out);
}

function mutateStack(stack,{type,layerId,targetLayerId,amount,face}){
  if(type==='etch')return trimStack(stack,amount,face);
  if(type==='grow')return growSurfaceLayer(stack,targetLayerId,amount,face);
  return addLayerToSurface(stack,layerId,amount,face);
}

function splitByArea(model,area,mutator){
  const next=[];
  for(const region of model.regions){
    const hit=intersection(region.geom,area);
    const rest=difference(region.geom,area);
    if(!isEmpty(rest))next.push({id:region.id,geom:rest,stack:region.stack.map(s=>({...s}))});
    if(!isEmpty(hit)){
      const stack=mutator(region.stack.map(s=>({...s})),region);
      if(stack.length)next.push({id:`region-${model.nextRegionId++}`,geom:hit,stack});
    }
  }
  model.regions=mergeRegions(model,next);
}

function selectedSurfaceExtreme(model,area,face){
  let value=face==='front'?-Infinity:Infinity;
  for(const region of model.regions){
    if(isEmpty(intersection(region.geom,area)))continue;
    const z=surfaceZ(region.stack,face);if(z==null)continue;
    value=face==='front'?Math.max(value,z):Math.min(value,z);
  }
  return Number.isFinite(value)?value:null;
}

function conformalSidewallStack(stack,layerId,targetLayerId,amount,face,extreme,type){
  const local=surfaceZ(stack,face);if(local==null||extreme==null)return stack;
  if(type==='grow'&&surfaceSegment(stack,face)?.layerId!==targetLayerId)return stack;
  const out=stack.map(seg=>({...seg}));
  if(face==='front'){
    const z1=Math.max(local+amount,extreme+amount);
    out.push({layerId:targetLayerId||layerId,z0:local,z1});
  }else{
    const z0=Math.min(local-amount,extreme-amount);
    out.unshift({layerId:targetLayerId||layerId,z0,z1:local});
  }
  return normalizeStack(out);
}

export function applyOperation(model,{type,name,targetLayerId,thickness,face='front',area,growth='direct'}){
  const amount=Math.max(1e-5,Number(thickness)||0);
  let active=intersection(area,model.boundary);if(isEmpty(active))return {changed:false};
  let layer=null;
  if(type==='add')layer=createLayer(model,name);
  if(type==='grow'&&!layerById(model,targetLayerId))return {changed:false,error:'Target layer is unavailable.'};

  if(type==='etch'){
    splitByArea(model,active,stack=>mutateStack(stack,{type,amount,face}));
  }else if(growth==='conformal'){
    const expanded=intersection(bufferMulti(active,amount,32),model.boundary);
    const ring=difference(expanded,active),extreme=selectedSurfaceExtreme(model,active,face);
    splitByArea(model,active,stack=>mutateStack(stack,{type,layerId:layer?.id,targetLayerId,amount,face}));
    if(!isEmpty(ring)){
      splitByArea(model,ring,stack=>conformalSidewallStack(stack,layer?.id,targetLayerId,amount,face,extreme,type));
    }
  }else{
    splitByArea(model,active,stack=>mutateStack(stack,{type,layerId:layer?.id,targetLayerId,amount,face}));
  }
  model.regions=mergeRegions(model,model.regions);
  model.revision++;model.processRevision=(model.processRevision||0)+1;
  return {changed:true,layerId:layer?.id||targetLayerId||null};
}

export function modelBoundsZ(model){
  let lo=Infinity,hi=-Infinity;
  for(const region of model.regions)for(const seg of region.stack){lo=Math.min(lo,seg.z0);hi=Math.max(hi,seg.z1)}
  return Number.isFinite(lo)?[lo,hi]:[-1,1];
}

export function surfacePatches(model,face='front'){
  const out=[];
  for(const region of model.regions){
    const seg=surfaceSegment(region.stack,face);if(!seg)continue;
    out.push({geom:region.geom,layerId:seg.layerId,z:face==='front'?seg.z1:seg.z0,stack:region.stack});
  }
  return out;
}

export function layerUsage(model,id){
  let count=0;
  for(const region of model.regions)for(const seg of region.stack)if(seg.layerId===id)count++;
  return count;
}
