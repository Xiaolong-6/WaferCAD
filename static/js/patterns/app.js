import {state, persistSharedState} from '../core.js';
import {waferOutline, bboxPolys, isSimplePolygon, viewAspectBounds, waferBounds, polygonArea, centroid} from '../geometry.js';
import {composeMaskRegions} from '../geometry-api.js';
import {effectiveLayerPolygons,maskProjectionFingerprint,substrateProjectionFingerprint} from '../layout-model.js';
import {clearSvg, makeSvg} from '../svg.js';

const $ = id => document.getElementById(id);
let gdsFile = null;

function saveShared(){ persistSharedState(); }
function setPatternStatus(message){const target=$('patStatus')||$('statusText');if(target)target.textContent=message;}
function patTransform([x,y]){
  const t=state.gds.transform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1};
  const s=Number(t.scale)||1, sx=x*s, sy=y*s;
  const a=(Number(t.rotationDeg)||0)*Math.PI/180, c=Math.cos(a), s2=Math.sin(a);
  return [sx*c - sy*s2 + (Number(t.offsetX)||0), sx*s2 + sy*c + (Number(t.offsetY)||0)];
}
function effectiveLayer(l){return effectiveLayerPolygons(l).map(polygon=>l.mirrored===true?polygon.map(([x,y])=>[-x,y]):polygon);}
function isAreaValid(polys){
  if(!polys.length) return false;
  let total=0;
  for(const p of polys) total+=Math.abs(polygonArea(p));
  return total > 1e-6; // ~1 nm²
}

let viewBounds={mask:null,projection:null};
let projectionFitMode='wafer'; // projection | wafer | both
function viewPoint(point,view='mask'){return view==='mask'?[point[0],point[1]]:patTransform(point);}
function layoutBounds(view='mask'){
  let result=null;
  for(const layer of state.gds.layers){
    if(!Array.isArray(layer.bbox)||layer.bbox.length!==4)continue;
    let [x0,y0,x1,y1]=layer.bbox;
    if(layer.mirrored===true)[x0,x1]=[-x1,-x0];
    for(const point of [[x0,y0],[x0,y1],[x1,y0],[x1,y1]]){
      const [x,y]=viewPoint(point,view);
      result=result?[Math.min(result[0],x),Math.min(result[1],y),Math.max(result[2],x),Math.max(result[3],y)]:[x,y,x,y];
    }
  }
  return result;
}
function fitView(view,mode=null,shouldRender=true){
  if(view==='projection'&&mode)projectionFitMode=mode;
  const outline=waferOutline();
  const waferBB = view==='projection'&&outline.length ? bboxPolys([outline]) : null;
  let gdsTransBB=layoutBounds(view);
  if(!gdsTransBB && state.gds.bbox) gdsTransBB=[...state.gds.bbox];
  let bb=null;
  if(view==='mask'&&gdsTransBB)bb=[...gdsTransBB];
  else if(projectionFitMode==='projection' && gdsTransBB) bb=[...gdsTransBB];
  else if(projectionFitMode==='wafer' && waferBB) bb=[...waferBB];
  else if(waferBB && gdsTransBB) bb=[Math.min(waferBB[0],gdsTransBB[0]), Math.min(waferBB[1],gdsTransBB[1]), Math.max(waferBB[2],gdsTransBB[2]), Math.max(waferBB[3],gdsTransBB[3])];
  else bb = waferBB || gdsTransBB || [-50000,-50000,50000,50000];
  viewBounds[view]=viewAspectBounds(bb,0.12);
  const btn=$(view==='mask'?'patFitBtn':'patProjectionFitBtn');
  if(btn)btn.textContent=view==='mask'?'Fit mask':projectionFitMode==='projection'?'Fit projection':projectionFitMode==='wafer'?'Fit wafer':'Fit both';
  if(shouldRender)render();
}
function fitPat(){fitView('mask','mask',false);fitView('projection',projectionFitMode,false);render();}
function modelToSvg(x,y,view='mask'){
  const [x0,y0,x1,y1]=viewBounds[view]||[-1,-1,1,1];
  const W=600,H=420; return [(x-x0)/(x1-x0)*W, H-(y-y0)/(y1-y0)*H];
}
function svgToModel(sx,sy,view='mask'){
  const [x0,y0,x1,y1]=viewBounds[view]||[-1,-1,1,1];
  return {x: x0 + sx/600*(x1-x0), y: y0 + (1 - sy/420)*(y1-y0)};
}
function polyPath(poly,view='mask'){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1],view); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }
function niceScaleDistance(target){
  if(!(target>0))return 1;
  const power=10**Math.floor(Math.log10(target)),normalized=target/power;
  return (normalized>=5?5:normalized>=2?2:1)*power;
}
function appendScaleBar(svg,view){
  const bounds=viewBounds[view];if(!bounds)return;
  const distance=niceScaleDistance((bounds[2]-bounds[0])*0.16),pixels=distance/(bounds[2]-bounds[0])*600;
  const x=18,y=392,label=distance>=1000?`${Number((distance/1000).toPrecision(3))} mm`:`${Number(distance.toPrecision(3))} µm`;
  const group=makeSvg('g',{'data-scale-bar':view,'pointer-events':'none'});
  group.appendChild(makeSvg('rect',{x:x-7,y:y-24,width:pixels+14,height:31,rx:4,fill:'#ffffff','fill-opacity':'0.82'}));
  group.appendChild(makeSvg('line',{x1:x,y1:y,x2:x+pixels,y2:y,stroke:'#312e3f','stroke-width':'3'}));
  group.appendChild(makeSvg('line',{x1:x,y1:y-5,x2:x,y2:y+5,stroke:'#312e3f','stroke-width':'2'}));
  group.appendChild(makeSvg('line',{x1:x+pixels,y1:y-5,x2:x+pixels,y2:y+5,stroke:'#312e3f','stroke-width':'2'}));
  const labelNode=makeSvg('text',{x:x+pixels/2,y:y-8,'text-anchor':'middle','font-size':'11','font-weight':'700',fill:'#312e3f'});labelNode.textContent=label;group.appendChild(labelNode);svg.appendChild(group);
}

// Lasso state
let lassoStart=null, lassoRect=null, lassoActive=false;
let highlightMode='top'; // top | wafer | none
let maskPreview=[];
let projectionPreview=[];
let previewGeneration=0;
let previewCacheKey=null;
let previewPendingKey=null;
let previewPendingPromise=null;
let previewBusy=false;
let componentMigrationRunning=false;
function patternsVisible(){return !$('patternsWorkspace')?.classList.contains('hidden');}
function currentPreviewKey(){return `${maskProjectionFingerprint()}|${substrateProjectionFingerprint()}`;}
function clearPreviewCache(clearResults=true){
  previewCacheKey=null;previewPendingKey=null;previewPendingPromise=null;previewBusy=false;previewGeneration++;
  if(clearResults){maskPreview=[];projectionPreview=[];}
}

function renderLegend(view){
  const legend=$(view==='mask'?'patLegend':'patProjectionLegend');
  if(!legend)return;
  legend.replaceChildren();
  const title=document.createElement('div');
  title.className='pat-legend-title';
  title.textContent=view==='mask'?'Mask legend':'Wafer Projection legend';
  legend.appendChild(title);
  const addRow=(swatchClass,label)=>{
    const row=document.createElement('div');row.className='pat-legend-row';
    const swatch=document.createElement('span');swatch.className=`pat-legend-swatch ${swatchClass}`;
    const text=document.createElement('span');text.textContent=label;
    row.append(swatch,text);legend.appendChild(row);
  };
  if(view==='mask'){
    const polarity=state.gds.maskPolarity==='block'?'blocks light':'transmits light';
    addRow('optical',`Selected polygons — ${polarity}`);
    addRow('included','Included component boundary');
    addRow('excluded','Excluded component boundary');
    addRow('context','Unselected layer context');
    return;
  }
  addRow('wafer','Substrate / wafer');
  addRow('uv','UV light reaching substrate');
}

async function refreshPreview({force=false}={}){
  const key=currentPreviewKey();
  if(!force&&previewCacheKey===key){render();return {mask:maskPreview,projection:projectionPreview};}
  if(!force&&previewPendingKey===key&&previewPendingPromise)return previewPendingPromise;
  const generation=++previewGeneration;
  const maskPolygons=[],projectionPolygons=[];
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key))continue;
    for(const polygon of effectiveLayer(layer)){
      maskPolygons.push(polygon);
      projectionPolygons.push(polygon.map(([x,y])=>patTransform([x,y])));
    }
  }
  if(!maskPolygons.length){clearPreviewCache(true);previewCacheKey=key;render();return {mask:[],projection:[]};}
  previewBusy=true;render();
  const task=(async()=>{
    try{
      const outline=waferOutline();
      const maskRequest=composeMaskRegions(maskPolygons,'transmit',null);
      const projectionRequest=outline.length
        ?composeMaskRegions(projectionPolygons,state.gds.maskPolarity||'transmit',outline)
        :Promise.resolve({regions:[]});
      const [maskResult,projectionResult]=await Promise.all([maskRequest,projectionRequest]);
      if(generation!==previewGeneration||key!==currentPreviewKey())return {mask:maskPreview,projection:projectionPreview};
      maskPreview=maskResult.regions;projectionPreview=projectionResult.regions;previewCacheKey=key;previewBusy=false;render();
      return {mask:maskPreview,projection:projectionPreview};
    }catch(error){
      if(generation!==previewGeneration)return {mask:maskPreview,projection:projectionPreview};
      maskPreview=[];projectionPreview=[];previewCacheKey=null;previewBusy=false;render();
      const info=$('patPreviewInfo');if(info)info.textContent=`Preview failed: ${error.message}`;
      return {mask:[],projection:[]};
    }finally{
      if(previewPendingPromise===task){previewPendingKey=null;previewPendingPromise=null;}
    }
  })();
  previewPendingKey=key;previewPendingPromise=task;
  return task;
}

function syncTransformControls(){
  const transform=state.gds.transform||{};
  if($('patOffX'))$('patOffX').value=Number(transform.offsetX)||0;
  if($('patOffY'))$('patOffY').value=Number(transform.offsetY)||0;
  if($('patRot'))$('patRot').value=Number(transform.rotationDeg)||0;
  if($('patScale'))$('patScale').value=Number(transform.scale)||1;
}

function chooseComponent(layer,componentId,additive=false){
  if(!additive){
    layer.selectedComponentIds=[componentId];
  }else{
    const selected=new Set(Array.isArray(layer.selectedComponentIds)?layer.selectedComponentIds:[]);
    if(selected.has(componentId))selected.delete(componentId);else selected.add(componentId);
    layer.selectedComponentIds=[...selected];
  }
  saveShared();renderLayerList();refreshPreview();
}

function renderMask(svg){
  clearSvg(svg);renderLegend('mask');
  const outline=waferOutline();
  for(const layer of state.gds.layers){
    if(layer.visible===false) continue;
    if(state.patternSelectedKeys?.has(layer.key)) continue;
    const polygons=effectiveLayer(layer);
    const d=polygons.map(rawPoly=>polyPath(rawPoly.map(point=>viewPoint(point,'mask')),'mask')).join(' ');
    if(d)svg.appendChild(makeSvg('path',{d,fill:layer.color,'fill-opacity':'0.08',stroke:layer.color,'stroke-opacity':'0.35','stroke-width':'1','fill-rule':'nonzero','data-context-layer':layer.key,'data-region-count':polygons.length}));
  }
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key)||!Array.isArray(layer.components))continue;
    const explicit=Array.isArray(layer.selectedComponentIds)?new Set(layer.selectedComponentIds):null;
    for(const component of layer.components){
      const poly=component.polygon.map(point=>viewPoint(point,'mask'));
      const chosen=!explicit||explicit.has(component.id);
      const path=makeSvg('path',{d:polyPath(poly,'mask'),fill:chosen?'#f59e0b':'#94a3b8','fill-opacity':chosen?'0.15':'0.12',stroke:chosen?'#b45309':'#64748b','stroke-opacity':chosen?'0.75':'0.55','stroke-width':chosen?'1.2':'0.7','stroke-dasharray':chosen?'none':'3 3','data-component-id':component.id,'data-layer-key':layer.key});
      path.style.cursor='pointer';
      path.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseComponent(layer,component.id,event.shiftKey||event.ctrlKey||event.metaKey);});
      svg.appendChild(path);
    }
  }
  if(maskPreview.length){
    const d=maskPreview.map(poly=>polyPath(poly,'mask')).join(' ');
    svg.appendChild(makeSvg('path',{d,fill:'#f59e0b','fill-opacity':'0.38',stroke:'#b45309','stroke-width':'1.4','pointer-events':'none','fill-rule':'nonzero','data-mask-union':'true','data-region-count':maskPreview.length}));
  }
  if(lassoRect){
    const [x0,y0,x1,y1]=lassoRect;
    const p0=modelToSvg(x0,y0,'mask'), p1=modelToSvg(x1,y1,'mask');
    const x=Math.min(p0[0],p1[0]), y=Math.min(p0[1],p1[1]), w=Math.abs(p1[0]-p0[0]), h=Math.abs(p1[1]-p0[1]);
    svg.appendChild(makeSvg('rect',{x,y,width:w,height:h,fill:'#60a5fa','fill-opacity':'0.12',stroke:'#2563eb','stroke-width':'1.2','stroke-dasharray':'5 3','pointer-events':'none'}));
  }
  appendScaleBar(svg,'mask');
}

function renderProjection(svg){
  clearSvg(svg);renderLegend('projection');
  const outline=waferOutline(),hasWafer=outline.length>0;
  svg.appendChild(makeSvg('rect',{x:0,y:0,width:600,height:420,fill:'#faf9fc'}));
  if(!hasWafer){const t=makeSvg('text',{x:300,y:205,'text-anchor':'middle','font-size':'12',fill:'#94a3b8'});t.textContent='Create a substrate in Main to see the projection';svg.appendChild(t);return;}
  svg.appendChild(makeSvg('path',{d:polyPath(outline,'projection'),fill:'#eeebf2',stroke:'#6b6474','stroke-width':'1.2','data-projection-wafer':'true'}));
  if(projectionPreview.length){
    const defs=makeSvg('defs'),clip=makeSvg('clipPath',{id:'pat-uv-exposure-clip'}),shape=makeSvg('path',{d:projectionPreview.map(poly=>polyPath(poly,'projection')).join(' '),'fill-rule':'nonzero'});
    clip.appendChild(shape);defs.appendChild(clip);svg.appendChild(defs);
    svg.appendChild(makeSvg('rect',{x:0,y:0,width:600,height:420,fill:'#8b5cf6','fill-opacity':'0.62',stroke:'none','clip-path':'url(#pat-uv-exposure-clip)','data-uv-exposure':'true','data-region-count':projectionPreview.length,'pointer-events':'none'}));
  }
  svg.appendChild(makeSvg('path',{d:polyPath(outline,'projection'),fill:'none',stroke:'#6b6474','stroke-width':'1.2','pointer-events':'none'}));
  appendScaleBar(svg,'projection');
}

function render(){
  if(!viewBounds.mask)fitView('mask','mask',false);
  if(!viewBounds.projection)fitView('projection',projectionFitMode,false);
  renderMask($('patSvg'));renderProjection($('patProjectionSvg'));
  const hasWafer=waferOutline().length>0;
  if(previewBusy)$('patPreviewInfo').textContent='Updating physical mask projection…';
  else if(maskPreview.length&&projectionPreview.length)$('patPreviewInfo').textContent=`Filled mask union · ${projectionPreview.length} UV exposure region(s) clipped to substrate`;
  else if(maskPreview.length&&!hasWafer)$('patPreviewInfo').textContent='Filled mask ready · create a substrate in Main for projection';
  else $('patPreviewInfo').textContent=hasWafer?'Select mask layers/components to calculate UV exposure':'Import a mask and create a substrate';
  const hasSel = state.gds.layers.some(l=>state.patternSelectedKeys?.has(l.key));
  const applyBtn=$('patApplyBtn'); if(applyBtn){applyBtn.disabled=previewBusy||!hasSel||!projectionPreview.length||!hasWafer||state.gds.truncated===true;applyBtn.title=state.gds.truncated===true?'Incomplete layout: projection commit is blocked':'';}
  const waferHint=$('patWaferHint'); if(waferHint) waferHint.textContent = hasWafer ? `Wafer: ${state.wafer.shape} ${state.wafer.diameter? (state.wafer.diameter/1000).toFixed(1)+'mm':''}` : 'No wafer';
  const lassoInfo=$('patLassoInfo'); if(lassoInfo && lassoRect){
    const selCount = getLassoSelectedCount();
    lassoInfo.textContent = `${selCount} fragment(s) in lasso`;
  }
}

function getLassoSelectedCount(){
  if(!lassoRect) return 0;
  const [x0,y0,x1,y1]=lassoRect;
  const rectPoly=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  let cnt=0;
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key)) continue;
    for(const rawPoly of effectiveLayer(layer)){
      const poly=rawPoly.map(point=>viewPoint(point,'mask'));
      // check if poly centroid in rect or rect centroid in poly
      const c=centroid(poly);
      if(c.x>=Math.min(x0,x1) && c.x<=Math.max(x0,x1) && c.y>=Math.min(y0,y1) && c.y<=Math.max(y0,y1)) cnt++;
    }
  }
  return cnt;
}

function renderCellSelector(){
  const c = $('patHierarchy'); if(!c) return;
  const hierarchy = state.gds.hierarchy||[];
  const topCells = state.gds.topCells||[];
  const hasCells = hierarchy.length>0 || topCells.length>0 || state.gds.activeTopCell;
  if(!hasCells){ c.classList.add('hidden'); c.replaceChildren(); return; }
  c.classList.remove('hidden');
  const count = hierarchy.length || topCells.length || 1;
  c.replaceChildren();
  const heading=document.createElement('div');heading.style.cssText='font-weight:600;font-size:11px;color:#34414e;margin-bottom:6px';heading.textContent=`Cells · active: ${state.gds.activeTopCell||'—'} · ${count} total`;c.appendChild(heading);
  const sel=document.createElement('select'); sel.style.width='100%'; sel.style.marginBottom='8px';
  const distinctAll = new Set(hierarchy.flatMap(c=> (c.layers||[]).map(l=>`${l.layer}/${l.datatype}`)));
  const allOpt=document.createElement('option'); allOpt.value="__ALL__"; allOpt.textContent=`All local cell geometry (ignore placement) — ${distinctAll.size||hierarchy.length} layers`;
  if(state.gds.activeTopCell==="__ALL__") allOpt.selected=true;
  sel.appendChild(allOpt);
  for(const cell of hierarchy){
    const opt=document.createElement('option'); opt.value=cell.name; opt.textContent=`${cell.name}${topCells.includes(cell.name)?' ★':''} (${cell.local_polygon_count}) — ${cell.layers.map(l=>`${l.layer}/${l.datatype}`).join(', ')||'no layers'}`;
    if(cell.name===state.gds.activeTopCell) opt.selected=true;
    sel.appendChild(opt);
  }
  if(distinctAll.size > (state.gds.layers?.length||0)){
    const hint=document.createElement('div'); hint.style.fontSize='10px'; hint.style.color='#b45309'; hint.style.marginBottom='6px';
    hint.textContent=`This file has ${distinctAll.size} layers across ${hierarchy.length} cells, but active cell shows ${state.gds.layers.length}. Switch to "All cells" to see all.`;
    c.appendChild(hint);
  }
  sel.addEventListener('change',async()=>{
    const file = gdsFile || state._gdsFileBlob;
    if(!file){ alert('No file loaded to switch cell — please re-import the GDS/OAS file'); return; }
    const form=new FormData(); form.append('file', file); form.append('top_cell', sel.value);
    const res=await fetch('/api/gds/inspect',{method:'POST', body:form});
    if(!res.ok){ const j=await res.json().catch(()=>({detail:res.statusText})); alert(j.detail); return; }
    const data=await res.json();
    const {normalizeGds}=await import('../layout-model.js');
    const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,maskPolarity:state.gds.maskPolarity||'transmit',hierarchy:data.hierarchy,layers:data.layers.map((l,i)=>({...l,key:`${l.layer}/${l.datatype}`,alias:state.gds.layers.find(x=>x.key===`${l.layer}/${l.datatype}`)?.alias||'',inverted:false,fillPattern:false,mirrored:false,visible:true,color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]}))});
    state.gds=g;
    const {detectBorderOnly}=await import('../geometry.js');
    for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
    state.patternSelectedKeys=new Set();
    clearPreviewCache(true);saveShared();renderLayerList();renderCellSelector();
    if(patternsVisible()){viewBounds={mask:null,projection:null};fitPat();refreshPreview();}
  });
  c.appendChild(sel);
  const active = hierarchy.find(h=>h.name===state.gds.activeTopCell);
  if(active && active.references && active.references.length){
    const refs=document.createElement('div'); refs.style.fontSize='11px'; refs.style.color='#6b7785';
    for(const reference of active.references){const line=document.createElement('div');line.textContent=`→ ${reference.cell} @(${reference.origin[0].toFixed(0)},${reference.origin[1].toFixed(0)})`;refs.appendChild(line);}
    c.appendChild(refs);
  }
}
function renderLayerList(){
  const box=$('patLayerList'), cnt=$('patLayerCount'),filename=$('patLayoutFilename'),importText=$('patImportLayoutText');
  const hasLayers=state.gds.layers.length>0,fileLabel=state.gds.filename||state._gdsFileName||'';
  if(filename){filename.textContent=fileLabel;filename.title=fileLabel;}
  if(importText)importText.textContent=hasLayers?'Replace layout':'Import layout';
  if(!hasLayers){
    box.innerHTML='';cnt.textContent='0';
    const empty=document.createElement('div');empty.className='pat-layer-empty';
    const message=document.createElement('span');message.textContent='Import a GDSII or OASIS file to view layers.';
    const action=document.createElement('button');action.type='button';action.className='file-btn';action.textContent='Import layout';action.addEventListener('click',()=>$('gdsInput')?.click());
    empty.append(message,action);box.appendChild(empty);return;
  }
  cnt.textContent=String(state.gds.layers.length);
  box.innerHTML='';
  for(const layer of state.gds.layers){
    const row=document.createElement('div'); row.className='layer-row2' + (state.patternSelectedKeys?.has(layer.key)?' active':'');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state.patternSelectedKeys?.has(layer.key);
    // area guard: disable if line-like
    const areaOk=isAreaValid(effectiveLayer(layer));
    if(!areaOk){
      cb.disabled=true; cb.title='Line geometry has no area — Fill or close the shape to enable';
      row.style.opacity='0.55';
    }
    cb.addEventListener('change',()=>{ if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set(); if(cb.checked) state.patternSelectedKeys.add(layer.key); else state.patternSelectedKeys.delete(layer.key); renderLayerList(); saveShared(); refreshPreview(); });
    const sw=document.createElement('span'); sw.className='sw'; sw.style.background=layer.color;
    const opticalCount=Array.isArray(layer.components)?layer.components.length:layer.count;
    const selectedCount=Array.isArray(layer.selectedComponentIds)?layer.selectedComponentIds.length:opticalCount;
    const label=document.createElement('span'); label.textContent=`${layer.layer}/${layer.datatype} · ${layer.count} raw → ${opticalCount} filled · ${selectedCount} selected`; label.style.fontSize='12px';
    if(!areaOk){
      const warn=document.createElement('span'); warn.textContent=' · line (no area)'; warn.style.fontSize='10px'; warn.style.color='#b45309';
      label.appendChild(warn);
    }
    const alias=document.createElement('span'); alias.textContent=layer.alias?` alias:${layer.alias}`:''; alias.style.fontSize='11px'; alias.style.color='#6b7785';
    row.append(cb, sw, label, alias);
    if(Array.isArray(layer.components)&&Array.isArray(layer.selectedComponentIds)){
      const all=document.createElement('button');all.type='button';all.className='small';all.textContent='All';all.title='Use all filled boundaries in this layer';
      all.addEventListener('click',event=>{event.preventDefault();delete layer.selectedComponentIds;saveShared();renderLayerList();refreshPreview();});row.appendChild(all);
    }
    box.appendChild(row);
  }
  renderCellSelector();
}

async function importGds(file,topCell=null,preserveSettings=false){
  state._gdsFileBlob = file; state._gdsFileName = file.name;
  const previousGds=state.gds;
  const previousLayers=new Map((previousGds.layers||[]).map(layer=>[layer.key,layer]));
  const form=new FormData(); form.append('file', file); if(topCell)form.append('top_cell',topCell);
  setPatternStatus(`Reading ${file.name}…`);
  const res=await fetch('/api/gds/inspect',{method:'POST', body:form});
  if(!res.ok){ const j=await res.json().catch(()=>({detail:res.statusText})); setPatternStatus(j.detail); return; }
  const data=await res.json();
  const {normalizeGds} = await import('../layout-model.js');
  const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,hierarchy:data.hierarchy,truncated:data.truncated===true,polygonLimit:data.polygon_limit||20000,maskPolarity:preserveSettings?previousGds.maskPolarity:'transmit',committedProjection:preserveSettings?previousGds.committedProjection:null,transform:preserveSettings?previousGds.transform:undefined,layers:data.layers.map((l,i)=>{const key=`${l.layer}/${l.datatype}`,old=previousLayers.get(key);return {...l,key,alias:preserveSettings?old?.alias||'':'',inverted:preserveSettings&&old?.inverted===true,fillPattern:preserveSettings&&old?.fillPattern===true,filledPolygons:preserveSettings?old?.filledPolygons:undefined,mirrored:preserveSettings&&old?.mirrored===true,visible:preserveSettings?old?.visible!==false:true,color:preserveSettings&&old?.color?old.color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]};})});
  state.gds=g; gdsFile=file;
  const {detectBorderOnly}=await import('../geometry.js');
  for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
  if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set();
  setPatternStatus(`${data.filename}: ${data.layers.length} layers · ${data.active_top_cell} (tap Cell to switch)`);
  clearPreviewCache(true);saveShared();renderLayerList();
  if(patternsVisible()){viewBounds={mask:null,projection:null};fitPat();refreshPreview();}
}

async function migrateLegacyComponents(){
  let migratedLocally=false;
  for(const layer of state.gds.layers){
    if(!Array.isArray(layer.polygons)||!Array.isArray(layer.components))continue;
    const stale=layer.components.length!==layer.polygons.length||layer.components.some(component=>!Array.isArray(component.source_polygon_indices)||component.source_polygon_indices.length!==1);
    if(!stale)continue;
    const hadLegacySelection=Array.isArray(layer.selectedComponentIds);
    layer.components=layer.polygons.map((polygon,index)=>({id:`boundary-${layer.layer}-${layer.datatype}-${index}`,polygon,area:Math.abs(polygonArea(polygon)),bbox:bboxPolys([polygon]),source_polygon_indices:[index]}));
    layer.component_count=layer.components.length;
    if(hadLegacySelection)delete layer.selectedComponentIds;
    migratedLocally=true;
  }
  if(migratedLocally){setPatternStatus('Updated mask selection semantics; legacy merged selections were reset to all filled boundaries.');clearPreviewCache(true);saveShared();renderLayerList();refreshPreview();}
  const stale=state.gds.layers.some(layer=>Array.isArray(layer.components)&&layer.components.some(component=>!Array.isArray(component.source_polygon_indices)));
  const file=gdsFile||state._gdsFileBlob;
  if(!stale||!file||componentMigrationRunning)return;
  componentMigrationRunning=true;
  try{await importGds(file,state.gds.activeTopCell||null,true);}
  catch(error){setPatternStatus(`Unable to refresh legacy mask components: ${error.message}`);}
  finally{componentMigrationRunning=false;}
}

function applyToMain(){
  if(state.gds.truncated===true){const info=$('patPreviewInfo');if(info)info.textContent='Commit blocked: imported layout reached the polygon limit and is incomplete.';return;}
  const regions=projectionPreview;
  if(!state.wafer||!regions.length){const info=$('patPreviewInfo');if(info)info.textContent='Nothing to commit — create a substrate and verify the projection.';return;}
  const componentSelections={};
  for(const layer of state.gds.layers)if(state.patternSelectedKeys?.has(layer.key))componentSelections[layer.key]=Array.isArray(layer.selectedComponentIds)?[...layer.selectedComponentIds]:null;
  state.gds.committedProjection={
    regions:regions.map(poly=>poly.map(([x,y])=>[x,y])),
    polarity:state.gds.maskPolarity||'transmit',
    substrateFingerprint:substrateProjectionFingerprint(state.activeFace),
    sourceFingerprint:maskProjectionFingerprint(),
    face:state.activeFace||'front',
    transform:{...(state.gds.transform||{})},
    selectedLayerKeys:[...(state.patternSelectedKeys||[])],
    componentSelections,
    committedAt:new Date().toISOString()
  };
  const committedBounds=bboxPolys(regions);if(committedBounds)state.topBounds=viewAspectBounds(committedBounds,0.08);
  saveShared();
  const selection=$('selectionMode');if(selection){selection.value='imprinted';selection.dispatchEvent(new Event('change'));}
  if(window.showMainDock) window.showMainDock(); else window.location.href='/';
  const statusEl=$('statusText');if(statusEl)statusEl.textContent=`Committed ${regions.length} substrate projection region(s) to Main.`;
}

function saveAsNewPattern(){
  if(!lassoRect){ alert('Draw a lasso rectangle first (drag on empty canvas)'); return; }
  const [x0,y0,x1,y1]=lassoRect;
  const rectPoly=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const newPolys=[];
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key)) continue;
    for(const rawPoly of effectiveLayer(layer)){
      const poly=rawPoly.map(point=>viewPoint(point));
      // Lasso selects complete optical components; it never cuts a component
      // or turns the selection rectangle itself into mask geometry.
      const center=centroid(poly);
      if(center.x>=Math.min(x0,x1)&&center.x<=Math.max(x0,x1)&&center.y>=Math.min(y0,y1)&&center.y<=Math.max(y0,y1))newPolys.push(rawPoly);
    }
  }
  if(!newPolys.length){ alert('No optical components intersect the lasso'); return; }
  const newKey=`pattern:${Date.now()}`;
  const newLayer={key:newKey, layer:900+state.gds.layers.length, datatype:0, name:`Pattern ${state.gds.layers.length+1}`, count:newPolys.length, bbox:bboxPolys(newPolys), polygons:newPolys, visible:true, color:'#f59e0b', alias:`Pattern ${state.gds.layers.length+1}`, isVirtual:true, isBorderOnly:false};
  state.gds.layers.push(newLayer);
  state.patternSelectedKeys=new Set([newKey]);
  lassoRect=null;lassoActive=false;clearPreviewCache(true);saveShared();renderLayerList();refreshPreview();
  const name=prompt('Name for new pattern', newLayer.alias);
  if(name!==null){ newLayer.alias=name.trim()||newLayer.alias; renderLayerList(); }
}

// Init
renderLayerList();syncTransformControls();
if(patternsVisible()){fitPat();refreshPreview();}
window.patRender=()=>{
  if($('patMaskPolarity'))$('patMaskPolarity').value=state.gds.maskPolarity||'transmit';
  renderLayerList();syncTransformControls();
  if(!viewBounds.mask||!viewBounds.projection)fitPat();else render();
  if(previewCacheKey!==currentPreviewKey())refreshPreview();
  migrateLegacyComponents();
};
window.patSuspend=()=>{clearPreviewCache(true);clearSvg($('patSvg'));clearSvg($('patProjectionSvg'));};
if((()=>{const params=new URLSearchParams(location.search),qa=params.get('qa')||'';return params.get('debug')==='memory'||qa==='memory'||qa.includes('memory');})())window.patMemoryDiagnostics=()=>{
  const totals=polygons=>({polygons:polygons.length,points:polygons.reduce((sum,polygon)=>sum+polygon.length,0)});
  return {maskPreview:totals(maskPreview),projectionPreview:totals(projectionPreview),previewGeneration,previewPending:!!previewPendingPromise,previewBusy};
};
window.patReset=()=>{gdsFile=null;clearPreviewCache(true);lassoStart=null;lassoRect=null;lassoActive=false;viewBounds={mask:null,projection:null};renderLayerList();syncTransformControls();if(patternsVisible())fitPat();};
const _patGds = document.getElementById('patGdsInput');
if(_patGds) _patGds.addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importGds(f); });
const _patFit = document.getElementById('patFitBtn');
if(_patFit)_patFit.addEventListener('click',()=>fitPat());
const _projectionFit=document.getElementById('patProjectionFitBtn');
if(_projectionFit)_projectionFit.addEventListener('click',()=>{projectionFitMode=projectionFitMode==='wafer'?'projection':projectionFitMode==='projection'?'both':'wafer';fitPat();});
window.addEventListener('wafercad:gds-loaded',()=>{clearPreviewCache(true);renderLayerList();viewBounds={mask:null,projection:null};if(patternsVisible()){fitPat();refreshPreview();}else window.patSuspend();});
const _polarity=$('patMaskPolarity');
if(_polarity){_polarity.value=state.gds.maskPolarity||'transmit';_polarity.addEventListener('change',()=>{state.gds.maskPolarity=_polarity.value==='block'?'block':'transmit';saveShared();refreshPreview();});}
$('patPreviewBtn')?.addEventListener('click',()=>refreshPreview({force:true}));
$('patApplyBtn')?.addEventListener('click',applyToMain);
const _savePat=document.getElementById('patSavePatternBtn');
if(_savePat) _savePat.addEventListener('click', saveAsNewPattern);
['patOffX','patOffY','patRot','patScale'].forEach(id=> {
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('change',()=>{
    const get = i=> Number(document.getElementById(i)?.value)||0;
    state.gds.transform={offsetX:get('patOffX'), offsetY:get('patOffY'), rotationDeg:get('patRot'), scale:get('patScale')||1};
    saveShared(); refreshPreview();
  });
});
 function scaleBoundsAtFraction(bounds,factor,fx,fy){
   const [x0,y0,x1,y1]=bounds,anchorX=x0+(x1-x0)*fx,anchorY=y1-(y1-y0)*fy;
   return [anchorX+(x0-anchorX)*factor,anchorY+(y0-anchorY)*factor,anchorX+(x1-anchorX)*factor,anchorY+(y1-anchorY)*factor];
 }
 // Mask and Projection keep linked cameras; lasso and component editing stay on Mask only.
 function bindViewNavigation(svgId,view,allowLasso=false){
   const svg=$(svgId);if(!svg)return;
   svg.addEventListener('wheel',e=>{
     e.preventDefault();
     const rect=svg.getBoundingClientRect(),fx=(e.clientX-rect.left)/rect.width,fy=(e.clientY-rect.top)/rect.height,factor=Math.exp(Math.max(-500,Math.min(500,e.deltaY))*.0015);
     for(const linkedView of ['mask','projection'])if(viewBounds[linkedView])viewBounds[linkedView]=scaleBoundsAtFraction(viewBounds[linkedView],factor,fx,fy);
     render();
   }, {passive:false});
   let pan=null;
   let lassoDrag=null;
   svg.addEventListener('pointerdown',e=>{
     if(e.target!==svg){
       if(!lassoActive) return;
     }
     const isLasso = allowLasso&&lassoActive&&(e.shiftKey||$('patLassoToggle')?.checked);
     if(isLasso){
       const pt=svgToModel(e.offsetX,e.offsetY,view);
       lassoStart=pt; lassoRect=[pt.x,pt.y,pt.x,pt.y];
       lassoDrag=true;
       svg.setPointerCapture(e.pointerId);
       e.preventDefault();
       return;
     }
     if(e.target!==svg) return;
     pan={x:e.clientX,y:e.clientY,bounds:{mask:viewBounds.mask?[...viewBounds.mask]:null,projection:viewBounds.projection?[...viewBounds.projection]:null}}; svg.setPointerCapture(e.pointerId);
   });
   window.addEventListener('pointermove',e=>{
     if(lassoDrag && lassoStart){
       const rect=svg.getBoundingClientRect();
       const cur=svgToModel(e.clientX-rect.left,e.clientY-rect.top,view);
       lassoRect=[lassoStart.x,lassoStart.y,cur.x,cur.y];
       render();
       return;
     }
     if(!pan) return;
     const r=svg.getBoundingClientRect(),fx=(e.clientX-pan.x)/r.width,fy=(e.clientY-pan.y)/r.height;
     for(const linkedView of ['mask','projection']){const bounds=pan.bounds[linkedView];if(!bounds)continue;const [x0,y0,x1,y1]=bounds,dx=fx*(x1-x0),dy=fy*(y1-y0);viewBounds[linkedView]=[x0-dx,y0+dy,x1-dx,y1+dy];}
     render();
   });
   window.addEventListener('pointerup',e=>{
     if(lassoDrag){
       lassoDrag=false;
       // keep rect for Save
       render();
     }
     pan=null;
   });
   svg.addEventListener('dblclick',()=>fitPat());
 }
 bindViewNavigation('patSvg','mask',true);bindViewNavigation('patProjectionSvg','projection',false);
 const tgl=$('patLassoToggle');if(tgl)tgl.addEventListener('change',()=>{lassoActive=tgl.checked;if(!lassoActive){lassoRect=null;render();}});
