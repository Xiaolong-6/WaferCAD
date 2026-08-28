const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const palette = ['#2563eb','#dc2626','#059669','#7c3aed','#d97706','#0891b2','#db2777','#4f46e5','#65a30d','#9333ea'];

const DEFAULT_WAFER = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: {lateral:'mm',thickness:'um'} };
const state = {
  wafer: null, // internal geometry units: µm; null until the user creates or opens a wafer
  activeFace: 'front',
  solids: [],
  cuts: [],
  dopings: [],
  layerVisuals: {},
  gds: { filename: null, bbox: null, layers: [], topCells: [], activeTopCell: null, transform: {offsetX:0,offsetY:0,rotationDeg:0} },
  imprintedFaces: [],
  selectedFaceIds: new Set(),
  slice: null,
  snapshots: [],
  activeSnapshotId: null,
  topBounds: null,
  zExag: 8,
  showAxes: false,
  operationUndo: [],
  _exactThickness: null,
  _topFaceSelection: {enabled:false, selectedSolidIds:new Set()},
};

let THREE = null, OrbitControls = null;
let renderer = null, scene = null, camera = null, controls = null, deviceGroup = null, axesGroup = null;
let cameraFlipAnimation = null;
let resizeObserver = null;
let waferDialogLateralUnit = 'mm', waferDialogThicknessUnit = 'um';
let gdsSourceFile = null, gdsAlignmentUnit = 'mm';
let sliceCoordinateUnit = 'mm', topPan = null, sliceDragFrame = null, sliceDragName = null;
let editingLayerVisualId = null;

function uid(prefix='id'){ return `${prefix}_${Math.random().toString(36).slice(2,10)}`; }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function status(msg){ $('statusText').textContent = msg; }
const UNIT_TO_UM={nm:.001,um:1,mm:1000,cm:10000};
function normalizeWafer(w){
  const wafer={...(w||DEFAULT_WAFER)};
  wafer.shape=wafer.shape||'circle';
  wafer.thickness=Number(wafer.thickness)||500;
  wafer.material=wafer.material||'Si';
  wafer.displayUnits=wafer.displayUnits||{lateral:'mm',thickness:'um'};
  if(wafer.shape==='circle') wafer.diameter=Number(wafer.diameter)||100000;
  if(wafer.shape==='rect'){wafer.width=Number(wafer.width)||100000;wafer.height=Number(wafer.height)||100000;}
  if(wafer.shape==='custom'&&(!Array.isArray(wafer.outline)||wafer.outline.length<3)) return {...wafer,shape:'circle',diameter:100000};
  return wafer;
}
function waferOutline(wafer=state.wafer){
  if(!wafer)return [];
  const w=normalizeWafer(wafer);
  if(w.shape==='custom') return w.outline.map(p=>[Number(p[0]),Number(p[1])]);
  if(w.shape==='rect'){const x=w.width/2,y=w.height/2;return [[-x,-y],[x,-y],[x,y],[-x,y]];}
  const r=w.diameter/2,points=[];for(let i=0;i<128;i++){const a=i/128*Math.PI*2;points.push([Math.cos(a)*r,Math.sin(a)*r]);}return points;
}
function waferBounds(){const outline=waferOutline();return outline.length?bboxPolys([outline]):[-1,-1,1,1];}
function viewAspectBounds(bb,padFraction=.08){
  let [x0,y0,x1,y1]=bb;let w=Math.max(x1-x0,1),h=Math.max(y1-y0,1);const pad=Math.max(w,h)*padFraction;x0-=pad;x1+=pad;y0-=pad;y1+=pad;w=x1-x0;h=y1-y0;
  const target=600/420,current=w/h;if(current>target){const need=w/target-h;y0-=need/2;y1+=need/2;}else{const need=h*target-w;x0-=need/2;x1+=need/2;}return [x0,y0,x1,y1];
}
function waferXYScale(){const [x0,y0,x1,y1]=waferBounds();return 9/Math.max(x1-x0,y1-y0,1);}
function materialColor(name){
  let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))>>>0;
  const colors=['#9ca3af','#60a5fa','#f59e0b','#34d399','#c084fc','#f87171','#22d3ee','#a3e635'];
  return colors[h%colors.length];
}
function validColor(value,fallback='#9ca3af'){return /^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;}
function validLayerScale(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.min(n,100):1;}
function nextLayerName(base){const names=new Set(Object.values(state.layerVisuals||{}).map(v=>v.name));if(!names.has(base))return base;let n=2;while(names.has(`${base} ${n}`))n++;return `${base} ${n}`;}
function ensureLayerVisuals(){
  state.layerVisuals=state.layerVisuals&&typeof state.layerVisuals==='object'?state.layerVisuals:{};
  if(state.wafer){const old=state.layerVisuals.substrate||{};state.layerVisuals.substrate={name:old.name||`Substrate · ${state.wafer.material}`,color:validColor(old.color,materialColor(state.wafer.material)),scale:validLayerScale(old.scale)};}
  const migrated=new Map();
  for(const solid of state.solids){
    if(!solid.layerId){const key=`${solid.side||'front'}|${solid.material}|${solid.zMin}|${solid.zMax}`;if(!migrated.has(key))migrated.set(key,uid('layer'));solid.layerId=migrated.get(key);}
    const old=state.layerVisuals[solid.layerId]||{};state.layerVisuals[solid.layerId]={name:old.name||nextLayerName(solid.material||'Layer'),color:validColor(old.color,materialColor(solid.material||'Layer')),scale:validLayerScale(old.scale)};
  }
  for(const doping of state.dopings){const old=state.layerVisuals[doping.layerId]||{};state.layerVisuals[doping.layerId]={name:old.name||`Doping · ${doping.dopant||'Dopant'}`,color:validColor(old.color,materialColor(doping.dopant||'Dopant')),scale:validLayerScale(old.scale),gradient:true};}
}
function layerVisual(id){return state.layerVisuals?.[id]||{name:'Layer',color:'#9ca3af',scale:1};}
function solidLayerDescriptors(){
  ensureLayerVisuals();const map=new Map();
  for(const solid of state.solids){const d=map.get(solid.layerId)||{id:solid.layerId,side:solid.side||'front',zMin:solid.zMin,zMax:solid.zMax,scale:validLayerScale(state.layerVisuals[solid.layerId]?.scale)};d.zMin=Math.min(d.zMin,solid.zMin);d.zMax=Math.max(d.zMax,solid.zMax);map.set(solid.layerId,d);}
  return [...map.values()];
}
function mappedSolidBounds(solid,layers=solidLayerDescriptors()){
  const current=layers.find(d=>d.id===solid.layerId),rawMin=displayZ(solid.zMin),rawMax=displayZ(solid.zMax);if(!current)return {zMin:rawMin,zMax:rawMax};
  const eps=1e-7;
  if(current.side==='back'){
    const offset=layers.filter(d=>d.id!==current.id&&d.side==='back'&&d.zMin>=current.zMax-eps).reduce((sum,d)=>sum+(d.scale-1)*(displayZ(d.zMax)-displayZ(d.zMin)),0);
    const zMax=rawMax-offset;return {zMin:zMax-(rawMax-rawMin)*current.scale,zMax};
  }
  const offset=layers.filter(d=>d.id!==current.id&&d.side!=='back'&&d.zMax<=current.zMin+eps).reduce((sum,d)=>sum+(d.scale-1)*(displayZ(d.zMax)-displayZ(d.zMin)),0);
  const zMin=rawMin+offset;return {zMin,zMax:zMin+(rawMax-rawMin)*current.scale};
}
function layerLegendEntries(){
  if(!state.wafer)return [];ensureLayerVisuals();const entries=[{id:'substrate',...state.layerVisuals.substrate,thickness:substrateThicknessRange()}];const seen=new Set();for(const solid of state.solids)if(!seen.has(solid.layerId)){seen.add(solid.layerId);entries.push({id:solid.layerId,...layerVisual(solid.layerId),thickness:pieceThicknessRange(state.solids.filter(s=>s.layerId===solid.layerId))});}for(const doping of state.dopings)if(!seen.has(doping.layerId)){seen.add(doping.layerId);entries.push({id:doping.layerId,...layerVisual(doping.layerId),thickness:pieceThicknessRange(state.dopings.filter(d=>d.layerId===doping.layerId))});}return entries;
}
function pieceThicknessRange(pieces){const values=pieces.map(p=>Math.max(0,Number(p.zMax)-Number(p.zMin))).filter(Number.isFinite);return values.length?[Math.min(...values),Math.max(...values)]:[0,0];}
function mergedIntervalLength(intervals){if(!intervals.length)return 0;const sorted=intervals.map(([a,b])=>[Math.min(a,b),Math.max(a,b)]).sort((a,b)=>a[0]-b[0]);let total=0,[lo,hi]=sorted[0];for(let i=1;i<sorted.length;i++){const [a,b]=sorted[i];if(a<=hi+1e-7)hi=Math.max(hi,b);else{total+=hi-lo;lo=a;hi=b;}}return total+hi-lo;}
function substrateRemainingAt(point){const t=state.wafer.thickness,intervals=state.cuts.filter(c=>pointInPoly(point,c.footprint)).map(c=>[Math.max(-t,c.zMin),Math.min(0,c.zMax)]).filter(([a,b])=>b>a);return Math.max(0,t-mergedIntervalLength(intervals));}
function polygonInteriorSamples(poly){const c=centroid(poly);return [c,...poly.map(([x,y])=>({x:x*.995+c.x*.005,y:y*.995+c.y*.005}))];}
function substrateThicknessRange(){
  if(state._exactThickness && state._exactThickness.min!=null) return [state._exactThickness.min, state._exactThickness.max];
  const outline=waferOutline(),samples=polygonInteriorSamples(outline);for(const cut of state.cuts)samples.push(...polygonInteriorSamples(cut.footprint));const values=samples.filter(p=>pointInPoly(p,outline)).map(substrateRemainingAt);return values.length?[Math.min(...values),Math.max(...values)]:[state.wafer.thickness,state.wafer.thickness];
}
let _thicknessRefreshSeq=0;
async function refreshExactThickness(){
  if(!state.wafer) {state._exactThickness=null; return;}
  const seq=++_thicknessRefreshSeq;
  try{
    const payload={outline:waferOutline(),thickness:state.wafer.thickness,cuts:state.cuts.map(c=>({footprint:c.footprint,zMin:c.zMin,zMax:c.zMax}))};
    const res=await fetch('/api/geometry/substrate-thickness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok) return;
    const data=await res.json();
    if(seq!==_thicknessRefreshSeq) return;
    state._exactThickness={min:Number(data.min),max:Number(data.max),atoms:data.atoms};
    renderFigureLegend();
  }catch(e){ /* keep heuristic */ }
}
function formatThickness(value){const v=Math.max(0,value);if(v>=1000)return `${formatDisplayNumber(v/1000)} mm`;if(v<1)return `${formatDisplayNumber(v*1000)} nm`;return `${formatDisplayNumber(v)} µm`;}
function formatThicknessRange(range){const [min,max]=range;return Math.abs(max-min)<1e-7?formatThickness(max):`${formatThickness(min)}–${formatThickness(max)}`;}
function renderFigureLegend(){
  const box=$('figureLegend');if(!box)return;box.innerHTML='';const entries=layerLegendEntries();box.classList.toggle('hidden',!entries.length);if(!entries.length)return;
  const title=document.createElement('div');title.className='figure-legend-title';title.textContent='Figure legend';box.appendChild(title);
  for(const entry of entries){const row=document.createElement('button');row.type='button';row.className='figure-legend-row';row.title='Change material name, color and display scale';row.addEventListener('click',()=>openLayerVisualDialog(entry.id));const sw=document.createElement('span');sw.className='figure-legend-swatch';sw.style.background=entry.gradient?`linear-gradient(90deg,transparent,${entry.color})`:entry.color;const label=document.createElement('span');label.className='figure-legend-label';const name=document.createElement('span');name.className='figure-legend-name';name.textContent=entry.name;const thickness=document.createElement('span');thickness.className='figure-legend-thickness';const exact=entry.id==='substrate'&&state._exactThickness;thickness.textContent=`Thickness ${formatThicknessRange(entry.thickness)}${exact?` · ${exact.atoms} atoms`:''}`;label.append(name,thickness);const scale=document.createElement('span');scale.className='figure-legend-scale';scale.textContent=`×${formatDisplayNumber(entry.scale)}`;row.append(sw,label,scale);box.appendChild(row);}
  if(state.wafer) refreshExactThickness();
}
function editableLayerMaterial(id){if(id==='substrate')return state.wafer?.material||'Substrate';const solid=state.solids.find(s=>s.layerId===id);if(solid)return solid.material||layerVisual(id).name;const doping=state.dopings.find(d=>d.layerId===id);return doping?.dopant||layerVisual(id).name.replace(/^Doping\s*·\s*/,'');}
function renameLayerMaterial(id,name){if(id==='substrate'){state.wafer.material=name;state.layerVisuals[id].name=`Substrate · ${name}`;return;}const solids=state.solids.filter(s=>s.layerId===id);if(solids.length){for(const solid of solids)solid.material=name;state.layerVisuals[id].name=name;return;}const dopings=state.dopings.filter(d=>d.layerId===id);if(dopings.length){for(const doping of dopings)doping.dopant=name;state.layerVisuals[id].name=`Doping · ${name}`;}}
function openLayerVisualDialog(id){const v=layerVisual(id);editingLayerVisualId=id;$('layerVisualName').value=editableLayerMaterial(id);$('layerVisualColor').value=v.color;$('layerVisualScale').value=formatDisplayNumber(v.scale);$('layerVisualError').classList.add('hidden');$('layerVisualDialog').showModal();}
function rgbHexToInt(hex){ return parseInt(hex.replace('#',''),16); }
function polygonArea(poly){let sum=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];sum+=a[0]*b[1]-b[0]*a[1];}return sum/2;}
function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function segmentsCross(a,b,c,d){return orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;}
function isSimplePolygon(poly){for(let i=0;i<poly.length;i++)for(let j=i+1;j<poly.length;j++){if(j===i||j===(i+1)%poly.length||i===(j+1)%poly.length)continue;if(segmentsCross(poly[i],poly[(i+1)%poly.length],poly[j],poly[(j+1)%poly.length]))return false;}return true;}
function pointInPoly(p, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    const hit=((a[1]>p.y)!==(b[1]>p.y)) && (p.x < (b[0]-a[0])*(p.y-a[1])/(b[1]-a[1]+1e-30)+a[0]);
    if(hit) inside=!inside;
  }
  return inside;
}
function centroid(poly){
  let x=0,y=0; for(const p of poly){x+=p[0];y+=p[1];}
  return {x:x/poly.length,y:y/poly.length};
}
function bboxPolys(polys){
  if(!polys.length) return null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const poly of polys) for(const [x,y] of poly){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
  return [x0,y0,x1,y1];
}
function polyBbox(poly){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const [x,y] of poly){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
  return [x0,y0,x1,y1];
}
function bboxIntersects(a,b){
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}
function isPolyInViewport(poly, viewport){
  if(!viewport) return true;
  const bb=polyBbox(poly);
  return bboxIntersects(bb, viewport);
}
function normalizeGds(gds){
  const g={filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,transform:{offsetX:0,offsetY:0,rotationDeg:0},hierarchy:[],...(gds||{})};
  g.layers=Array.isArray(g.layers)?g.layers:[];g.topCells=Array.isArray(g.topCells)?g.topCells:[];
  g.hierarchy=Array.isArray(g.hierarchy)?g.hierarchy:[];
  g.transform={offsetX:0,offsetY:0,rotationDeg:0,...(g.transform||{})};
  return g;
}
function renderHierarchy(){
  const panel=$('hierarchyPanel'), tree=$('hierarchyTree'), meta=$('hierarchyMeta');
  if(!panel||!tree) return;
  const h=state.gds.hierarchy||[];
  if(!h.length){panel.classList.add('hidden');return;}
  panel.classList.remove('hidden');
  meta.textContent=`${h.length} cells`;
  tree.innerHTML='';
  const topSet=new Set(state.gds.topCells||[]);
  for(const cell of h){
    const row=document.createElement('button');row.type='button';row.className='hierarchy-row'+(cell.name===state.gds.activeTopCell?' active':'');
    row.disabled=!!state.imprintedFaces.length;
    row.title=state.imprintedFaces.length?'Create a new wafer before switching cells':`Load ${cell.name} as active cell (flattened preview)`;
    const head=document.createElement('div');head.className='hierarchy-head';
    const name=document.createElement('span');name.className='hierarchy-name';name.textContent=cell.name + (topSet.has(cell.name)?' ★':'');
    const cnt=document.createElement('span');cnt.className='muted';cnt.textContent=`${cell.local_polygon_count} polys`;
    head.append(name,cnt); row.appendChild(head);
    if(cell.layers?.length){
      const layers=document.createElement('div');layers.className='hierarchy-layers';
      for(const l of cell.layers){const s=document.createElement('span');s.className='hierarchy-layer';s.textContent=`${l.layer}/${l.datatype}:${l.count}`;layers.appendChild(s);}
      row.appendChild(layers);
    }
    if(cell.references?.length){
      const refs=document.createElement('div');refs.className='hierarchy-refs';
      for(const r of cell.references){
        const rr=document.createElement('div');rr.className='hierarchy-ref';
        rr.textContent=`→ ${r.cell} @(${r.origin[0].toFixed(1)},${r.origin[1].toFixed(1)})${r.rotation?` ${r.rotation}°`:''}${r.x_reflection?' mirror':''}`;
        refs.appendChild(rr);
      }
      row.appendChild(refs);
    }
    row.addEventListener('click', async()=>{
      if(state.imprintedFaces.length){status('Create a new wafer before switching cells.');return;}
      if(!gdsSourceFile){status('No layout file loaded.');return;}
      if(cell.name===state.gds.activeTopCell) return;
      await importGds(gdsSourceFile, cell.name, true);
    });
    tree.appendChild(row);
  }
}
function transformPoint([x,y],transform=state.gds.transform){const a=(Number(transform?.rotationDeg)||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [x*c-y*s+(Number(transform?.offsetX)||0),x*s+y*c+(Number(transform?.offsetY)||0)];}
function transformedPolygon(poly){return poly.map(p=>transformPoint(p));}
function effectiveLayerPolygons(layer){return layer.fillPattern===true&&Array.isArray(layer.filledPolygons)?layer.filledPolygons:(layer.polygons||[]);}
function transformedLayerPolygon(layer,poly){return poly.map(([x,y])=>transformPoint([layer.mirrored===true?-x:x,y]));}
function transformedGdsBounds(){const polys=state.gds.layers.flatMap(layer=>effectiveLayerPolygons(layer).map(poly=>transformedLayerPolygon(layer,poly)));return polys.length?bboxPolys(polys):null;}
function setDefaultSlice(){if(!state.wafer){state.slice=null;return;}const [x0,y0,x1,y1]=waferBounds(),cy=(y0+y1)/2;state.slice={a:{x:x0+(x1-x0)*.175,y:cy},b:{x:x1-(x1-x0)*.175,y:cy}};}
function currentDeviceSnapshot(){ensureLayerVisuals();return clone({wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,imprintedFaces:state.imprintedFaces});}
function restoreDeviceSnapshot(s){state.wafer=s.wafer?normalizeWafer(clone(s.wafer)):null;state.activeFace=s.activeFace||'front';state.solids=clone(s.solids||[]);state.cuts=clone(s.cuts||[]);state.dopings=clone(s.dopings||[]);state.layerVisuals=clone(s.layerVisuals||{});state.imprintedFaces=clone(s.imprintedFaces||[]);state.operationUndo=[];ensureLayerVisuals();state.selectedFaceIds.clear();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();renderAll();}

function makeSvg(tag, attrs={}){ const e=document.createElementNS(NS,tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); return e; }
function clearSvg(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }

function fitWafer(){state.topBounds=state.wafer?viewAspectBounds(waferBounds()):[-1,-1,1,1];renderTop();}
function fitLayout(){
  let bb=transformedGdsBounds() || bboxPolys(state.imprintedFaces.map(f=>f.polygon));
  if(!bb){fitWafer();return;}
  const w=Math.max(bb[2]-bb[0],1), h=Math.max(bb[3]-bb[1],1), pad=Math.max(w,h)*0.15;
  state.topBounds=viewAspectBounds([bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad],0); renderTop();
}
function modelToSvg(x,y){
  const [x0,y0,x1,y1]=state.topBounds || [-1,-1,1,1];
  const W=600,H=420; let sx=(x-x0)/(x1-x0)*W; const sy=H-(y-y0)/(y1-y0)*H;if(state.activeFace==='back')sx=W-sx; return [sx,sy];
}
function svgToModel(sx,sy){
  const [x0,y0,x1,y1]=state.topBounds || [-1,-1,1,1];
  if(state.activeFace==='back')sx=600-sx;return {x:x0+sx/600*(x1-x0),y:y0+(1-sy/420)*(y1-y0)};
}
function polyPath(poly){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1]); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }
function placeCameraOnActiveFace(){if(!camera)return;const back=state.activeFace==='back';camera.position.x=back?-Math.abs(camera.position.x):Math.abs(camera.position.x);camera.position.z=back?-Math.abs(camera.position.z):Math.abs(camera.position.z);controls?.update();}
function updateActiveFaceUi(syncCamera=true){const back=state.activeFace==='back';$('activeFaceLabel').textContent=back?'Back face':'Front face';$('flipFaceBtn').textContent=back?'Face: Back':'Face: Front';$('flipFaceBtn').disabled=!state.wafer;if(syncCamera)placeCameraOnActiveFace();}
function startCameraFaceFlip(){if(!camera||!controls)return;const target=controls.target.clone(),relative=camera.position.clone().sub(target);cameraFlipAnimation={started:performance.now(),duration:720,target,relative};controls.enabled=false;}
function updateCameraFaceFlip(now){if(!cameraFlipAnimation)return;const a=cameraFlipAnimation,t=Math.min(1,(now-a.started)/a.duration),eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,angle=Math.PI*eased,c=Math.cos(angle),s=Math.sin(angle),r=a.relative;camera.position.set(a.target.x+r.x*c+r.z*s,a.target.y+r.y,a.target.z-r.x*s+r.z*c);camera.lookAt(a.target);if(t>=1){cameraFlipAnimation=null;controls.enabled=true;controls.update();}}
function flipActiveFace(){if(!state.wafer)return;state.activeFace=state.activeFace==='front'?'back':'front';state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();updateActiveFaceUi(false);startCameraFaceFlip();renderAll();status(`Active processing face: ${state.activeFace}. The 3D camera is flipping to the ${state.activeFace} side.`);}
function updateSliceInputs(){const focused=document.activeElement;if(!state.slice){for(const id of ['sliceAx','sliceAy','sliceBx','sliceBy']){$(id).value='';$(id).disabled=true;}$('applySliceCoordinatesBtn').disabled=true;return;}const scale=UNIT_TO_UM[sliceCoordinateUnit],values={sliceAx:state.slice.a.x/scale,sliceAy:state.slice.a.y/scale,sliceBx:state.slice.b.x/scale,sliceBy:state.slice.b.y/scale};for(const [id,value] of Object.entries(values)){const input=$(id);input.disabled=false;if(focused!==input)input.value=formatDisplayNumber(value);}$('applySliceCoordinatesBtn').disabled=false;$('sliceCoordinateUnit').value=sliceCoordinateUnit;}

function renderTop(){
  const svg=$('topSvg'); clearSvg(svg);
  if(!state.wafer&&!state.gds.layers.length){updateSliceInputs();return;}
  if(!state.topBounds) fitWafer();
  if(state.wafer)svg.appendChild(makeSvg('path',{d:polyPath(waferOutline()),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.5'}));

  // Imported layout layers remain visually distinct by layer/datatype.
  // Viewport culling: skip polys entirely outside topBounds (major win near 20k cap when zoomed/panned)
  const viewport=state.topBounds;
  let culled=0, drawn=0;
  for(const layer of state.gds.layers){
    if(layer.visible===false) continue;
    for(const sourcePoly of effectiveLayerPolygons(layer)){
      const poly=transformedLayerPolygon(layer,sourcePoly);
      if(!isPolyInViewport(poly, viewport)){culled++; continue;}
      drawn++;
      const path=makeSvg('path',{d:polyPath(poly),fill:layer.color,'fill-opacity':'0.12',stroke:layer.color,'stroke-opacity':'0.55','stroke-width':'1'});
      svg.appendChild(path);
    }
  }
  if(culled>0) $('viewportCullInfo') && ($('viewportCullInfo').textContent=`${drawn} shown · ${culled} culled outside viewport`);

  if(isTopFaceSelection()){
    // Draw top-face model regions (solids covering active face) as selectable
    const solidsOnFace=state.solids.filter(s=>(s.side||'front')===state.activeFace);
    for(const solid of solidsOnFace){
      if(!isPolyInViewport(solid.footprint, viewport)) continue;
      const isTop=topLayerAt(centroid(solid.footprint), state.activeFace)?.id===solid.id;
      if(!isTop) continue;
      const selected=state._topFaceSelection.selectedSolidIds.has(solid.id);
      const path=makeSvg('path',{d:polyPath(solid.footprint),fill:selected?'#f59e0b':'#60a5fa','fill-opacity':selected?'0.42':'0.18',stroke:selected?'#d97706':'#2563eb','stroke-width':selected?'2.2':'1.4','data-solid':solid.id});
      path.style.cursor='pointer';
      path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state._topFaceSelection.selectedSolidIds.has(solid.id)) state._topFaceSelection.selectedSolidIds.delete(solid.id); else state._topFaceSelection.selectedSolidIds.add(solid.id); updateSelectionInfo(); renderTop();});
      svg.appendChild(path);
    }
    // substrate top region: click empty wafer area to select substrate top face
    // handled via svg background click below
  } else {
    for(const face of state.imprintedFaces.filter(face=>(face.side||'front')===state.activeFace)){
      if(!isPolyInViewport(face.polygon, viewport)) continue;
      const selected=state.selectedFaceIds.has(face.id);
      const path=makeSvg('path',{d:polyPath(face.polygon),fill:selected?'#f59e0b':'#ffffff','fill-opacity':selected?'0.42':'0.08',stroke:selected?'#d97706':'#111827','stroke-width':selected?'2.2':'1.2','data-face':face.id});
      path.style.cursor='pointer';
      path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state.selectedFaceIds.has(face.id)) state.selectedFaceIds.delete(face.id); else state.selectedFaceIds.add(face.id); updateSelectionInfo(); renderTop();});
      svg.appendChild(path);
    }
  }

  if(!state.slice){updateSliceInputs();return;}
  const [ax,ay]=modelToSvg(state.slice.a.x,state.slice.a.y), [bx,by]=modelToSvg(state.slice.b.x,state.slice.b.y);
  svg.appendChild(makeSvg('line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:'#111827','stroke-width':'2','stroke-dasharray':'5 4'}));
  for(const [name,p,sx,sy] of [['A',state.slice.a,ax,ay],['B',state.slice.b,bx,by]]){
    const g=makeSvg('g',{'data-slice-handle':name}); g.style.cursor='grab';
    g.appendChild(makeSvg('circle',{cx:sx,cy:sy,r:7,fill:'#fff',stroke:'#111827','stroke-width':'2'}));
    const t=makeSvg('text',{x:sx+(name==='A'?-17:10),y:sy-10,'font-size':'13','font-weight':'700',fill:'#111827'});t.textContent=name;g.appendChild(t);svg.appendChild(g);
    bindSliceDrag(g,name);
  }
  updateSliceInputs();
}

function bindSliceDrag(g,name){
  g.addEventListener('pointerdown',(ev)=>{sliceDragName=name;ev.preventDefault();ev.stopPropagation();});
}
function bindTopNavigation(){
  const svg=$('topSvg');
  svg.addEventListener('wheel',(ev)=>{if(!state.topBounds)return;ev.preventDefault();const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420,anchor=svgToModel(sx,sy),factor=Math.exp(Math.max(-500,Math.min(500,ev.deltaY))*.0015),[x0,y0,x1,y1]=state.topBounds;state.topBounds=[anchor.x+(x0-anchor.x)*factor,anchor.y+(y0-anchor.y)*factor,anchor.x+(x1-anchor.x)*factor,anchor.y+(y1-anchor.y)*factor];renderTop();},{passive:false});
  svg.addEventListener('pointerdown',(ev)=>{if(ev.button!==0||ev.target!==svg||!state.topBounds)return;svg.setPointerCapture(ev.pointerId);topPan={x:ev.clientX,y:ev.clientY,bounds:[...state.topBounds]};svg.style.cursor='grabbing';});
  window.addEventListener('pointermove',(ev)=>{if(!sliceDragName||!state.slice)return;const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420;state.slice[sliceDragName.toLowerCase()]=svgToModel(sx,sy);if(!sliceDragFrame)sliceDragFrame=requestAnimationFrame(()=>{sliceDragFrame=null;renderTop();renderSection();});});
  svg.addEventListener('pointermove',(ev)=>{if(sliceDragName||!topPan)return;const rect=svg.getBoundingClientRect(),[x0,y0,x1,y1]=topPan.bounds,dx=(ev.clientX-topPan.x)/rect.width*(x1-x0),dy=(ev.clientY-topPan.y)/rect.height*(y1-y0),mx=state.activeFace==='back'?dx:-dx;state.topBounds=[x0+mx,y0+dy,x1+mx,y1+dy];renderTop();});
  const end=()=>{topPan=null;svg.style.cursor='';};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  const endSlice=()=>{if(!sliceDragName)return;sliceDragName=null;render3D();};window.addEventListener('pointerup',endSlice);window.addEventListener('pointercancel',endSlice);
}

function linePolyIntervals(a,b,poly){
  const ts=[0,1], dx=b.x-a.x, dy=b.y-a.y;
  for(let i=0;i<poly.length;i++){
    const p=poly[i], q=poly[(i+1)%poly.length]; const ex=q[0]-p[0], ey=q[1]-p[1];
    const den=dx*ey-dy*ex; if(Math.abs(den)<1e-12) continue;
    const px=p[0]-a.x, py=p[1]-a.y; const t=(px*ey-py*ex)/den, u=(px*dy-py*dx)/den;
    if(t>0&&t<1&&u>=0&&u<=1) ts.push(t);
  }
  ts.sort((x,y)=>x-y); const uniq=ts.filter((t,i)=>i===0||Math.abs(t-ts[i-1])>1e-7); const out=[];
  for(let i=0;i<uniq.length-1;i++){const t0=uniq[i],t1=uniq[i+1],tm=(t0+t1)/2;const p={x:a.x+dx*tm,y:a.y+dy*tm};if(pointInPoly(p,poly))out.push([t0,t1]);}
  return out;
}
function lineCircleInterval(a,b,r){
  const dx=b.x-a.x,dy=b.y-a.y,A=dx*dx+dy*dy,B=2*(a.x*dx+a.y*dy),C=a.x*a.x+a.y*a.y-r*r,D=B*B-4*A*C;
  if(D<0){return (a.x*a.x+a.y*a.y<r*r&&b.x*b.x+b.y*b.y<r*r)?[0,1]:null;}
  const s=Math.sqrt(D),t0=(-B-s)/(2*A),t1=(-B+s)/(2*A); const lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1)); return hi>lo?[lo,hi]:null;
}
function displayZ(z){
  if(!state.wafer)return 0;
  const t=state.wafer.thickness, ex=state.zExag, substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale);
  if(z>=0) return z/t*0.8*ex;
  if(z<=-t)return -0.8*ex*substrateScale-(Math.abs(z+t)/t)*0.8*ex;
  return z/t*0.8*ex*substrateScale;
}
function mappedDopingBounds(doping,layerDescriptors=solidLayerDescriptors()){
  let mapped;if(doping.targetLayerId==='substrate')mapped={zMin:displayZ(doping.zMin),zMax:displayZ(doping.zMax)};else mapped=mappedSolidBounds({layerId:doping.targetLayerId,zMin:doping.zMin,zMax:doping.zMax},layerDescriptors);
  const scale=validLayerScale(layerVisual(doping.layerId).scale),height=mapped.zMax-mapped.zMin;if(doping.position==='lower')return {zMin:mapped.zMin,zMax:mapped.zMin+height*scale};return {zMin:mapped.zMax-height*scale,zMax:mapped.zMax};
}
function renderSection(){
  const svg=$('sectionSvg');clearSvg(svg);$('sectionMeta').textContent='';if(!state.wafer||!state.slice)return;const a=state.slice.a,b=state.slice.b,back=state.activeFace==='back',waferIntervals=linePolyIntervals(a,b,waferOutline()),layerDescriptors=solidLayerDescriptors(),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors)),mappedDopings=state.dopings.map(d=>mappedDopingBounds(d,layerDescriptors));
  const yMin=Math.min(-0.86,displayZ(-state.wafer.thickness)-.12,...mappedSolids.map(s=>s.zMin-.12),...mappedDopings.map(s=>s.zMin-.12)),yMax=Math.max(0.3,...mappedSolids.map(s=>s.zMax+.12),...mappedDopings.map(s=>s.zMax+.12)),mapX=t=>back?555-t*510:45+t*510,mapDisplayY=z=>back?30+(z-yMin)/(yMax-yMin)*245:290-(z-yMin)/(yMax-yMin)*245,mapY=z=>mapDisplayY(displayZ(z)),rectX=(t0,t1)=>{const x0=mapX(t0),x1=mapX(t1);return {x:Math.min(x0,x1),width:Math.abs(x1-x0)};},rectY=(z0,z1)=>{const y0=mapDisplayY(z0),y1=mapDisplayY(z1);return {y:Math.min(y0,y1),height:Math.abs(y1-y0)};};
  svg.appendChild(makeSvg('line',{x1:45,y1:mapDisplayY(0),x2:555,y2:mapDisplayY(0),stroke:'#b6bbc2','stroke-width':'1'}));
  for(const waferI of waferIntervals){const xr=rectX(waferI[0],waferI[1]),yr=rectY(displayZ(-state.wafer.thickness),displayZ(0));svg.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual('substrate').color,stroke:'#6b7280','data-layer-id':'substrate'}));}
  for(const cut of state.cuts)for(const [t0,t1] of linePolyIntervals(a,b,cut.footprint)){const xr=rectX(t0,t1),yr=rectY(displayZ(cut.zMin),displayZ(cut.zMax));svg.appendChild(makeSvg('rect',{...xr,...yr,fill:'#fbfbfc',stroke:'#9ca3af','stroke-dasharray':'3 2'}));}
  for(const solid of state.solids)for(const [t0,t1] of linePolyIntervals(a,b,solid.footprint)){const mapped=mappedSolidBounds(solid,layerDescriptors),xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);svg.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual(solid.layerId).color,stroke:'#4b5563','data-layer-id':solid.layerId}));}
  const defs=makeSvg('defs');svg.appendChild(defs);
  for(const doping of state.dopings){const color=layerVisual(doping.layerId).color,gradientId=`gradient_${doping.layerId}`,highAtTop=(doping.position==='upper')!==back,gradient=makeSvg('linearGradient',{id:gradientId,x1:'0%',x2:'0%',y1:highAtTop?'100%':'0%',y2:highAtTop?'0%':'100%'});gradient.append(makeSvg('stop',{offset:'0%','stop-color':color,'stop-opacity':'0.08'}),makeSvg('stop',{offset:'100%','stop-color':color,'stop-opacity':'0.9'}));defs.appendChild(gradient);for(const [t0,t1] of linePolyIntervals(a,b,doping.footprint)){const mapped=mappedDopingBounds(doping,layerDescriptors),xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);svg.appendChild(makeSvg('rect',{...xr,...yr,fill:`url(#${gradientId})`,stroke:color,'stroke-opacity':'.65','data-layer-id':doping.layerId,'data-doping':'true'}));}}
  const labelY=back?17:310,ta=makeSvg('text',{x:back?558:35,y:labelY,'font-size':'12','font-weight':'700'});ta.textContent='A';svg.appendChild(ta);const tb=makeSvg('text',{x:back?35:558,y:labelY,'font-size':'12','font-weight':'700'});tb.textContent='B';svg.appendChild(tb);
  const len=Math.hypot(b.x-a.x,b.y-a.y); $('sectionMeta').textContent=`${(len/1000).toFixed(2)} mm line · ${back?'backside flipped · ':''}schematic Z`;
}

function surfaceZAt(p,side='front'){
  let z=side==='back'?-state.wafer.thickness:0;
  if(side==='back'){
    for(const cut of state.cuts)if((cut.side||'front')==='back'&&pointInPoly(p,cut.footprint))z=Math.max(z,cut.zMax);
    for(const solid of state.solids)if((solid.side||'front')==='back'&&pointInPoly(p,solid.footprint))z=Math.min(z,solid.zMin);
  }else{
    for(const cut of state.cuts)if((cut.side||'front')==='front'&&pointInPoly(p,cut.footprint))z=Math.min(z,cut.zMin);
    for(const solid of state.solids)if((solid.side||'front')==='front'&&pointInPoly(p,solid.footprint))z=Math.max(z,solid.zMax);
  }
  return z;
}
function topLayerAt(point,side='front'){
  const p={x:point[0],y:point[1]};
  if(!pointInPoly(p, waferOutline())) return null;
  // check cuts that etch substrate: if point inside a front cut that lowers surface, substrate is no longer top unless a solid covers it
  let candidates=[];
  for(const solid of state.solids) if((solid.side||'front')===side && pointInPoly(p, solid.footprint)) candidates.push(solid);
  if(!candidates.length) return {kind:'substrate', id:'substrate', z:surfaceZAt(p,side)};
  // topmost is max zMax (front) or min zMin (back)
  candidates.sort((a,b)=> side==='back'? a.zMin - b.zMin : b.zMax - a.zMax);
  const top=candidates[0];
  return {kind:'solid', id:top.id, layerId:top.layerId, solid:top, z: side==='back'?top.zMin:top.zMax};
}
function isTopFaceSelection(){return $('selectionMode')?.value==='top';}
function topSelectionCount(){return state._topFaceSelection.selectedSolidIds.size;}
function clearTopSelection(){state._topFaceSelection.selectedSolidIds.clear();}
function updateSelectionInfo(){
  if($('pushMode')?.value==='doping'){$('selectionInfo').textContent='Doping overlaps the selected physical target layer; mask-face selection is not used.';return;}
  if(isTopFaceSelection()){
    const n=topSelectionCount();
    if(n) {$('selectionInfo').textContent=`${n} top face${n>1?'s':''} selected (model).`;}
    else {$('selectionInfo').textContent=`No top face selected — the whole ${state.activeFace} face will be used. Click a visible top region.`;}
    return;
  }
  const n=state.selectedFaceIds.size;$('selectionInfo').textContent=n?`${n} patterned face${n>1?'s':''} selected.`:`No pattern selected — the whole ${state.activeFace} face will be used.`;
}

async function clipPolygonsToWafer(polygons){
  if(!state.wafer)return polygons.map(()=>[]);
  let response;try{response=await fetch('/api/geometry/intersection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:polygons,clip:waferOutline()})});}catch(e){throw new Error(`Substrate clipping request failed: ${e.message}`);}
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}
  const data=await response.json();if(!Array.isArray(data.results)||data.results.length!==polygons.length)throw new Error('Substrate clipping returned an invalid result.');return data.results;
}
async function resolveMaskRegions(maskPolygons,invert){
  let response;try{response=await fetch('/api/geometry/mask-regions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mask:maskPolygons,substrate:waferOutline(),invert})});}catch(e){throw new Error(`Mask Boolean request failed: ${e.message}`);}
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}const data=await response.json();if(!Array.isArray(data.regions))throw new Error('Mask Boolean operation returned an invalid result.');return data.regions;
}
async function isotropicOffset(polygons,distance){
  let response;try{response=await fetch('/api/geometry/isotropic-offset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:polygons,distance,clip:waferOutline()})});}catch(e){throw new Error(`Isotropic geometry request failed: ${e.message}`);}
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}const data=await response.json();if(!Array.isArray(data.regions))throw new Error('Isotropic geometry operation returned an invalid result.');return data.regions;
}
async function splitPolygonsByMask(subjects,masks){
  let response;try{response=await fetch('/api/geometry/split-by-mask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects,masks})});}catch(e){throw new Error(`Material split request failed: ${e.message}`);}
  if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}const data=await response.json();if(!Array.isArray(data.remaining)||!Array.isArray(data.overlaps)||data.remaining.length!==subjects.length||data.overlaps.length!==subjects.length)throw new Error('Material split returned an invalid result.');return data;
}
async function buildMaterialConsumption(pieces,distance,mode){
  const groups=new Map(),eps=1e-7,t=state.wafer.thickness;
  for(const piece of pieces){const side=piece.face.side||state.activeFace,surface=surfaceZAt(centroid(piece.polygon),side),key=`${side}|${surface.toFixed(6)}`,group=groups.get(key)||{side,surface,masks:[]};group.masks.push(piece.polygon);groups.set(key,group);}
  let working=clone(state.solids),workingDopings=clone(state.dopings);const substrateCuts=[];
  for(const group of groups.values()){
    const front=group.side!=='back',cutLow=group.surface-distance,cutHigh=group.surface+distance,candidates=working.filter(s=>(s.side||'front')===group.side&&(front?(s.zMax>cutLow+eps&&s.zMin<group.surface-eps):(s.zMin<cutHigh-eps&&s.zMax>group.surface+eps)));
    if(candidates.length){const split=await splitPolygonsByMask(candidates.map(s=>s.footprint),group.masks),candidateIds=new Set(candidates.map(s=>s.id)),next=working.filter(s=>!candidateIds.has(s.id));for(let i=0;i<candidates.length;i++){const solid=candidates[i];for(const polygon of split.remaining[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon});if(front){const residualMax=Math.min(solid.zMax,cutLow);if(residualMax>solid.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMax:residualMax});}else{const residualMin=Math.max(solid.zMin,cutHigh);if(solid.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMin:residualMin});}}working=next;}
    const dopingCandidates=workingDopings.filter(d=>front?(d.zMax>cutLow+eps&&d.zMin<group.surface-eps):(d.zMin<cutHigh-eps&&d.zMax>group.surface+eps));if(dopingCandidates.length){const split=await splitPolygonsByMask(dopingCandidates.map(d=>d.footprint),group.masks),candidateIds=new Set(dopingCandidates.map(d=>d.id)),next=workingDopings.filter(d=>!candidateIds.has(d.id));for(let i=0;i<dopingCandidates.length;i++){const doping=dopingCandidates[i];for(const polygon of split.remaining[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon});if(front){const residualMax=Math.min(doping.zMax,cutLow);if(residualMax>doping.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMax:residualMax,depth:residualMax-doping.zMin});}else{const residualMin=Math.max(doping.zMin,cutHigh);if(doping.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMin:residualMin,depth:doping.zMax-residualMin});}}workingDopings=next;}
    const substrateMin=front?Math.max(-t,cutLow):Math.max(-t,group.surface),substrateMax=front?Math.min(0,group.surface):Math.min(0,cutHigh);if(substrateMax>substrateMin+eps)for(const footprint of group.masks)substrateCuts.push({id:uid('cut'),side:group.side,footprint:clone(footprint),zMin:substrateMin,zMax:substrateMax,sourceFaceId:null,target:'substrate',wholeFace:false,profile:mode==='isotropic-etch'?'isotropic':'vertical',lateralRadius:mode==='isotropic-etch'?distance:0});
  }
  return {solids:working,dopings:workingDopings,cuts:[...state.cuts,...substrateCuts]};
}
function cleanupConsumedLayers(previousNames){
  const surviving=new Set(state.solids.map(s=>s.layerId)),removed=[];for(const [id,name] of previousNames)if(!surviving.has(id)){removed.push(name);delete state.layerVisuals[id];}
  if(removed.length){const removedIds=new Set([...previousNames.keys()].filter(id=>!surviving.has(id)));state.dopings=state.dopings.filter(d=>!removedIds.has(d.targetLayerId));}
  const activeDopingLayers=new Set(state.dopings.map(d=>d.layerId));for(const [id,visual] of Object.entries(state.layerVisuals))if(visual.gradient&&!activeDopingLayers.has(id))delete state.layerVisuals[id];
  return removed;
}
function physicalLayerOptions(){const entries=[{id:'substrate',name:layerVisual('substrate').name}];const seen=new Set();for(const solid of state.solids)if(!seen.has(solid.layerId)){seen.add(solid.layerId);entries.push({id:solid.layerId,name:layerVisual(solid.layerId).name});}return entries;}
function renderDopingControls(){const select=$('dopingTargetLayer');if(!select)return;const previous=select.value,options=state.wafer?physicalLayerOptions():[];select.innerHTML='';for(const entry of options){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.appendChild(option);}if(options.some(o=>o.id===previous))select.value=previous;select.disabled=!options.length;}
function updateOperationModeUi(){const mode=$('pushMode').value,conformal=['conformal-grow','isotropic-etch'].includes(mode),doping=mode==='doping';$('operationModeHint').classList.toggle('hidden',!conformal);$('dopingControls').classList.toggle('hidden',!doping);$('materialFieldLabel').textContent=doping?'Dopant':'Material';$('materialInput').disabled=mode==='down'||mode==='isotropic-etch';renderDopingControls();updateSelectionInfo();}
function captureOperationState(){return clone({solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals});}
function recordOperationUndo(){state.operationUndo.push(captureOperationState());if(state.operationUndo.length>50)state.operationUndo.shift();updateUndoUi();}
function updateUndoUi(){$('undoOperationBtn').disabled=!state.operationUndo.length;}
function undoOperation(){const previous=state.operationUndo.pop();if(!previous)return;state.solids=previous.solids||[];state.cuts=previous.cuts||[];state.dopings=previous.dopings||[];state.layerVisuals=previous.layerVisuals||{};ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderAll();updateUndoUi();status('Undid the last geometry operation.');}
function applyDoping(distance,dopant){
  const targetLayerId=$('dopingTargetLayer').value,position=$('dopingPosition').value,targets=targetLayerId==='substrate'?[{footprint:waferOutline(),zMin:-state.wafer.thickness,zMax:0}]:state.solids.filter(s=>s.layerId===targetLayerId);if(!targets.length){status('Choose an existing target layer for doping.');return;}
  recordOperationUndo();const layerId=uid('doping'),name=nextLayerName(`Doping · ${dopant}`);state.layerVisuals[layerId]={name,color:materialColor(dopant),scale:1,gradient:true};
  for(const target of targets){const available=Math.max(0,target.zMax-target.zMin),depth=Math.min(distance,available);if(depth<=0)continue;const zMin=position==='upper'?target.zMax-depth:target.zMin,zMax=position==='upper'?target.zMax:target.zMin+depth;state.dopings.push({id:uid('doping-region'),layerId,targetLayerId,dopant,position,depth,footprint:clone(target.footprint),zMin,zMax});}
  renderAll();status(`Added ${dopant} doping to the ${position} ${Math.min(distance,Math.max(...targets.map(t=>t.zMax-t.zMin))).toFixed(3)} µm of ${layerVisual(targetLayerId).name}.`);
}
async function applyPushPull(){
  if(!state.wafer){status('Create or open a wafer before using Push / Pull.');return;}
  const distance=Number($('distanceInput').value)*Number($('distanceUnit').value); if(!Number.isFinite(distance)||distance<=0){status('Distance must be positive.');return;}
  const mode=$('pushMode').value, material=$('materialInput').value.trim()||'Generic film';
  if(mode==='doping'){applyDoping(distance,material==='Generic film'?'Dopant':material);return;}
  let wholeFace, selected;
  if(isTopFaceSelection()){
    const ids=state._topFaceSelection.selectedSolidIds;
    wholeFace=ids.size===0;
    if(wholeFace) selected=[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}];
    else {
      const solids=state.solids.filter(s=>ids.has(s.id) && (s.side||'front')===state.activeFace);
      selected=solids.map(s=>({id:s.id,side:s.side||state.activeFace,polygon:clone(s.footprint),wholeFace:false}));
      if(!selected.length){status('Selected top faces are no longer present.');return;}
    }
  } else {
    wholeFace=state.selectedFaceIds.size===0;
    selected=wholeFace?[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}]:state.imprintedFaces.filter(f=>state.selectedFaceIds.has(f.id));
  }
  status(wholeFace?`Preparing the whole ${state.activeFace} face…`:'Clipping selected faces to the substrate…');let clipped;try{clipped=await clipPolygonsToWafer(selected.map(f=>f.polygon));}catch(e){status(`Push / pull failed: ${e.message}`);return;}
  let pieces=[];clipped.forEach((parts,i)=>parts.forEach(polygon=>pieces.push({face:selected[i],polygon})));
  if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('No selected area overlaps the substrate. Nothing was created.');return;}
  if(mode==='conformal-grow'||mode==='isotropic-etch'){
    status(mode==='conformal-grow'?'Calculating conformal growth…':'Calculating isotropic etch…');let regions;try{regions=await isotropicOffset(pieces.map(p=>p.polygon),distance);}catch(e){status(`Operation failed: ${e.message}`);return;}
    pieces=regions.map(polygon=>({face:{id:null,side:state.activeFace},polygon}));if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('The isotropic operation produced no region inside the substrate.');return;}
  }
  if(mode==='up'||mode==='conformal-grow'){
    recordOperationUndo();
    const layerId=uid('layer');state.layerVisuals[layerId]={name:nextLayerName(material),color:materialColor(material),scale:1};
    for(const piece of pieces){const side=piece.face.side||'front',c=centroid(piece.polygon),z0=surfaceZAt(c,side);state.solids.push({id:uid('solid'),layerId,side,material,footprint:clone(piece.polygon),zMin:side==='back'?z0-distance:z0,zMax:side==='back'?z0:z0+distance,sourceFaceId:piece.face.id,wholeFace,profile:mode==='conformal-grow'?'conformal':'vertical',lateralRadius:mode==='conformal-grow'?distance:0});}
    status(mode==='conformal-grow'?`Conformally grew ${material} with a ${distance.toFixed(3)} µm isotropic radius on the ${state.activeFace} face.`:(wholeFace?`Created a ${distance.toFixed(3)} µm ${material} blanket layer on the ${state.activeFace} face.`:`Pulled ${pieces.length} substrate-bounded region(s) from the ${state.activeFace} face by ${distance.toFixed(3)} µm.`));
  }else{
    const previousNames=new Map(solidLayerDescriptors().map(d=>[d.id,layerVisual(d.id).name]));status('Calculating layer-by-layer material consumption…');let consumed;try{consumed=await buildMaterialConsumption(pieces,distance,mode);}catch(e){status(`Operation failed: ${e.message}`);return;}recordOperationUndo();state.solids=consumed.solids;state.dopings=consumed.dopings;state.cuts=consumed.cuts;const removed=cleanupConsumedLayers(previousNames),removedText=removed.length?` Removed layer${removed.length>1?'s':''}: ${removed.join(', ')}.`:'';
    status(mode==='isotropic-etch'?`Isotropically etched inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`:`Pushed inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`);
  }
  state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderAll();
}

function formatDisplayNumber(value){return String(Number(Number(value).toPrecision(10)));}
function renderGdsControls(){
  const controls=$('gdsControls'),hasLayers=state.gds.layers.length>0;controls.classList.toggle('hidden',!hasLayers);if(!hasLayers)return;
  const topSelect=$('gdsTopCell'),allCells=(state.gds.hierarchy?.length? state.gds.hierarchy.map(c=>c.name): (state.gds.topCells||[]));topSelect.innerHTML='';
  const topSet=new Set(state.gds.topCells||[]);
  for(const name of allCells){const option=document.createElement('option');option.value=name;option.textContent=name + (topSet.has(name)?' ★':'' );option.selected=name===state.gds.activeTopCell;topSelect.appendChild(option);}
  const scale=UNIT_TO_UM[gdsAlignmentUnit],transform=state.gds.transform||{};
  $('gdsOffsetX').value=formatDisplayNumber((Number(transform.offsetX)||0)/scale);$('gdsOffsetY').value=formatDisplayNumber((Number(transform.offsetY)||0)/scale);$('gdsRotation').value=formatDisplayNumber(Number(transform.rotationDeg)||0);$('gdsAlignmentUnit').value=gdsAlignmentUnit;
  const locked=state.imprintedFaces.length>0;for(const el of [$('gdsOffsetX'),$('gdsOffsetY'),$('gdsRotation'),$('gdsAlignmentUnit'),$('applyGdsAlignmentBtn')])el.disabled=locked;topSelect.disabled=locked||!gdsSourceFile||allCells.length<2;$('gdsLockHint').classList.toggle('hidden',!locked);
}
function renderLayerList(){
  const box=$('layerList');box.innerHTML='';
  renderGdsControls();if(!state.gds.layers.length){box.className='layer-list empty-note';box.textContent='Import a GDSII or OASIS file to view its layers.';return;} box.className='layer-list';
  for(const layer of state.gds.layers){
    const item=document.createElement('div');item.className='layer-item';
    const head=document.createElement('div');head.className='layer-head';
    const vis=document.createElement('input');vis.type='checkbox';vis.checked=layer.visible!==false;vis.addEventListener('change',()=>{layer.visible=vis.checked;renderTop();});
    const sw=document.createElement('span');sw.className='layer-swatch';sw.style.background=layer.color;
    const strong=document.createElement('strong');strong.textContent=layer.alias||`Layer ${layer.layer}/${layer.datatype}`;strong.title=`Layer ${layer.layer}/${layer.datatype}`;
    const count=document.createElement('span');count.className='muted';count.textContent=`${layer.count||layer.polygons.length}`;
    head.append(vis,sw,strong,count);item.appendChild(head);
    const locked=state.imprintedFaces.some(f=>f.layerKey===layer.key),options=document.createElement('div');options.className='layer-options';
    const tone=document.createElement('label');tone.className='layer-tone';const invert=document.createElement('input');invert.type='checkbox';invert.checked=layer.inverted===true;invert.disabled=locked;invert.addEventListener('change',()=>{layer.inverted=invert.checked;status(`Layer ${layer.layer}/${layer.datatype} tone: ${layer.inverted?'inverted':'normal'}.`);});tone.append(invert,document.createTextNode('Invert'));options.appendChild(tone);
    const fillLabel=document.createElement('label');fillLabel.className='layer-tone';const fill=document.createElement('input');fill.type='checkbox';fill.checked=layer.fillPattern===true;fill.disabled=locked;fill.addEventListener('change',async()=>{fill.disabled=true;const enabled=fill.checked;try{await setLayerFillPattern(layer,enabled);status(`Layer ${layer.layer}/${layer.datatype}: ${enabled?'filled closed patterns':'original geometry'}.`);}catch(e){fill.checked=!enabled;status(`Fill pattern failed: ${e.message}`);}finally{fill.disabled=locked;}});fillLabel.append(fill,document.createTextNode('Fill pattern'));options.appendChild(fillLabel);
    const mirrorLabel=document.createElement('label');mirrorLabel.className='layer-tone';const mirror=document.createElement('input');mirror.type='checkbox';mirror.checked=layer.mirrored===true;mirror.disabled=locked;mirror.addEventListener('change',()=>{layer.mirrored=mirror.checked;state.topBounds=null;renderTop();status(`Layer ${layer.layer}/${layer.datatype}: ${layer.mirrored?'mirrored left/right about the layout origin':'original orientation'}.`);});mirrorLabel.append(mirror,document.createTextNode('Mirror'));options.appendChild(mirrorLabel);item.appendChild(options);
    const acts=document.createElement('div');acts.className='layer-actions';
    const imprint=document.createElement('button');imprint.textContent='Imprint';imprint.addEventListener('click',()=>imprintLayer(layer));
    const sel=document.createElement('button');sel.textContent='Select faces';sel.addEventListener('click',()=>{for(const f of state.imprintedFaces.filter(f=>f.layerKey===layer.key&&(f.side||'front')===state.activeFace))state.selectedFaceIds.add(f.id);updateSelectionInfo();renderTop();});
    const alias=document.createElement('button');alias.textContent='Alias';alias.addEventListener('click',()=>{const value=prompt(`Alias for layer ${layer.layer}/${layer.datatype}`,layer.alias||'');if(value===null)return;layer.alias=value.trim();renderLayerList();});
    acts.append(imprint,sel,alias);item.appendChild(acts);box.appendChild(item);
  }
}
async function setLayerFillPattern(layer,enabled){
  if(enabled&&!Array.isArray(layer.filledPolygons)){const response=await fetch('/api/geometry/fill-holes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:layer.polygons||[]})});if(!response.ok){const data=await response.json().catch(()=>({detail:response.statusText}));throw new Error(data.detail||response.statusText);}const data=await response.json();layer.filledPolygons=Array.isArray(data.regions)?data.regions:[];}
  layer.fillPattern=enabled;state.topBounds=null;renderTop();
}
async function imprintLayer(layer){
  if(!state.wafer){status('Create or open a wafer before imprinting a layer.');return;}
  const side=state.activeFace,inverted=layer.inverted===true;if(state.imprintedFaces.some(f=>f.layerKey===layer.key&&(f.side||'front')===side)){status(`Layer ${layer.layer}/${layer.datatype} is already imprinted on the ${side} face.`);return;}
  const transformed=effectiveLayerPolygons(layer).map(poly=>transformedLayerPolygon(layer,poly));status(`Resolving ${inverted?'inverted':'normal'}${layer.fillPattern?' filled':''}${layer.mirrored?' mirrored':''} mask geometry inside the substrate…`);let regions;try{regions=await resolveMaskRegions(transformed,inverted);}catch(e){status(`Imprint failed: ${e.message}`);return;}
  regions.forEach((polygon,i)=>state.imprintedFaces.push({id:uid('face'),layerKey:layer.key,polyIndex:i,partIndex:0,side,inverted,fillPattern:layer.fillPattern===true,mirrored:layer.mirrored===true,polygon}));
  status(`Imprinted ${regions.length} substrate-bounded region(s) from layer ${layer.layer}/${layer.datatype} on the ${side} face.`);renderGdsControls();renderLayerList();renderAll();
}

async function importGds(file,topCell=null,preserveTransform=false){
  if(state.imprintedFaces.length){status('Create a new wafer before replacing a layout that has already been imprinted.');return;}
  status(`Reading ${file.name}…`);const form=new FormData();form.append('file',file);if(topCell)form.append('top_cell',topCell);
  let res;try{res=await fetch('/api/gds/inspect',{method:'POST',body:form});}catch(e){status(`Layout request failed: ${e.message}`);return;}
  if(!res.ok){const j=await res.json().catch(()=>({detail:res.statusText}));status(`Layout import: ${j.detail||res.statusText}`);return;}
  const data=await res.json();
  const previousTransform=preserveTransform?state.gds.transform:null,previousAliases=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.alias])),previousTones=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.inverted===true])),previousFills=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.fillPattern===true])),previousMirrors=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.mirrored===true]));
  state.gds=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells||[],activeTopCell:data.active_top_cell,transform:previousTransform||{offsetX:0,offsetY:0,rotationDeg:0},hierarchy:data.hierarchy||[],layers:data.layers.map((l,i)=>{const key=`${l.layer}/${l.datatype}`;return {...l,key,alias:previousAliases.get(key)||'',inverted:previousTones.get(key)||false,fillPattern:previousFills.get(key)||false,mirrored:previousMirrors.get(key)||false,visible:true,color:palette[i%palette.length]};})});gdsSourceFile=file;
  for(const layer of state.gds.layers.filter(l=>l.fillPattern))await setLayerFillPattern(layer,true);
  $('gdsStatus').textContent=`${state.gds.layers.length} layers`;
  renderLayerList();renderHierarchy();fitLayout();renderAll();
  status(`Loaded ${data.filename}: ${data.active_top_cell}, ${data.layers.length} layer/datatype pairs${data.truncated?' (polygon limit reached)':''}.`);
}
function renderSnapshots(){
  const box=$('snapshotList');box.innerHTML='';
  if(!state.snapshots.length){const n=document.createElement('div');n.className='empty-note';n.textContent='No snapshots yet.';box.appendChild(n);return;}
  for(const s of state.snapshots){const item=document.createElement('div');item.className='snapshot-item'+(s.id===state.activeSnapshotId?' active':'');item.addEventListener('click',()=>{state.activeSnapshotId=s.id;restoreDeviceSnapshot(s.device);renderSnapshots();status(`Restored snapshot: ${s.name}`)});const name=document.createElement('div');name.className='snapshot-name';name.textContent=s.name;const meta=document.createElement('div');meta.className='snapshot-meta';meta.textContent=`${s.device.solids.length} solid additions · ${s.device.cuts.length} cuts`;item.append(name,meta);box.appendChild(item);}
}
function createSnapshot(){if(!state.wafer){status('Create or open a wafer before saving a snapshot.');return;}const name=prompt('Snapshot name',`State ${state.snapshots.length+1}`);if(!name)return;const s={id:uid('snap'),name,created:new Date().toISOString(),device:currentDeviceSnapshot()};state.snapshots.push(s);state.activeSnapshotId=s.id;renderSnapshots();status(`Snapshot saved: ${name}`);}

function modelStats(){$('modelStats').textContent=state.wafer?`${state.solids.length} solids · ${state.cuts.length} cuts · ${state.dopings.length} doped regions · ${state.imprintedFaces.length} faces`:'';}
function renderAll(){ensureLayerVisuals();renderTop();renderSection();render3D();renderFigureLegend();renderDopingControls();updateUndoUi();modelStats();}

async function initThree(){
  try{
    THREE=await import('three');
    ({OrbitControls}=await import('three/addons/controls/OrbitControls.js'));
  }catch(e){$('threeError').classList.remove('hidden');$('threeError').textContent='The local 3D library could not be loaded. Run npm install and restart WaferCAD. '+e.message;return;}
  const host=$('threeContainer');renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf1f3f5);host.appendChild(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.01,5000);camera.up.set(0,0,1);camera.position.set(state.activeFace==='back'?-7:7,-9,state.activeFace==='back'?-6:6);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.1);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x66717c,2.0));const dl=new THREE.DirectionalLight(0xffffff,2.4);dl.position.set(5,-4,9);scene.add(dl);
  deviceGroup=new THREE.Group();scene.add(deviceGroup);axesGroup=createInfiniteAxes();axesGroup.visible=state.showAxes;scene.add(axesGroup);
  resizeObserver=new ResizeObserver(()=>resizeThree());resizeObserver.observe(host);resizeThree();animateThree();render3D();
}
function resizeThree(){if(!renderer)return;const host=$('threeContainer'),w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function createAxisLabel(text,color,position){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const context=canvas.getContext('2d');context.font='700 42px Segoe UI, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.fillText(text,48,32);const texture=new THREE.CanvasTexture(canvas),material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.position.set(...position);sprite.scale.set(.42,.28,1);sprite.renderOrder=1002;return sprite;}
function createInfiniteAxes(){
  const group=new THREE.Group(),extent=1000,axes=[{points:[[-extent,0,0],[extent,0,0]],color:0xdc2626},{points:[[0,-extent,0],[0,extent,0]],color:0x16a34a},{points:[[0,0,-extent],[0,0,extent]],color:0x2563eb}];
  for(const axis of axes){const geometry=new THREE.BufferGeometry().setFromPoints(axis.points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineBasicMaterial({color:axis.color,transparent:true,opacity:.82,depthTest:false,depthWrite:false});const line=new THREE.Line(geometry,material);line.renderOrder=1000;group.add(line);}
  const origin=new THREE.Mesh(new THREE.SphereGeometry(.085,18,12),new THREE.MeshBasicMaterial({color:0x111827,depthTest:false,depthWrite:false}));origin.renderOrder=1001;origin.name='Origin';group.add(origin,createAxisLabel('X','#dc2626',[5.1,0,0]),createAxisLabel('Y','#16a34a',[0,5.1,0]),createAxisLabel('Z','#2563eb',[0,0,5.1]),createAxisLabel('O','#111827',[.18,.18,.18]));return group;
}
function updateAxesVisibility(){state.showAxes=$('showAxes').checked;if(axesGroup)axesGroup.visible=state.showAxes;status(state.showAxes?'3D origin and X/Y/Z axes shown.':'3D axes hidden.');}
function syncViewControls(){if($('zExag')){$('zExag').value=String(state.zExag);$('zExagValue').value=`×${formatDisplayNumber(state.zExag)}`;}$('showAxes').checked=state.showAxes;if(axesGroup)axesGroup.visible=state.showAxes;}
function animateThree(now=performance.now()){if(!renderer)return;requestAnimationFrame(animateThree);updateCameraFaceFlip(now);controls.update();renderer.render(scene,camera);}
function disposeGroup(g){while(g.children.length){const o=g.children.pop();if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}}}
function scaledPoly(poly,scale){return poly.map(([x,y])=>[x*scale,y*scale]);}
function makeShape(poly){const s=new THREE.Shape();poly.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
function mappedZ(z){return displayZ(z);}
function render3D(){
  if(!THREE||!deviceGroup)return;disposeGroup(deviceGroup);if(!state.wafer||!state.slice)return;
  const xy=waferXYScale(),scaledWafer=scaledPoly(waferOutline(),xy);
  // Build substrate as vertical slabs. Each slab gets holes for cuts that fully span it.
  const zBounds=[-state.wafer.thickness,0,...state.cuts.flatMap(c=>[Math.max(-state.wafer.thickness,c.zMin),Math.min(0,c.zMax)])].sort((a,b)=>a-b).filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-9);
  for(let i=0;i<zBounds.length-1;i++){
    const low=zBounds[i],high=zBounds[i+1]; const shape=makeShape(scaledWafer);
    const activeCuts=state.cuts.filter(c=>c.zMin<=low+1e-8&&c.zMax>=high-1e-8);
    for(const cut of activeCuts){const pp=scaledPoly(cut.footprint,xy);const hole=new THREE.Path();pp.forEach(([x,y],j)=>j?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}
    const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);deviceGroup.add(mesh);
  }
  const layerDescriptors=solidLayerDescriptors();
  for(const solid of state.solids){const p=scaledPoly(solid.footprint,xy),shape=makeShape(p),mapped=mappedSolidBounds(solid,layerDescriptors),depth=Math.max(mapped.zMax-mapped.zMin,.004),geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geo.translate(0,0,mapped.zMin);const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(solid.layerId).color),roughness:.55,metalness:solid.material.toLowerCase().includes('metal')?.6:.05,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));}
  for(const doping of state.dopings){const p=scaledPoly(doping.footprint,xy),shape=makeShape(p),mapped=mappedDopingBounds(doping,layerDescriptors),depth=Math.max(mapped.zMax-mapped.zMin,.004),geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geo.translate(0,0,mapped.zMin);const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(doping.layerId).color),transparent:true,opacity:.38,depthWrite:false,roughness:.35,metalness:0,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));}
  // Selected slice plane.
  const a=state.slice.a,b=state.slice.b,ax=a.x*xy,ay=a.y*xy,bx=b.x*xy,by=b.y*xy,len=Math.hypot(bx-ax,by-ay),angle=Math.atan2(by-ay,bx-ax),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors));const maxz=Math.max(.3,...mappedSolids.map(s=>s.zMax));const minz=Math.min(mappedZ(-state.wafer.thickness),...mappedSolids.map(s=>s.zMin)),height=maxz-minz+.2;const plane=new THREE.Mesh(new THREE.BoxGeometry(len,.018,height),new THREE.MeshBasicMaterial({color:0x2563eb,transparent:true,opacity:.18,depthWrite:false}));plane.position.set((ax+bx)/2,(ay+by)/2,(maxz+minz)/2);plane.rotation.z=angle;deviceGroup.add(plane);
  const boundaryPoints=scaledWafer.map(([x,y])=>new THREE.Vector3(x,y,.006));const boundaryGeo=new THREE.BufferGeometry().setFromPoints(boundaryPoints);const boundary=new THREE.LineLoop(boundaryGeo,new THREE.LineBasicMaterial({color:0x475569}));deviceGroup.add(boundary);
}

function saveProject(){
  ensureLayerVisuals();const payload={format:'wafercad-mvp',version:6,wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,gds:state.gds,imprintedFaces:state.imprintedFaces,slice:state.slice,snapshots:state.snapshots,view:{zExag:state.zExag,showAxes:state.showAxes}};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wafercad-project.json';a.click();URL.revokeObjectURL(a.href);status('Project saved.');
}
async function openProject(file){try{const p=JSON.parse(await file.text());if(p.format!=='wafercad-mvp')throw new Error('Not a WaferCAD MVP project');state.wafer=p.wafer?normalizeWafer(p.wafer):null;state.activeFace=p.activeFace||'front';state.solids=p.solids||[];state.cuts=p.cuts||[];state.dopings=p.dopings||[];state.layerVisuals=p.layerVisuals||{};state.gds=normalizeGds(p.gds);state.imprintedFaces=p.imprintedFaces||[];state.slice=p.slice||null;state.snapshots=p.snapshots||[];state.zExag=Number.isFinite(Number(p.view?.zExag))?Math.min(40,Math.max(1,Number(p.view.zExag))):8;state.showAxes=p.view?.showAxes===true;state.operationUndo=[];state._exactThickness=null;ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();gdsSourceFile=null;if(state.wafer&&!state.slice)setDefaultSlice();state.topBounds=null;$('gdsStatus').textContent=state.gds.layers?.length?`${state.gds.layers.length} layers`:'none';syncViewControls();updateActiveFaceUi();updateSelectionInfo();renderLayerList();renderHierarchy();renderSnapshots();fitWafer();renderAll();status(`Opened ${file.name}.`);}catch(e){status(`Open project failed: ${e.message}`)}}

function updateWaferShapeFields(){const shape=$('waferShape').value;$('waferCircleFields').classList.toggle('hidden',shape!=='circle');$('waferRectFields').classList.toggle('hidden',shape!=='rect');$('waferCustomFields').classList.toggle('hidden',shape!=='custom');}
function convertFields(ids,fromUnit,toUnit){const ratio=UNIT_TO_UM[fromUnit]/UNIT_TO_UM[toUnit];for(const id of ids){const el=$(id),v=Number(el.value);if(Number.isFinite(v))el.value=String(Number((v*ratio).toPrecision(10)));}}
function waferLateralUnitSelects(){return [...document.querySelectorAll('.wafer-lateral-unit')];}
function setWaferLateralUnit(unit){for(const select of waferLateralUnitSelects())select.value=unit;}
function formatCoordinateText(poly,unit){const scale=UNIT_TO_UM[unit];return poly.map(([x,y])=>`${Number((x/scale).toPrecision(10))}, ${Number((y/scale).toPrecision(10))}`).join('\n');}
function convertCoordinateTextUnits(text,fromUnit,toUnit){const ratio=UNIT_TO_UM[fromUnit]/UNIT_TO_UM[toUnit];return text.split(/\r?\n/).map(line=>{const parts=line.trim().split(/[,\s]+/).filter(Boolean);if(parts.length!==2)return line;const x=Number(parts[0]),y=Number(parts[1]);if(!Number.isFinite(x)||!Number.isFinite(y))return line;return `${Number((x*ratio).toPrecision(10))}, ${Number((y*ratio).toPrecision(10))}`;}).join('\n');}
function parseCoordinateText(text,unit){
  const scale=UNIT_TO_UM[unit],lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const poly=lines.map((line,i)=>{const parts=line.split(/[,\s]+/).filter(Boolean);if(parts.length!==2)throw new Error(`Line ${i+1}: enter one x, y coordinate pair.`);const x=Number(parts[0]),y=Number(parts[1]);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error(`Line ${i+1}: coordinates must be numbers.`);return [x*scale,y*scale];});
  if(poly.length<3)throw new Error('Enter at least three polygon vertices.');
  if(!isSimplePolygon(poly))throw new Error('The polygon crosses itself. Check the vertex order.');
  if(Math.abs(polygonArea(poly))<1e-9)throw new Error('Polygon area must be non-zero.');
  if(polygonArea(poly)<0)poly.reverse();
  return poly;
}
function loadWaferForm(){
  const w=normalizeWafer(state.wafer||DEFAULT_WAFER),lu=w.displayUnits?.lateral||'mm',tu=w.displayUnits?.thickness||'um';waferDialogLateralUnit=lu;waferDialogThicknessUnit=tu;setWaferLateralUnit(lu);$('waferThicknessUnit').value=tu;$('waferShape').value=w.shape;$('waferMaterial').value=w.material;$('waferThickness').value=String(w.thickness/UNIT_TO_UM[tu]);
  if(w.shape==='circle')$('waferDiameter').value=String(w.diameter/UNIT_TO_UM[lu]);
  if(w.shape==='rect'){$('waferWidth').value=String(w.width/UNIT_TO_UM[lu]);$('waferHeight').value=String(w.height/UNIT_TO_UM[lu]);}
  $('waferCoordinates').value=formatCoordinateText(waferOutline(w),lu);
  $('waferFormError').classList.add('hidden');updateWaferShapeFields();
}

function bindUi(){
  $('newWaferBtn').addEventListener('click',()=>{loadWaferForm();$('waferDialog').showModal();});
  $('flipFaceBtn').addEventListener('click',flipActiveFace);
  $('waferShape').addEventListener('change',updateWaferShapeFields);
  for(const select of waferLateralUnitSelects())select.addEventListener('change',()=>{const next=select.value;convertFields(['waferDiameter','waferWidth','waferHeight'],waferDialogLateralUnit,next);$('waferCoordinates').value=convertCoordinateTextUnits($('waferCoordinates').value,waferDialogLateralUnit,next);waferDialogLateralUnit=next;setWaferLateralUnit(next);});
  $('waferThicknessUnit').addEventListener('change',()=>{const next=$('waferThicknessUnit').value;convertFields(['waferThickness'],waferDialogThicknessUnit,next);waferDialogThicknessUnit=next;});
  $('waferForm').addEventListener('submit',(ev)=>{
    if(ev.submitter?.value==='cancel')return;ev.preventDefault();const error=$('waferFormError');error.classList.add('hidden');
    try{
      const shape=$('waferShape').value,lu=waferDialogLateralUnit,tu=$('waferThicknessUnit').value,lateralScale=UNIT_TO_UM[lu],thicknessScale=UNIT_TO_UM[tu];
      const positive=(id,label)=>{const v=Number($(id).value);if(!Number.isFinite(v)||v<=0)throw new Error(`${label} must be positive.`);return v;};
      const wafer={shape,thickness:positive('waferThickness','Thickness')*thicknessScale,material:$('waferMaterial').value.trim()||'Si',displayUnits:{lateral:lu,thickness:tu}};
      if(shape==='circle')wafer.diameter=positive('waferDiameter','Diameter')*lateralScale;
      if(shape==='rect'){wafer.width=positive('waferWidth','Width')*lateralScale;wafer.height=positive('waferHeight','Height')*lateralScale;}
      if(shape==='custom')wafer.outline=parseCoordinateText($('waferCoordinates').value,lu);
      state.wafer=normalizeWafer(wafer);state.activeFace='front';state.solids=[];state.cuts=[];state.dopings=[];state.operationUndo=[];state._exactThickness=null;state.layerVisuals={substrate:{name:`Substrate · ${state.wafer.material}`,color:materialColor(state.wafer.material),scale:1}};state.imprintedFaces=[];state.selectedFaceIds.clear();clearTopSelection();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();updateSelectionInfo();fitWafer();renderGdsControls();renderAll();$('waferDialog').close('default');status(`New ${shape} wafer created.`);
    }catch(e){error.textContent=e.message;error.classList.remove('hidden');}
  });
  $('gdsInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)importGds(f);e.target.value='';});
  $('sliceCoordinateUnit').addEventListener('change',()=>{const next=$('sliceCoordinateUnit').value;convertFields(['sliceAx','sliceAy','sliceBx','sliceBy'],sliceCoordinateUnit,next);sliceCoordinateUnit=next;});
  $('applySliceCoordinatesBtn').addEventListener('click',()=>{if(!state.slice)return;const values=['sliceAx','sliceAy','sliceBx','sliceBy'].map(id=>Number($(id).value));if(values.some(v=>!Number.isFinite(v))){status('A–B coordinates must be valid numbers.');return;}if(values[0]===values[2]&&values[1]===values[3]){status('A and B must be different points.');return;}const scale=UNIT_TO_UM[sliceCoordinateUnit];state.slice={a:{x:values[0]*scale,y:values[1]*scale},b:{x:values[2]*scale,y:values[3]*scale}};renderTop();renderSection();render3D();status('Applied A–B section coordinates.');});
  $('gdsTopCell').addEventListener('change',async()=>{if(!gdsSourceFile)return;await importGds(gdsSourceFile,$('gdsTopCell').value,true);});
  $('gdsAlignmentUnit').addEventListener('change',()=>{const next=$('gdsAlignmentUnit').value;convertFields(['gdsOffsetX','gdsOffsetY'],gdsAlignmentUnit,next);gdsAlignmentUnit=next;});
  $('applyGdsAlignmentBtn').addEventListener('click',()=>{if(state.imprintedFaces.length){status('Alignment is locked after imprinting.');return;}const x=Number($('gdsOffsetX').value),y=Number($('gdsOffsetY').value),rotation=Number($('gdsRotation').value);if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(rotation)){status('GDS alignment values must be valid numbers.');return;}const scale=UNIT_TO_UM[gdsAlignmentUnit];state.gds.transform={offsetX:x*scale,offsetY:y*scale,rotationDeg:rotation};state.topBounds=null;fitLayout();renderAll();status(`Applied GDS alignment: X ${x} ${gdsAlignmentUnit}, Y ${y} ${gdsAlignmentUnit}, rotation ${rotation}°.`);});
  $('applyPushPullBtn').addEventListener('click',applyPushPull);$('snapshotBtn').addEventListener('click',createSnapshot);$('fitWaferBtn').addEventListener('click',fitWafer);$('fitLayoutBtn').addEventListener('click',fitLayout);$('zExag').addEventListener('input',()=>{state.zExag=Number($('zExag').value);$('zExagValue').value=`×${formatDisplayNumber(state.zExag)}`;renderSection();render3D();});$('showAxes').addEventListener('change',updateAxesVisibility);$('saveProjectBtn').addEventListener('click',saveProject);$('openProjectInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)openProject(f);e.target.value='';});
  $('pushMode').addEventListener('change',updateOperationModeUi);updateOperationModeUi();
  $('selectionMode')?.addEventListener('change',()=>{state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status(isTopFaceSelection()?'Selection: top faces (model). Click a visible film top in Top View.':'Selection: imprinted faces.');});
  $('undoOperationBtn').addEventListener('click',undoOperation);
  $('applyLayerVisualBtn').addEventListener('click',()=>{const scale=Number($('layerVisualScale').value),name=$('layerVisualName').value.trim(),error=$('layerVisualError');if(!name){error.textContent='Material name cannot be empty.';error.classList.remove('hidden');return;}if(!Number.isFinite(scale)||scale<=0||scale>100){error.textContent='Display scale must be greater than 0 and no more than 100.';error.classList.remove('hidden');return;}if(!editingLayerVisualId||!state.layerVisuals[editingLayerVisualId])return;renameLayerMaterial(editingLayerVisualId,name);state.layerVisuals[editingLayerVisualId].color=validColor($('layerVisualColor').value);state.layerVisuals[editingLayerVisualId].scale=scale;$('layerVisualDialog').close('default');renderAll();status(`Updated ${state.layerVisuals[editingLayerVisualId].name}: display ×${formatDisplayNumber(scale)}.`);});
}

bindUi();bindTopNavigation();syncViewControls();updateActiveFaceUi();updateSelectionInfo();renderLayerList();renderSnapshots();renderAll();initThree();
fetch('/api/health').then(r=>r.json()).then(h=>{if(!h.gdstk)status("Ready. GDS import is disabled until 'gdstk' is installed.");}).catch(()=>{});
