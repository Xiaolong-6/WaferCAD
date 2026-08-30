import {state, persistSharedState} from '../core.js';
import {waferOutline, bboxPolys, isSimplePolygon, viewAspectBounds, waferBounds, polygonArea, pointInPoly, centroid} from '../geometry.js';
import {composeMaskRegions} from '../geometry-api.js';
import {effectiveLayerPolygons} from '../layout-model.js';
import {clearSvg, makeSvg} from '../svg.js';
import * as Bool from './boolean.js';

const $ = id => document.getElementById(id);
let gdsFile = null;

function saveShared(){ persistSharedState(); }
function patTransform([x,y]){
  const t=state.gds.transform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1};
  const s=Number(t.scale)||1, sx=x*s, sy=y*s;
  const a=(Number(t.rotationDeg)||0)*Math.PI/180, c=Math.cos(a), s2=Math.sin(a);
  return [sx*c - sy*s2 + (Number(t.offsetX)||0), sx*s2 + sy*c + (Number(t.offsetY)||0)];
}
function effectiveLayer(l){ return effectiveLayerPolygons(l); }
function isAreaValid(polys){
  if(!polys.length) return false;
  let total=0;
  for(const p of polys) total+=Math.abs(polygonArea(p));
  return total > 1e-6; // ~1 nm²
}

let topBounds=null;
let fitMode='gds'; // gds | wafer | both
function fitPat(mode){
  if(mode) fitMode=mode;
  const outline=waferOutline();
  const waferBB = outline.length ? bboxPolys([outline]) : null;
  let gdsTransBB=null;
  if(state.gds.layers.length){
    const allTransPolys = state.gds.layers.flatMap(l=> effectiveLayer(l).map(p=>p.map(([x,y])=>patTransform([x,y]))));
    if(allTransPolys.length) gdsTransBB = bboxPolys(allTransPolys);
  }
  if(!gdsTransBB && state.gds.bbox) gdsTransBB=[...state.gds.bbox];
  let bb=null;
  if(fitMode==='gds' && gdsTransBB) bb=[...gdsTransBB];
  else if(fitMode==='wafer' && waferBB) bb=[...waferBB];
  else if(waferBB && gdsTransBB) bb=[Math.min(waferBB[0],gdsTransBB[0]), Math.min(waferBB[1],gdsTransBB[1]), Math.max(waferBB[2],gdsTransBB[2]), Math.max(waferBB[3],gdsTransBB[3])];
  else bb = waferBB || gdsTransBB || [-50000,-50000,50000,50000];
  topBounds = viewAspectBounds(bb,0.12);
  render();
  const btn=$('patFitBtn'); if(btn) btn.textContent = fitMode==='gds' ? 'Fit: GDS' : fitMode==='wafer' ? 'Fit: Wafer' : 'Fit: Both';
}
function modelToSvg(x,y){
  const [x0,y0,x1,y1]=topBounds||[-1,-1,1,1];
  const W=600,H=420; return [(x-x0)/(x1-x0)*W, H-(y-y0)/(y1-y0)*H];
}
function svgToModel(sx,sy){
  const [x0,y0,x1,y1]=topBounds||[-1,-1,1,1];
  return {x: x0 + sx/600*(x1-x0), y: y0 + (1 - sy/420)*(y1-y0)};
}
function polyPath(poly){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1]); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }

// Lasso state
let lassoStart=null, lassoRect=null, lassoActive=false;
let highlightMode='top'; // top | wafer | none
let resolvedPreview=[];
let previewGeneration=0;

async function refreshPreview(){
  const generation=++previewGeneration;
  const polygons=[];
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key))continue;
    for(const polygon of effectiveLayer(layer))polygons.push(polygon.map(([x,y])=>patTransform([x,y])));
  }
  if(!polygons.length){resolvedPreview=[];render();return;}
  try{
    const outline=waferOutline();
    const result=await composeMaskRegions(polygons,state.gds.maskPolarity||'transmit',outline.length?outline:null);
    if(generation!==previewGeneration)return;
    resolvedPreview=result.regions;
    render();
  }catch(error){
    if(generation!==previewGeneration)return;
    resolvedPreview=[];
    const info=$('patPreviewInfo');if(info)info.textContent=`Preview failed: ${error.message}`;
  }
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

function getTopFaces(){
  // Compute top faces that intersect current preview (for highlight)
  if(!state.wafer || !state.solids.length) return [];
  const preview = computePreview();
  if(!preview.length) return [];
  const res=[];
  for(const solid of state.solids){
    const c=centroid(solid.footprint);
    // check if solid is top at its centroid (simple)
    let isTop=true;
    for(const other of state.solids){
      if(other===solid) continue;
      if(other.zMin > solid.zMax - 1e-7 && pointInPoly(c, other.footprint)) { isTop=false; break; }
    }
    if(!isTop) continue;
    // check if solid footprint intersects preview (via centroid in preview or vice versa)
    const sc = centroid(solid.footprint);
    let intersects=false;
    for(const pp of preview){
      if(pointInPoly(sc, pp)) { intersects=true; break; }
      // also check preview centroid in solid
      const pc = centroid(pp);
      if(pointInPoly(pc, solid.footprint)) { intersects=true; break; }
    }
    if(intersects) res.push(solid);
  }
  return res;
}

function render(){
  const svg=$('patSvg'); clearSvg(svg);
  if(!topBounds) fitPat();
  const outline=waferOutline();
  const hasWafer = outline.length>0;
  if(hasWafer){
    svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.2'}));
    if($('patShowWafer') && $('patShowWafer').checked){
      svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#cbd5e1','fill-opacity':'0.22',stroke:'none','pointer-events':'none'}));
    }
  } else {
    svg.appendChild(makeSvg('rect',{x:0,y:0,width:600,height:420,fill:'#f8fafc'}));
    const t=makeSvg('text',{x:300,y:200,'text-anchor':'middle','font-size':'12',fill:'#94a3b8'}); t.textContent='No wafer — create one in Main or import preview is unclipped'; svg.appendChild(t);
  }
  // highlight: wafer invert region (when invert mode) or top faces
  if($('patHighlight') && $('patHighlight').value!=='none'){
    const mode=$('patHighlight').value;
    if(mode==='wafer' && hasWafer){
      const allPolys = state.gds.layers.flatMap(l=> effectiveLayer(l).map(p=>p.map(([x,y])=>patTransform([x,y]))));
      if(allPolys.length){
        try{
          const uni = Bool.union(allPolys);
          const inv = Bool.difference([outline], uni);
          for(const poly of inv){
            svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:'#fbbf24','fill-opacity':'0.18',stroke:'#d97706','stroke-width':'1','stroke-dasharray':'4 3','pointer-events':'none'}));
          }
        }catch{}
      }
    } else if(mode==='top'){
      const tops=getTopFaces();
      for(const solid of tops){
        const poly=solid.footprint.map(([x,y])=>patTransform([x,y])); // note: top faces are model, not GDS transformed, but they are in wafer coords already
        // For model top faces, they are already in wafer coords (µm), no GDS transform needed
        // So use original
        const orig = solid.footprint;
        svg.appendChild(makeSvg('path',{d:polyPath(orig),fill:'#60a5fa','fill-opacity':'0.22',stroke:'#2563eb','stroke-width':'1.6','stroke-dasharray':'6 3','pointer-events':'none'}));
      }
    }
  }
  // draw faint background of all visible layers (unselected) for context
  for(const layer of state.gds.layers){
    if(layer.visible===false) continue;
    if(state.patternSelectedKeys?.has(layer.key)) continue;
    for(const rawPoly of effectiveLayer(layer)){
      const poly=rawPoly.map(([x,y])=>patTransform([x,y]));
      svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:layer.color,'fill-opacity':'0.08',stroke:layer.color,'stroke-opacity':'0.35','stroke-width':'1'}));
    }
  }
  // Optical component hit targets. A first click isolates one component;
  // Shift/Ctrl-click toggles additional components without guessing by size.
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key)||!Array.isArray(layer.components))continue;
    const explicit=Array.isArray(layer.selectedComponentIds)?new Set(layer.selectedComponentIds):null;
    for(const component of layer.components){
      const poly=component.polygon.map(([x,y])=>patTransform([x,y]));
      const chosen=!explicit||explicit.has(component.id);
      const path=makeSvg('path',{d:polyPath(poly),fill:'transparent',stroke:chosen?'#b45309':'#94a3b8','stroke-opacity':chosen?'0.75':'0.5','stroke-width':chosen?'1.2':'0.7','stroke-dasharray':chosen?'none':'3 3','data-component-id':component.id,'data-layer-key':layer.key});
      path.style.cursor='pointer';
      path.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseComponent(layer,component.id,event.shiftKey||event.ctrlKey||event.metaKey);});
      svg.appendChild(path);
    }
  }
  // preview previewPolys (selected)
  const preview = computePreview();
  for(const poly of preview){
    svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:'#f59e0b','fill-opacity':'0.38',stroke:'#b45309','stroke-width':'1.4','pointer-events':'none'}));
  }
  // lasso rect
  if(lassoRect){
    const [x0,y0,x1,y1]=lassoRect;
    const p0=modelToSvg(x0,y0), p1=modelToSvg(x1,y1);
    const x=Math.min(p0[0],p1[0]), y=Math.min(p0[1],p1[1]), w=Math.abs(p1[0]-p0[0]), h=Math.abs(p1[1]-p0[1]);
    svg.appendChild(makeSvg('rect',{x,y,width:w,height:h,fill:'#60a5fa','fill-opacity':'0.12',stroke:'#2563eb','stroke-width':'1.2','stroke-dasharray':'5 3','pointer-events':'none'}));
  }
  // draw wafer outline on top
  if(hasWafer) svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'none',stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4 3','pointer-events':'none'}));

  if(!hasWafer && preview.length) $('patPreviewInfo').textContent = `${preview.length} preview region(s) · unclipped (no wafer)`;
  else if(preview.length) $('patPreviewInfo').textContent = `${preview.length} preview region(s) · clipped to wafer`;
  else $('patPreviewInfo').textContent = hasWafer ? 'No preview — select active layers' : 'No preview — select layers (unclipped preview)';
  const hasSel = state.gds.layers.some(l=>state.patternSelectedKeys?.has(l.key));
  const applyBtn=$('patApplyBtn'); if(applyBtn) applyBtn.disabled = !hasSel || !preview.length;
  const waferHint=$('patWaferHint'); if(waferHint) waferHint.textContent = hasWafer ? `Wafer: ${state.wafer.shape} ${state.wafer.diameter? (state.wafer.diameter/1000).toFixed(1)+'mm':''}` : 'No wafer';
  // update lasso count
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
      const poly=rawPoly.map(([x,y])=>patTransform([x,y]));
      // check if poly centroid in rect or rect centroid in poly
      const c=centroid(poly);
      if(c.x>=Math.min(x0,x1) && c.x<=Math.max(x0,x1) && c.y>=Math.min(y0,y1) && c.y<=Math.max(y0,y1)) cnt++;
    }
  }
  return cnt;
}

function computePreview(){
  return resolvedPreview;
}

function renderCellSelector(){
  const c = $('patHierarchy'); if(!c) return;
  const hierarchy = state.gds.hierarchy||[];
  const topCells = state.gds.topCells||[];
  const hasCells = hierarchy.length>0 || topCells.length>0 || state.gds.activeTopCell;
  if(!hasCells){ c.classList.add('hidden'); c.innerHTML=''; return; }
  c.classList.remove('hidden');
  const count = hierarchy.length || topCells.length || 1;
  c.innerHTML=`<div style="font-weight:600;font-size:11px;color:#34414e;margin-bottom:6px">Cells · active: ${state.gds.activeTopCell||'—'} · ${count} total</div>`;
  const sel=document.createElement('select'); sel.style.width='100%'; sel.style.marginBottom='8px';
  const distinctAll = new Set(hierarchy.flatMap(c=> (c.layers||[]).map(l=>`${l.layer}/${l.datatype}`)));
  const allOpt=document.createElement('option'); allOpt.value="__ALL__"; allOpt.textContent=`All cells — ${distinctAll.size||hierarchy.length} layers total`;
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
    let file = gdsFile || state._gdsFileBlob;
    if(!file){
      try{
        const b64=sessionStorage.getItem('wafercad_gds_blob');
        const name=sessionStorage.getItem('wafercad_gds_name')||'file.gds';
        if(b64){ const bytes=Uint8Array.from(atob(b64), c=>c.charCodeAt(0)); file=new File([bytes], name); gdsFile=file; state._gdsFileBlob=file; }
      }catch{}
    }
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
    resolvedPreview=[]; saveShared(); renderLayerList(); renderCellSelector(); fitPat(); refreshPreview();
  });
  c.appendChild(sel);
  const active = hierarchy.find(h=>h.name===state.gds.activeTopCell);
  if(active && active.references && active.references.length){
    const refs=document.createElement('div'); refs.style.fontSize='11px'; refs.style.color='#6b7785';
    refs.innerHTML = active.references.map(r=>`→ ${r.cell} @(${r.origin[0].toFixed(0)},${r.origin[1].toFixed(0)})`).join('<br>');
    c.appendChild(refs);
  }
}
function renderLayerList(){
  const box=$('patLayerList'), cnt=$('patLayerCount');
  if(!state.gds.layers.length){ box.textContent='Import a file to view layers.'; cnt.textContent='0'; return; }
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
    const label=document.createElement('span'); label.textContent=`${layer.layer}/${layer.datatype} · ${layer.count} raw → ${opticalCount} optical · ${selectedCount} selected`; label.style.fontSize='12px';
    if(!areaOk){
      const warn=document.createElement('span'); warn.textContent=' · line (no area)'; warn.style.fontSize='10px'; warn.style.color='#b45309';
      label.appendChild(warn);
    }
    const alias=document.createElement('span'); alias.textContent=layer.alias?` alias:${layer.alias}`:''; alias.style.fontSize='11px'; alias.style.color='#6b7785';
    row.append(cb, sw, label, alias);
    if(Array.isArray(layer.components)&&Array.isArray(layer.selectedComponentIds)){
      const all=document.createElement('button');all.type='button';all.className='small';all.textContent='All';all.title='Use all optical components in this layer';
      all.addEventListener('click',event=>{event.preventDefault();delete layer.selectedComponentIds;saveShared();renderLayerList();refreshPreview();});row.appendChild(all);
    }
    box.appendChild(row);
  }
  renderCellSelector();
}

async function importGds(file){
  state._gdsFileBlob = file; state._gdsFileName = file.name;
  try{
    const reader=new FileReader();
    reader.onload=()=>{ try{ const b64=String(reader.result).split(',')[1]; sessionStorage.setItem('wafercad_gds_blob', b64); sessionStorage.setItem('wafercad_gds_name', file.name); }catch{} };
    reader.readAsDataURL(file);
  }catch{}
  const form=new FormData(); form.append('file', file);
  $('patStatus').textContent=`Reading ${file.name}…`;
  const res=await fetch('/api/gds/inspect',{method:'POST', body:form});
  if(!res.ok){ const j=await res.json().catch(()=>({detail:res.statusText})); $('patStatus').textContent=j.detail; return; }
  const data=await res.json();
  const {normalizeGds} = await import('../layout-model.js');
  const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,hierarchy:data.hierarchy,layers:data.layers.map((l,i)=>({...l,key:`${l.layer}/${l.datatype}`,alias:'',inverted:false,fillPattern:false,mirrored:false,visible:true,color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]}))});
  state.gds=g; gdsFile=file;
  const {detectBorderOnly}=await import('../geometry.js');
  for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
  if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set();
  $('patStatus').textContent=`${data.filename}: ${data.layers.length} layers · ${data.active_top_cell} (tap Cell to switch)`;
  resolvedPreview=[]; saveShared(); renderLayerList(); fitPat(); refreshPreview();
}

function applyToMain(){
  saveShared();
  if(window.showMainDock) window.showMainDock();
  else window.location.href='/';
}

function saveAsNewPattern(){
  if(!lassoRect){ alert('Draw a lasso rectangle first (drag on empty canvas)'); return; }
  const [x0,y0,x1,y1]=lassoRect;
  const rectPoly=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const newPolys=[];
  for(const layer of state.gds.layers){
    if(!state.patternSelectedKeys?.has(layer.key)) continue;
    for(const rawPoly of effectiveLayer(layer)){
      const poly=rawPoly.map(([x,y])=>patTransform([x,y]));
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
  lassoRect=null; lassoActive=false;
  resolvedPreview=[]; saveShared(); renderLayerList(); refreshPreview();
  const name=prompt('Name for new pattern', newLayer.alias);
  if(name!==null){ newLayer.alias=name.trim()||newLayer.alias; renderLayerList(); }
}

function handleInvertWafer(){
  const outline=waferOutline();
  if(!outline.length){ alert('Create a wafer first'); return; }
  // set invert mode to wafer and select it
  const sel=$('patInvertMode'); if(sel) sel.value='wafer';
  // create a virtual invert layer as preview (wafer minus union)
  const allPolys=state.gds.layers.flatMap(l=> effectiveLayer(l).map(p=>p.map(([x,y])=>patTransform([x,y]))));
  if(!allPolys.length){ alert('No layers to invert'); return; }
  try{
    const uni=Bool.union(allPolys);
    const inv=Bool.difference([outline], uni);
    if(!inv.length){ alert('Invert produced no region'); return; }
    const newKey=`invert:${Date.now()}`;
    const newLayer={key:newKey, layer:800, datatype:0, name:'Wafer invert', count:inv.length, bbox:bboxPolys(inv), polygons:inv.map(p=>p.map(([x,y])=>[x,y])), visible:true, color:'#a78bfa', alias:'Wafer invert', isVirtual:true, isBorderOnly:false};
    // store untransformed (already transformed) but need to store as is for preview (no further transform)
    // To keep consistent, store as already transformed and set a flag to skip patTransform
    newLayer._alreadyTransformed=true;
    state.gds.layers.push(newLayer);
    state.patternSelectedKeys=new Set([newKey]);
    saveShared(); renderLayerList(); render();
  }catch(e){ alert('Invert failed: '+e.message); }
}

// Init
renderLayerList();
if(state.wafer) fitPat(); else { topBounds=[-60000,-60000,60000,60000]; render(); }
refreshPreview();
window.patRender = ()=>{ if($('patMaskPolarity'))$('patMaskPolarity').value=state.gds.maskPolarity||'transmit'; renderLayerList(); render(); refreshPreview(); };
window.patReset = ()=>{ gdsFile=null;resolvedPreview=[];previewGeneration++;lassoStart=null;lassoRect=null;lassoActive=false;topBounds=[-60000,-60000,60000,60000];renderLayerList();render(); };
const _patGds = document.getElementById('patGdsInput');
if(_patGds) _patGds.addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importGds(f); });
const _patFit = document.getElementById('patFitBtn');
if(_patFit) _patFit.addEventListener('click', ()=>{
  fitMode = fitMode==='gds' ? 'wafer' : fitMode==='wafer' ? 'both' : 'gds';
  fitPat();
});
const _mainGds = document.getElementById('gdsInput');
if(_mainGds) _mainGds.addEventListener('change',()=> setTimeout(()=>{ renderLayerList(); resolvedPreview=[]; render(); refreshPreview(); }, 300));
['patShowWafer','patHighlight'].forEach(id=>document.getElementById(id)?.addEventListener('change',render));
const _polarity=$('patMaskPolarity');
if(_polarity){_polarity.value=state.gds.maskPolarity||'transmit';_polarity.addEventListener('change',()=>{state.gds.maskPolarity=_polarity.value==='block'?'block':'transmit';saveShared();refreshPreview();});}
$('patPreviewBtn')?.addEventListener('click',refreshPreview);
$('patApplyBtn')?.addEventListener('click',applyToMain);
const _savePat=document.getElementById('patSavePatternBtn');
if(_savePat) _savePat.addEventListener('click', saveAsNewPattern);
const _invertWafer=document.getElementById('patInvertWaferBtn');
if(_invertWafer) _invertWafer.addEventListener('click', handleInvertWafer);
['patOffX','patOffY','patRot','patScale'].forEach(id=> {
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('change',()=>{
    const get = i=> Number(document.getElementById(i)?.value)||0;
    state.gds.transform={offsetX:get('patOffX'), offsetY:get('patOffY'), rotationDeg:get('patRot'), scale:get('patScale')||1};
    saveShared(); refreshPreview();
  });
});
 // pan/zoom for patterns page (simple) + lasso
 (function(){
   const svg=$('patSvg');
   svg.addEventListener('wheel',e=>{
     e.preventDefault();
     const factor=Math.exp(e.deltaY*0.0015);
     const [x0,y0,x1,y1]=topBounds;
     const cx=(x0+x1)/2, cy=(y0+y1)/2;
     const w=(x1-x0)*factor, h=(y1-y0)*factor;
     topBounds=[cx-w/2,cy-h/2,cx+w/2,cy+h/2];
     render();
   }, {passive:false});
   let pan=null;
   let lassoDrag=null;
   svg.addEventListener('pointerdown',e=>{
     if(e.target!==svg){
       // check if clicking on empty vs on pattern? For now only lasso on empty when toggle active
       if(!lassoActive) return;
     }
     const isLasso = lassoActive && (e.shiftKey || $('patLassoToggle')?.checked);
     if(isLasso){
       const pt=svgToModel(e.offsetX, e.offsetY);
       lassoStart=pt; lassoRect=[pt.x,pt.y,pt.x,pt.y];
       lassoDrag=true;
       svg.setPointerCapture(e.pointerId);
       e.preventDefault();
       return;
     }
     if(e.target!==svg) return;
     pan={x:e.clientX,y:e.clientY,bounds:[...topBounds]}; svg.setPointerCapture(e.pointerId);
   });
   window.addEventListener('pointermove',e=>{
     if(lassoDrag && lassoStart){
       const rect=svg.getBoundingClientRect();
       const cur=svgToModel(e.clientX-rect.left, e.clientY-rect.top);
       lassoRect=[lassoStart.x,lassoStart.y,cur.x,cur.y];
       render();
       return;
     }
     if(!pan) return;
     const r=svg.getBoundingClientRect(); const [x0,y0,x1,y1]=pan.bounds; const dx=(e.clientX-pan.x)/r.width*(x1-x0), dy=(e.clientY-pan.y)/r.height*(y1-y0); topBounds=[x0-dx,y0+dy,x1-dx,y1+dy]; render();
   });
   window.addEventListener('pointerup',e=>{
     if(lassoDrag){
       lassoDrag=false;
       // keep rect for Save
       render();
     }
     pan=null;
   });
   // toggle lasso mode
   const tgl=$('patLassoToggle'); if(tgl) tgl.addEventListener('change',()=>{ lassoActive=tgl.checked; if(!lassoActive){ lassoRect=null; render(); } });
 })();
