import {state} from '../core.js';
import {waferOutline, bboxPolys, isSimplePolygon, viewAspectBounds, waferBounds} from '../geometry.js';
import {clearSvg, makeSvg} from '../svg.js';
import * as Bool from './boolean.js';

const $ = id => document.getElementById(id);
let gdsFile = null;

// re-use core state.gds; patterns page shares same localStorage? For now in-memory sharing via same module; navigating to /patterns loses state (new page load).
// So we persist gds via sessionStorage: main page saves on import.
function saveShared(){ try{ sessionStorage.setItem('wafercad_gds', JSON.stringify({gds:state.gds, wafer:state.wafer})); } catch{} }
function loadShared(){ try{ const raw=sessionStorage.getItem('wafercad_gds'); if(!raw) return; const d=JSON.parse(raw); if(d.gds) state.gds=d.gds; if(d.wafer) state.wafer=d.wafer; } catch{} }
function patTransform([x,y]){
  const t=state.gds.transform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1};
  const s=Number(t.scale)||1, sx=x*s, sy=y*s;
  const a=(Number(t.rotationDeg)||0)*Math.PI/180, c=Math.cos(a), s2=Math.sin(a);
  return [sx*c - sy*s2 + (Number(t.offsetX)||0), sx*s2 + sy*c + (Number(t.offsetY)||0)];
}
function effectiveLayer(l){ return l.fillPattern===true && Array.isArray(l.filledPolygons) ? l.filledPolygons : (l.polygons||[]); }

let topBounds=null;
function fitPat(){
  const outline=waferOutline();
  const bb = outline.length ? bboxPolys([outline]) : ([...(state.gds.bbox||[-50000,-50000,50000,50000])]);
  topBounds = viewAspectBounds(bb,0.08);
  render();
}
function modelToSvg(x,y){
  const [x0,y0,x1,y1]=topBounds||[-1,-1,1,1];
  const W=600,H=420; return [(x-x0)/(x1-x0)*W, H-(y-y0)/(y1-y0)*H];
}
function polyPath(poly){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1]); return `${i?'M':'L'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }

function render(){
  const svg=$('patSvg'); clearSvg(svg);
  if(!topBounds) fitPat();
  const outline=waferOutline();
  if(outline.length){
    svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.2'}));
    if($('patShowWafer').checked){
      svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'#cbd5e1','fill-opacity':'0.22',stroke:'none','pointer-events':'none'}));
    }
  }
  // preview previewPolys
  const preview = computePreview();
  for(const poly of preview){
    svg.appendChild(makeSvg('path',{d:polyPath(poly),fill:'#f59e0b','fill-opacity':'0.38',stroke:'#b45309','stroke-width':'1.4'}));
  }
  // draw wafer outline on top
  if(outline.length) svg.appendChild(makeSvg('path',{d:polyPath(outline),fill:'none',stroke:'#94a3b8','stroke-width':'1','stroke-dasharray':'4 3','pointer-events':'none'}));

  $('patPreviewInfo').textContent = preview.length ? `${preview.length} preview region(s)` : 'No preview — select active layers or enable Fill';
  const hasSel = state.gds.layers.some(l=>state.patternSelectedKeys?.has(l.key));
  $('patApplyBtn').disabled = !hasSel || !preview.length;
}

function computePreview(){
  const outline=waferOutline();
  if(!outline.length) return [];
  const mode=$('patInvertMode').value;
  const showFill=$('patShowFill').checked;
  const activeKeys=[... (state.patternSelectedKeys||new Set())];
  const activeLayers=state.gds.layers.filter(l=>activeKeys.includes(l.key));
  if(!activeLayers.length) return [];
  // collect transformed polys
  const perLayerGroups=[];
  const allPolys=[];
  for(const layer of activeLayers){
    let polys = effectiveLayer(layer).map(p=>p.map(([x,y])=>patTransform([x,y])));
    if(showFill && layer.isBorderOnly){
      // preview fill via union of its border polys
      try{ polys = Bool.union(polys); }catch{}
    }
    if(!polys.length) continue;
    perLayerGroups.push(polys);
    allPolys.push(...polys);
  }
  if(!allPolys.length) return [];
  try{
    if(mode==='global'){
      const u = Bool.union(allPolys);
      return Bool.difference([outline], u);
    } else {
      // per-layer S \ layer unioned
      return Bool.previewPerLayerInvert(outline, perLayerGroups);
    }
  }catch(e){ console.warn(e); return []; }
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
}

async function importGds(file){
  const form=new FormData(); form.append('file', file);
  $('patStatus').textContent=`Reading ${file.name}…`;
  const res=await fetch('/api/gds/inspect',{method:'POST', body:form});
  if(!res.ok){ const j=await res.json().catch(()=>({detail:res.statusText})); $('patStatus').textContent=j.detail; return; }
  const data=await res.json();
  // Reuse layout-model normalize
  const {normalizeGds} = await import('../layout-model.js');
  const g=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells,activeTopCell:data.active_top_cell,hierarchy:data.hierarchy,layers:data.layers.map((l,i)=>({...l,key:`${l.layer}/${l.datatype}`,alias:'',inverted:false,fillPattern:false,mirrored:false,visible:true,color:['#2563eb','#dc2626','#059669','#7c3aed','#d97706'][i%5]}))});
  state.gds=g; gdsFile=file;
  // detect border
  const {detectBorderOnly}=await import('../geometry.js');
  for(const l of state.gds.layers) l.isBorderOnly=detectBorderOnly(l);
  if(!state.patternSelectedKeys) state.patternSelectedKeys=new Set();
  $('patStatus').textContent=`${data.filename}: ${data.layers.length} layers`;
  saveShared(); renderLayerList(); fitPat();
}

function applyToMain(){
  // Persist selection and transform for main page to pick up
  saveShared();
  // Also call backend truth for selected layers via resolveMaskRegions? For now rely on main's applyPushPull to resolve via backend when user clicks Apply operation.
  // Just navigate back
  window.location.href='/';
}

// Init
loadShared();
renderLayerList();
if(state.wafer) fitPat(); else { topBounds=[-60000,-60000,60000,60000]; render(); }
document.getElementById('patGdsInput').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importGds(f); });
document.getElementById('patInvertMode').addEventListener('change', render);
document.getElementById('patShowWafer').addEventListener('change', render);
document.getElementById('patShowFill').addEventListener('change', render);
document.getElementById('patPreviewBtn').addEventListener('click', render);
document.getElementById('patApplyBtn').addEventListener('click', applyToMain);
['patOffX','patOffY','patRot','patScale'].forEach(id=> document.getElementById(id).addEventListener('change',()=>{
  state.gds.transform={offsetX:Number($('patOffX').value)||0, offsetY:Number($('patOffY').value)||0, rotationDeg:Number($('patRot').value)||0, scale:Number($('patScale').value)||1};
  saveShared(); render();
}));
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
