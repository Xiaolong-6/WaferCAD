import {state, loadSharedState, persistSharedState} from '../core.js';
import {waferOutline, bboxPolys, isSimplePolygon, viewAspectBounds, waferBounds} from '../geometry.js';
import {clearSvg, makeSvg} from '../svg.js';
import * as Bool from './boolean.js';

const $ = id => document.getElementById(id);
let gdsFile = null;

function saveShared(){ persistSharedState(); }
function loadShared(){ loadSharedState(); }
function patTransform([x,y]){
  const t=state.gds.transform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1};
  const s=Number(t.scale)||1, sx=x*s, sy=y*s;
  const a=(Number(t.rotationDeg)||0)*Math.PI/180, c=Math.cos(a), s2=Math.sin(a);
  return [sx*c - sy*s2 + (Number(t.offsetX)||0), sx*s2 + sy*c + (Number(t.offsetY)||0)];
}
function effectiveLayer(l){ return l.fillPattern===true && Array.isArray(l.filledPolygons) ? l.filledPolygons : (l.polygons||[]); }

let topBounds=null;
let fitMode='gds'; // gds | wafer | both
function fitPat(mode){
  if(mode) fitMode=mode;
  const outline=waferOutline();
  const waferBB = outline.length ? bboxPolys([outline]) : null;
  // compute transformed GDS bbox (after patTransform) for accurate fit
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
  // update button label
  const btn=$('patFitBtn'); if(btn) btn.textContent = fitMode==='gds' ? 'Fit: GDS' : fitMode==='wafer' ? 'Fit: Wafer' : 'Fit: Both';
}
function modelToSvg(x,y){
  const [x0,y0,x1,y1]=topBounds||[-1,-1,1,1];
  const W=600,H=420; return [(x-x0)/(x1-x0)*W, H-(y-y0)/(y1-y0)*H];
}
function polyPath(poly){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1]); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }

function render(){
  const svg=$('patSvg'); clearSvg(svg);
  if(!topBounds) fitPat();
  const outline=waferOutline();
  const hasWafer = outline.length>0;
  if(hasWafer){
    svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.2'}));
    if($('patShowWafer').checked){
      svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#cbd5e1','fill-opacity':'0.22',stroke:'none','pointer-events':'none'}));
    }
  } else {
    // No wafer yet — show hint background
    svg.appendChild(makeSvg('rect',{x:0,y:0,width:600,height:420,fill:'#f8fafc'}));
    const t=makeSvg('text',{x:300,y:200,'text-anchor':'middle','font-size':'12',fill:'#94a3b8'}); t.textContent='No wafer — create one in Main or import preview is unclipped'; svg.appendChild(t);
  }
  // draw faint background of all visible layers (unselected) for context
  for(const layer of state.gds.layers){
    if(layer.visible===false) continue;
    // skip active layers (they will be drawn as preview)
    if(state.patternSelectedKeys?.has(layer.key)) continue;
    for(const poly of effectiveLayer(layer).map(p=>p.map(([x,y])=>patTransform([x,y])))){
      svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:layer.color,'fill-opacity':'0.08',stroke:layer.color,'stroke-opacity':'0.35','stroke-width':'1'}));
    }
  }
  // preview previewPolys (selected)
  const preview = computePreview();
  for(const poly of preview){
    svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:'#f59e0b','fill-opacity':'0.38',stroke:'#b45309','stroke-width':'1.4'}));
  }
  // draw wafer outline on top
  if(hasWafer) svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'none',stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4 3','pointer-events':'none'}));

  if(!hasWafer && preview.length) $('patPreviewInfo').textContent = `${preview.length} preview region(s) · unclipped (no wafer)`;
  else if(preview.length) $('patPreviewInfo').textContent = `${preview.length} preview region(s) · clipped to wafer`;
  else $('patPreviewInfo').textContent = hasWafer ? 'No preview — select active layers' : 'No preview — select layers (unclipped preview)';
  const hasSel = state.gds.layers.some(l=>state.patternSelectedKeys?.has(l.key));
  $('patApplyBtn').disabled = !hasSel || !preview.length;
  const waferHint=$('patWaferHint'); if(waferHint) waferHint.textContent = hasWafer ? `Wafer: ${state.wafer.shape} ${state.wafer.diameter? (state.wafer.diameter/1000).toFixed(1)+'mm':''}` : 'No wafer';
}

function computePreview(){
  const outline=waferOutline();
  const hasWafer = outline.length>0;
  const mode=$('patInvertMode').value;
  const showFill=$('patShowFill').checked;
  const activeKeys=[... (state.patternSelectedKeys||new Set())];
  const activeLayers=state.gds.layers.filter(l=>activeKeys.includes(l.key));
  if(!activeLayers.length) return [];
  const perLayerGroups=[];
  const allPolys=[];
  for(const layer of activeLayers){
    let polys = effectiveLayer(layer).map(p=>p.map(([x,y])=>patTransform([x,y])));
    if(showFill && layer.isBorderOnly){
      try{ polys = Bool.union(polys); }catch{}
    }
    if(!polys.length) continue;
    perLayerGroups.push(polys);
    allPolys.push(...polys);
  }
  if(!allPolys.length) return [];
  // No wafer → show unclipped union (preview)
  if(!hasWafer){
    try{ return Bool.union(allPolys); }catch{ return allPolys; }
  }
  try{
    if(mode==='global'){
      const u = Bool.union(allPolys);
      return Bool.difference([outline], u);
    } else {
      return Bool.previewPerLayerInvert(outline, perLayerGroups);
    }
  }catch(e){ console.warn(e); return []; }
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
  // dropdown - include All cells aggregate on top
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
  // hint if file has layers spread across cells
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
    const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,hierarchy:data.hierarchy,layers:data.layers.map((l,i)=>({...l,key:`${l.layer}/${l.datatype}`,alias:state.gds.layers.find(x=>x.key===`${l.layer}/${l.datatype}`)?.alias||'',inverted:false,fillPattern:false,mirrored:false,visible:true,color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]}))});
    state.gds=g;
    const {detectBorderOnly}=await import('../geometry.js');
    for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
    state.patternSelectedKeys=new Set();
    saveShared(); renderLayerList(); renderCellSelector(); fitPat();
  });
  c.appendChild(sel);
  // show hierarchy refs for active
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
    cb.addEventListener('change',()=>{ if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set(); if(cb.checked) state.patternSelectedKeys.add(layer.key); else state.patternSelectedKeys.delete(layer.key); renderLayerList(); render(); saveShared(); });
    const sw=document.createElement('span'); sw.className='sw'; sw.style.background=layer.color;
    const label=document.createElement('span'); label.textContent=`${layer.layer}/${layer.datatype} · ${layer.count}`; label.style.fontSize='12px';
    const alias=document.createElement('span'); alias.textContent=layer.alias?` alias:${layer.alias}`:''; alias.style.fontSize='11px'; alias.style.color='#6b7785';
    row.append(cb, sw, label, alias);
    box.appendChild(row);
  }
  renderCellSelector();
}

async function importGds(file){
  state._gdsFileBlob = file; state._gdsFileName = file.name;
  // persist file for cell switching after reload/dock switch (base64 in sessionStorage)
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
  // Reuse layout-model normalize
  const {normalizeGds} = await import('../layout-model.js');
  const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,hierarchy:data.hierarchy,layers:data.layers.map((l,i)=>({...l,key:`${l.layer}/${l.datatype}`,alias:'',inverted:false,fillPattern:false,mirrored:false,visible:true,color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]}))});
  state.gds=g; gdsFile=file;
  const {detectBorderOnly}=await import('../geometry.js');
  for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
  if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set();
  // auto-select first layer for immediate preview if none selected
  if(state.patternSelectedKeys.size===0 && state.gds.layers.length) state.patternSelectedKeys.add(state.gds.layers[0].key);
  $('patStatus').textContent=`${data.filename}: ${data.layers.length} layers · ${data.active_top_cell} (tap Cell to switch)`;
  saveShared(); renderLayerList(); fitPat();
}

function applyToMain(){
  saveShared();
  if(window.showMainDock) window.showMainDock();
  else window.location.href='/';
}

// Init
loadShared();
renderLayerList();
if(state.wafer) fitPat(); else { topBounds=[-60000,-60000,60000,60000]; render(); }
window.patRender = ()=>{ loadShared(); renderLayerList(); render(); };
const _patGds = document.getElementById('patGdsInput');
if(_patGds) _patGds.addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importGds(f); });
const _patFit = document.getElementById('patFitBtn');
if(_patFit) _patFit.addEventListener('click', ()=>{
  // cycle gds -> wafer -> both
  fitMode = fitMode==='gds' ? 'wafer' : fitMode==='wafer' ? 'both' : 'gds';
  fitPat();
});
// also allow main gdsInput to populate patterns when dock is used
const _mainGds = document.getElementById('gdsInput');
if(_mainGds) _mainGds.addEventListener('change',()=> setTimeout(()=>{ loadShared(); renderLayerList(); render(); }, 300));
['patInvertMode','patShowWafer','patShowFill','patPreviewBtn','patApplyBtn'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el) return;
  const ev = id==='patPreviewBtn'||id==='patApplyBtn' ? 'click' : 'change';
  el.addEventListener(ev, id==='patApplyBtn'? applyToMain : render);
});
['patOffX','patOffY','patRot','patScale'].forEach(id=> {
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('change',()=>{
    const get = i=> Number(document.getElementById(i)?.value)||0;
    state.gds.transform={offsetX:get('patOffX'), offsetY:get('patOffY'), rotationDeg:get('patRot'), scale:get('patScale')||1};
    saveShared(); render();
  });
});
 // pan/zoom for patterns page (simple)
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
   svg.addEventListener('pointerdown',e=>{ if(e.target!==svg) return; pan={x:e.clientX,y:e.clientY,bounds:[...topBounds]}; svg.setPointerCapture(e.pointerId); });
   window.addEventListener('pointermove',e=>{ if(!pan) return; const r=svg.getBoundingClientRect(); const [x0,y0,x1,y1]=pan.bounds; const dx=(e.clientX-pan.x)/r.width*(x1-x0), dy=(e.clientY-pan.y)/r.height*(y1-y0); topBounds=[x0-dx,y0+dy,x1-dx,y1+dy]; render(); });
   window.addEventListener('pointerup',()=>pan=null);
 })();
