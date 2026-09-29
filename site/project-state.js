import {isVectorModel} from './model.js';

export const PROJECT_FORMAT='WaferCAD-vector';

function isObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

function finite(value){
  return Number.isFinite(Number(value));
}

function validateModel(model){
  if(!isVectorModel(model))throw new Error('This file uses the legacy preview geometry format. Recreate it with the vector build.');
  if(!(finite(model.width)&&Number(model.width)>0&&finite(model.height)&&Number(model.height)>0&&finite(model.thickness)&&Number(model.thickness)>0)){
    throw new Error('Project model dimensions are invalid.');
  }
  if(!Array.isArray(model.boundary)||!Array.isArray(model.layers)||!Array.isArray(model.regions)){
    throw new Error('Project model geometry is invalid.');
  }
  for(const layer of model.layers){
    if(!isObject(layer)||typeof layer.id!=='string'||typeof layer.name!=='string')throw new Error('Project layer data is invalid.');
  }
  for(const region of model.regions){
    if(!isObject(region)||!Array.isArray(region.geom)||!Array.isArray(region.stack))throw new Error('Project region data is invalid.');
    for(const seg of region.stack){
      if(!isObject(seg)||typeof seg.layerId!=='string'||!finite(seg.z0)||!finite(seg.z1)||Number(seg.z1)<=Number(seg.z0)){
        throw new Error('Project stack data is invalid.');
      }
    }
  }
}

function validateLayout(layout){
  if(!isObject(layout))throw new Error('Project layout is missing.');
  for(const key of ['elements','linework','combos']){
    if(!Array.isArray(layout[key]))throw new Error(`Project layout ${key} is invalid.`);
  }
  if(layout.bounds!=null){
    if(!isObject(layout.bounds)||!['minX','minY','maxX','maxY','width','height'].every(key=>finite(layout.bounds[key]))){
      throw new Error('Project layout bounds are invalid.');
    }
  }
  if(layout.hierarchy!=null&&!isObject(layout.hierarchy))throw new Error('Project hierarchy is invalid.');
  if(layout.units!=null&&!isObject(layout.units))throw new Error('Project layout units are invalid.');
}

export function validateProject(project){
  if(!isObject(project)||project.format!==PROJECT_FORMAT){
    throw new Error('This file uses the legacy preview geometry format. Recreate it with the vector build.');
  }
  validateModel(project.model);
  validateLayout(project.layout);
  if(project.selectedLayerKeys!=null&&!Array.isArray(project.selectedLayerKeys))throw new Error('Project layer selection is invalid.');
  if(project.activeFace!=null&&!['front','back'].includes(project.activeFace))throw new Error('Project active face is invalid.');
  if(project.maskTransform!=null){
    const t=project.maskTransform;
    if(!isObject(t)||!['x','y','scale','rotation'].every(key=>finite(t[key]))||Number(t.scale)<=0)throw new Error('Project mask transform is invalid.');
  }
  if(project.section!=null){
    const s=project.section;
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
    if(!isObject(s)||!point(s.a)||!point(s.b))throw new Error('Project section is invalid.');
  }
  return project;
}

export function serializeProject(state){
  const layout=state.layout||{};
  return {
    format:PROJECT_FORMAT,
    model:state.model,
    layout:{
      name:layout.name,
      root:layout.root,
      elements:layout.elements||[],
      linework:layout.linework||[],
      bounds:layout.bounds,
      combos:layout.combos||[],
      hierarchy:layout.hierarchy||{},
      units:layout.units
    },
    selectedLayerKeys:[...(state.selectedLayerKeys||[])],
    activeCell:state.activeCell??null,
    maskTransform:state.maskTransform,
    activeFace:state.activeFace,
    roi:state.roi??null,
    section:state.section,
    planViews:state.planViews,
    display:state.display
  };
}

export function parseProjectText(text){
  let project;
  try{project=JSON.parse(text)}
  catch{throw new Error('Project file is not valid JSON.')}
  return validateProject(project);
}
