import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {parseGDS,flattenGDS,makeDemoLayout} from './gds.js';
import {GRID_N,createModel,cloneModel,cellCenter,cellIndex,topSegment,surfaceZ,applyOperation,fullFaceMask,modelBoundsZ} from './model.js';

const $=id=>document.getElementById(id);
const MASK_PALETTE=['#58758a','#69877f','#8c7669','#746f91','#7f8466','#8a6d78','#5f7f8e','#8a806b'];
function emptyLayout(){return {name:'No mask',root:'',elements:[],linework:[],bounds:{minX:-50,minY:-50,maxX:50,maxY:50,width:100,height:100},combos:[],hierarchy:{}}}
let model=createModel(),layout=emptyLayout(),parsedGds=null,selectedLayerKeys=new Set();
let activeCell=null,expandedCells=new Set(),hoveredLayerKey=null;
let maskTransform={x:0,y:0,scale:1,rotation:0},activeFace='front',roi=null,roiTool=null,roiDraft=null;
let section={a:[-42,0],b:[42,0]},history=[],future=[];
const planViews={mask:{zoom:1,panX:0,panY:0},main:{zoom:1,panX:0,panY:0}};

function status(msg){$('statusText').textContent=msg}
function pointInPoly([x,y],pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-20)+xi))inside=!inside;}return inside}
function distSeg(p,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1],d=vx*vx+vy*vy,t=d?Math.max(0,Math.min(1,(wx*vx+wy*vy)/d)):0;return Math.hypot(p[0]-(a[0]+t*vx),p[1]-(a[1]+t*vy))}
function invMaskPoint([x,y]){const a=-maskTransform.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-maskTransform.x,dy=y-maskTransform.y;return [(dx*c-dy*s)/maskTransform.scale,(dx*s+dy*c)/maskTransform.scale]}
function maskPoint([x,y]){const a=maskTransform.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=x*maskTransform.scale,sy=y*maskTransform.scale;return [sx*c-sy*s+maskTransform.x,sx*s+sy*c+maskTransform.y]}
function layerKey(layer,datatype){return `${layer}|${datatype}`}
function descendantCells(name){
  const out=new Set();
  function walk(n){if(!n||out.has(n))return;out.add(n);for(const child of cellChildren(n))walk(child.name)}
  walk(name);return out;
}
function activeScopeCells(){return activeCell?descendantCells(activeCell):new Set()}
function selectedElement(e){return activeScopeCells().has(e.sourceCell)&&selectedLayerKeys.has(layerKey(e.layer,e.datatype))}
function pointInMaskWorld(p){const q=invMaskPoint(p);for(const e of layout.elements){if(!selectedElement(e))continue;if(e.kind==='polygon'&&pointInPoly(q,e.points))return true;if(e.kind==='path'&&e.width>0){for(let i=1;i<e.points.length;i++)if(distSeg(q,e.points[i-1],e.points[i])<=e.width/2)return true;}}return false}
function rasterMask(){const a=new Uint8Array(model.columns.length);for(let j=0;j<model.rows;j++)for(let i=0;i<model.cols;i++){const idx=j*model.cols+i;if(model.columns[idx].length&&pointInMaskWorld(cellCenter(model,i,j)))a[idx]=1;}return a}
function pointInRoi(p){if(!roi)return true;if(roi.type==='rect')return p[0]>=Math.min(roi.a[0],roi.b[0])&&p[0]<=Math.max(roi.a[0],roi.b[0])&&p[1]>=Math.min(roi.a[1],roi.b[1])&&p[1]<=Math.max(roi.a[1],roi.b[1]);if(roi.type==='circle')return Math.hypot(p[0]-roi.c[0],p[1]-roi.c[1])<=roi.r;return roi.type==='polygon'?pointInPoly(p,roi.points):true}
function saveHistory(){history.push(cloneModel(model));if(history.length>40)history.shift();future=[];syncUndo()}
function syncUndo(){$('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length}
function fitImportedLayout(){const b=layout.bounds,s=.78*Math.min(model.width/b.width,model.height/b.height);maskTransform={scale:Number.isFinite(s)?s:1,rotation:0,x:-((b.minX+b.maxX)/2)*s,y:-((b.minY+b.maxY)/2)*s};syncTransformInputs()}
function syncTransformInputs(){$('maskOffsetX').value=maskTransform.x.toFixed(3);$('maskOffsetY').value=maskTransform.y.toFixed(3);$('maskScale').value=maskTransform.scale.toPrecision(5);$('maskRotation').value=maskTransform.rotation}
function layerColor(key,alpha=1){let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;const hex=MASK_PALETTE[h%MASK_PALETTE.length];if(alpha>=.999)return hex;const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`}
function globalLayers(){
  const map=new Map();
  for(const combo of layout.combos||[]){
    const key=layerKey(combo.layer,combo.datatype);
    if(!map.has(key))map.set(key,{key,layer:combo.layer,datatype:combo.datatype,count:0,cells:new Set()});
    const item=map.get(key);item.count+=combo.count;item.cells.add(combo.cell);
  }
  return [...map.values()].sort((a,b)=>a.layer-b.layer||a.datatype-b.datatype);
}
function hierarchyFromParsed(parsed){
  const hierarchy={};
  for(const name of parsed.cellOrder){
    const counts=new Map(),cell=parsed.cells.get(name);
    for(const e of cell?.elements||[]){
      if(e.kind!=='sref'&&e.kind!=='aref')continue;
      const n=e.kind==='aref'?Math.max(1,e.cols||1)*Math.max(1,e.rows||1):1;
      counts.set(e.name,(counts.get(e.name)||0)+n);
    }
    hierarchy[name]=[...counts].map(([child,count])=>({name:child,count}));
  }
  return hierarchy;
}
function ensureHierarchy(){
  if(layout.hierarchy&&Object.keys(layout.hierarchy).length)return;
  const root=layout.root||'',cells=new Set(root?[root]:[]);
  for(const c of layout.combos||[])cells.add(c.cell);
  for(const e of layout.linework||[])if(e.sourceCell)cells.add(e.sourceCell);
  layout.hierarchy={};
  for(const name of cells)layout.hierarchy[name]=[];
  if(root)layout.hierarchy[root]=[...cells].filter(name=>name!==root).map(name=>({name,count:1}));
}
function cellChildren(name){ensureHierarchy();return layout.hierarchy?.[name]||[]}
function setActiveCell(name){activeCell=name||null;renderCellTree();renderMaskList();renderMask();$('maskCellLabel').textContent=activeCell||'—'}
function renderCellTree(){
  ensureHierarchy();
  const host=$('cellTree');host.innerHTML='';
  const root=layout.root||Object.keys(layout.hierarchy||{})[0]||'';
  if(!root){const empty=document.createElement('div');empty.className='empty-list';empty.textContent='No mask loaded';host.append(empty);activeCell=null;return}
  if(!activeCell||!(activeCell in (layout.hierarchy||{})))activeCell=root;
  function node(name,depth,path){
    const children=cellChildren(name),row=document.createElement('div');row.className='cell-row'+(name===activeCell?' active':'')+(depth===0?' root':'');row.style.setProperty('--depth',depth);
    const caret=document.createElement('button');caret.className='cell-caret';caret.type='button';caret.textContent=children.length?(expandedCells.has(name)?'▾':'▸'):'';
    caret.disabled=!children.length;caret.onclick=e=>{e.stopPropagation();expandedCells.has(name)?expandedCells.delete(name):expandedCells.add(name);renderCellTree()};
    const label=document.createElement('button');label.className='cell-name';label.type='button';label.textContent=name;label.onclick=()=>setActiveCell(name);
    row.append(caret,label);host.append(row);
    if(children.length&&expandedCells.has(name)){
      for(const child of children){
        if(path.includes(child.name))continue;
        const before=host.children.length;node(child.name,depth+1,[...path,name]);
        if(child.count>1&&host.children[before]){
          const count=document.createElement('span');count.className='cell-count';count.textContent=`×${child.count}`;host.children[before].append(count);
        }
      }
    }
  }
  node(root,0,[]);
}
function renderMaskList(){
  const host=$('maskLayerList');host.innerHTML='';
  const layers=globalLayers(),scope=activeScopeCells();
  if(!layers.length){const empty=document.createElement('div');empty.className='empty-list';empty.textContent='No area layers';host.append(empty)}
  for(const item of layers){
    const available=[...item.cells].some(cell=>scope.has(cell));
    const row=document.createElement('label');row.className='layer-row'+(selectedLayerKeys.has(item.key)?' selected':'')+(available?'':' unavailable');
    row.onmouseenter=()=>{hoveredLayerKey=item.key;renderMask()};row.onmouseleave=()=>{if(hoveredLayerKey===item.key)hoveredLayerKey=null;renderMask()};
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=selectedLayerKeys.has(item.key);cb.onchange=()=>{cb.checked?selectedLayerKeys.add(item.key):selectedLayerKeys.delete(item.key);renderAll()};
    const sw=document.createElement('span');sw.className='layer-swatch';sw.style.background=layerColor(item.key);
    const text=document.createElement('span');text.className='layer-name';text.textContent=`${item.layer}/${item.datatype}`;
    const count=document.createElement('span');count.className='layer-count';count.textContent=item.count;
    row.title=available?`Layer ${item.layer}/${item.datatype} in selected cell hierarchy`:`Layer ${item.layer}/${item.datatype} is not present in ${activeCell||'this cell'}`;
    row.append(cb,sw,text,count);host.append(row);
  }
  const selected=layers.filter(item=>selectedLayerKeys.has(item.key));
  $('maskSelectionSummary').textContent=!activeCell?'No cell selected':selected.length===1?`Cell: ${activeCell} · Layer: ${selected[0].layer}/${selected[0].datatype}`:selected.length?`Cell: ${activeCell} · ${selected.length} layers selected`:`Cell: ${activeCell} · no layer selected`;
}
function renderStructure(){const host=$('structureList');host.innerHTML='';for(const l of model.layers){const r=document.createElement('div');r.className='structure-row';const sw=document.createElement('span');sw.className='structure-swatch';sw.style.background=l.color;const t=document.createElement('div');t.innerHTML=`<strong>${l.name}</strong>${l.name==='Base'?'':'<br><small>editable layer</small>'}`;r.append(sw,t);host.append(r)}$('structureCount').textContent=`${model.layers.length} layers`;const sel=$('targetLayer');sel.innerHTML='';for(const l of model.layers.filter(x=>x.name!=='Base'))sel.add(new Option(l.name,l.name));}

function setupCanvas(canvas){const dpr=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:r.width,h:r.height}}
function viewport(w,h,kind='mask'){const margin=34,view=planViews[kind]||planViews.mask,base=Math.min((w-margin*2)/model.width,(h-margin*2)/model.height);return {s:base*view.zoom,cx:w/2+view.panX,cy:h/2+view.panY}}
function worldToCanvas(p,v,back=false){const x=back?-p[0]:p[0];return [v.cx+x*v.s,v.cy-p[1]*v.s]}
function canvasToWorld(x,y,v,back=false){let wx=(x-v.cx)/v.s;if(back)wx=-wx;return [wx,(v.cy-y)/v.s]}
function resetPlanView(kind){planViews[kind]={zoom:1,panX:0,panY:0};kind==='mask'?renderMask():renderMain()}
function zoomPlanView(kind,canvas,factor,clientX=null,clientY=null,back=false){
  const state=planViews[kind],r=canvas.getBoundingClientRect(),{w,h}=setupCanvas(canvas),px=clientX==null?w/2:clientX-r.left,py=clientY==null?h/2:clientY-r.top;
  const before=viewport(w,h,kind),anchor=canvasToWorld(px,py,before,back);state.zoom=Math.max(.3,Math.min(12,state.zoom*factor));const after=viewport(w,h,kind),mapped=worldToCanvas(anchor,after,back);state.panX+=px-mapped[0];state.panY+=py-mapped[1];kind==='mask'?renderMask():renderMain();
}
function niceStep(range){const raw=Math.max(1e-9,range/6),p=10**Math.floor(Math.log10(raw)),n=raw/p;return (n<1.5?1:n<3?2:n<7?5:10)*p}
function drawPlanAxes(ctx,v,w,h,back=false){
  const left=30,bottom=h-19,right=w-8,top=8,xa=canvasToWorld(left,bottom,v,back),xb=canvasToWorld(right,bottom,v,back),ya=canvasToWorld(left,bottom,v,back),yb=canvasToWorld(left,top,v,back);
  const xmin=Math.min(xa[0],xb[0]),xmax=Math.max(xa[0],xb[0]),ymin=Math.min(ya[1],yb[1]),ymax=Math.max(ya[1],yb[1]),xs=niceStep(xmax-xmin),ys=niceStep(ymax-ymin);
  ctx.save();ctx.strokeStyle='rgba(74,85,98,.28)';ctx.fillStyle='#6c7783';ctx.lineWidth=.8;ctx.font='9px system-ui';
  ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);ctx.moveTo(left,bottom);ctx.lineTo(left,top);ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='top';
  for(let x=Math.ceil(xmin/xs)*xs;x<=xmax+xs*.001;x+=xs){const p=worldToCanvas([x,0],v,back);if(p[0]<left-1||p[0]>right+1)continue;ctx.beginPath();ctx.moveTo(p[0],bottom);ctx.lineTo(p[0],bottom-4);ctx.stroke();ctx.fillText(Math.abs(x)<1e-9?'0':Number(x.toPrecision(4)),p[0],bottom+2)}
  ctx.textAlign='right';ctx.textBaseline='middle';
  for(let y=Math.ceil(ymin/ys)*ys;y<=ymax+ys*.001;y+=ys){const p=worldToCanvas([0,y],v,back);if(p[1]<top-1||p[1]>bottom+1)continue;ctx.beginPath();ctx.moveTo(left,p[1]);ctx.lineTo(left+4,p[1]);ctx.stroke();ctx.fillText(Math.abs(y)<1e-9?'0':Number(y.toPrecision(4)),left-4,p[1])}
  ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillText('X',right,bottom-4);ctx.textAlign='left';ctx.fillText('Y',left+4,top+9);ctx.restore();
}
function basePath(ctx,v){ctx.beginPath();if(model.shape==='circle')ctx.ellipse(v.cx,v.cy,model.width*v.s/2,model.height*v.s/2,0,0,Math.PI*2);else ctx.rect(v.cx-model.width*v.s/2,v.cy-model.height*v.s/2,model.width*v.s,model.height*v.s)}
function drawBaseOutline(ctx,v){ctx.save();ctx.strokeStyle='#9aa4af';ctx.lineWidth=1.15;ctx.fillStyle='#f2f4f6';basePath(ctx,v);ctx.fill();ctx.stroke();ctx.restore()}
function traceElement(ctx,e,v,selected){const key=layerKey(e.layer,e.datatype),hovered=hoveredLayerKey===key;ctx.beginPath();if(e.kind==='polygon'){e.points.map(maskPoint).forEach((p,i)=>{const [x,y]=worldToCanvas(p,v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fillStyle=selected?layerColor(key,hovered?.78:.58):hovered?layerColor(key,.32):'#aeb6c022';ctx.fill();ctx.strokeStyle=selected||hovered?layerColor(key,.98):'#aeb6c088';ctx.lineWidth=hovered?2:selected?1.2:.7;ctx.stroke()}else{const pts=e.points.map(maskPoint);pts.forEach((p,i)=>{const [x,y]=worldToCanvas(p,v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=selected?layerColor(key,.95):'#aeb6c0';ctx.lineWidth=Math.max(1,e.width*maskTransform.scale*v.s);ctx.stroke()}}
function drawRoi(ctx,v){if(!roi&&!roiDraft)return;const r=roiDraft||roi;ctx.save();ctx.strokeStyle='#e05252';ctx.fillStyle='rgba(224,82,82,.07)';ctx.setLineDash([6,4]);ctx.lineWidth=1.5;ctx.beginPath();if(r.type==='rect'){const a=worldToCanvas(r.a,v),b=worldToCanvas(r.b,v);ctx.rect(a[0],a[1],b[0]-a[0],b[1]-a[1])}else if(r.type==='circle'){const c=worldToCanvas(r.c,v);ctx.arc(c[0],c[1],r.r*v.s,0,Math.PI*2)}else if(r.type==='polygon'&&r.points.length){r.points.forEach((p,i)=>{const q=worldToCanvas(p,v);i?ctx.lineTo(...q):ctx.moveTo(...q)});if(r.closed)ctx.closePath()}ctx.fill();ctx.stroke();ctx.restore()}
function renderMask(){const c=$('maskCanvas'),{ctx,w,h}=setupCanvas(c),v=viewport(w,h,'mask');ctx.clearRect(0,0,w,h);drawBaseOutline(ctx,v);for(const e of layout.linework||[])traceElement(ctx,e,v,false);for(const e of layout.elements)traceElement(ctx,e,v,selectedElement(e));drawRoi(ctx,v);drawPlanAxes(ctx,v,w,h,false)}
function renderMain(){
  const c=$('mainCanvas'),{ctx,w,h}=setupCanvas(c),v=viewport(w,h,'main'),back=activeFace==='back';ctx.clearRect(0,0,w,h);drawBaseOutline(ctx,v);ctx.save();basePath(ctx,v);ctx.clip();
  const sx=model.dx*v.s+0.7,sy=model.dy*v.s+0.7;for(let j=0;j<model.rows;j++)for(let i=0;i<model.cols;i++){const col=model.columns[j*model.cols+i];if(!col.length)continue;const seg=topSegment(col,activeFace),p=worldToCanvas(cellCenter(model,i,j),v,back),z=surfaceZ(col,activeFace),shade=Math.max(-18,Math.min(18,z*1.2));ctx.fillStyle=shadeColor(seg.color,shade);ctx.fillRect(p[0]-sx/2,p[1]-sy/2,sx,sy)}
  ctx.strokeStyle='rgba(20,26,34,.42)';ctx.lineWidth=.75;for(let j=0;j<model.rows;j++)for(let i=0;i<model.cols;i++){const idx=j*model.cols+i,col=model.columns[idx];if(!col.length)continue;const z=surfaceZ(col,activeFace),p=worldToCanvas(cellCenter(model,i,j),v,back);if(i+1<model.cols){const n=model.columns[idx+1],zn=n.length?surfaceZ(n,activeFace):null;if(zn===null||Math.abs(z-zn)>.08){ctx.beginPath();ctx.moveTo(p[0]+sx/2,p[1]-sy/2);ctx.lineTo(p[0]+sx/2,p[1]+sy/2);ctx.stroke()}}if(j+1<model.rows){const n=model.columns[idx+model.cols],zn=n.length?surfaceZ(n,activeFace):null;if(zn===null||Math.abs(z-zn)>.08){ctx.beginPath();ctx.moveTo(p[0]-sx/2,p[1]-sy/2);ctx.lineTo(p[0]+sx/2,p[1]-sy/2);ctx.stroke()}}}
  ctx.restore();
  const a=worldToCanvas(section.a,v,back),b=worldToCanvas(section.b,v,back);ctx.strokeStyle='#cf5464';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();for(const [p,label] of [[a,'A'],[b,'B']]){ctx.fillStyle='#cf5464';ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fill();ctx.font='700 10px system-ui';ctx.fillText(label,p[0]+7,p[1]-7)}
  drawPlanAxes(ctx,v,w,h,back);
}
function shadeColor(hex,delta){const n=parseInt(hex.slice(1),16),r=Math.max(0,Math.min(255,(n>>16)+delta)),g=Math.max(0,Math.min(255,((n>>8)&255)+delta)),b=Math.max(0,Math.min(255,(n&255)+delta));return `rgb(${r},${g},${b})`}
function renderSection(){
  const c=$('sectionCanvas'),{ctx,w,h}=setupCanvas(c);ctx.clearRect(0,0,w,h);const [lo,hi]=modelBoundsZ(model),pad=Math.max(2,(hi-lo)*.12),z0=lo-pad,z1=hi+pad,left=28,right=12,top=12,bottom=25,iw=w-left-right,ih=h-top-bottom,N=Math.max(120,Math.floor(iw/2));
  ctx.fillStyle='#fafbfd';ctx.fillRect(0,0,w,h);for(let k=0;k<N;k++){const t=(k+.5)/N,x=section.a[0]+(section.b[0]-section.a[0])*t,y=section.a[1]+(section.b[1]-section.a[1])*t,ij=cellIndex(model,x,y);if(!ij)continue;const col=model.columns[ij[1]*model.cols+ij[0]];for(const s of col){const yy0=top+(z1-s.z1)/(z1-z0)*ih,yy1=top+(z1-s.z0)/(z1-z0)*ih;ctx.fillStyle=s.color;ctx.fillRect(left+k*iw/N,yy0,iw/N+1,yy1-yy0)}}
  ctx.strokeStyle='#7b8793';ctx.lineWidth=1;ctx.strokeRect(left,top,iw,ih);ctx.fillStyle='#5f6b78';ctx.font='10px system-ui';ctx.fillText(z1.toFixed(1),3,top+8);ctx.fillText(z0.toFixed(1),3,top+ih);ctx.fillText('A',left,top+ih+17);ctx.fillText('B',left+iw-8,top+ih+17);$('sectionMeta').textContent=`${Math.hypot(section.b[0]-section.a[0],section.b[1]-section.a[1]).toFixed(1)} span`;$('sectionRange').textContent=`Z ${lo.toFixed(1)} → ${hi.toFixed(1)}`;
}

let renderer,scene,camera,controls,group,threeReady=false;
function initThree(){const host=$('threeHost');renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf4f6f8);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,1500);camera.up.set(0,0,1);camera.position.set(115,-125,95);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2.6));const d=new THREE.DirectionalLight(0xffffff,2);d.position.set(80,-60,130);scene.add(d);group=new THREE.Group();scene.add(group);host.append(renderer.domElement);new ResizeObserver(()=>resizeThree()).observe(host);threeReady=true;resizeThree();animate();}
function resizeThree(){if(!renderer)return;const r=$('threeHost').getBoundingClientRect();renderer.setSize(Math.max(2,r.width),Math.max(2,r.height),false);camera.aspect=Math.max(2,r.width)/Math.max(2,r.height);camera.updateProjectionMatrix()}
function disposeGroup(){while(group.children.length){const o=group.children.pop();o.geometry?.dispose();o.material?.dispose()}}
function renderThree(){if(!threeReady)return;disposeGroup();const by=new Map();let rendered=0;for(let j=0;j<model.rows;j++)for(let i=0;i<model.cols;i++){const p=cellCenter(model,i,j);if(!pointInRoi(p))continue;for(const s of model.columns[j*model.cols+i]){const key=`${s.name}|${s.color}`;if(!by.has(key))by.set(key,{color:s.color,items:[]});by.get(key).items.push({p,s});rendered++}}
  const geom=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();for(const g of by.values()){const mesh=new THREE.InstancedMesh(geom.clone(),new THREE.MeshStandardMaterial({color:g.color,roughness:.82,metalness:.03}),g.items.length);g.items.forEach(({p,s},idx)=>{dummy.position.set(p[0],p[1],(s.z0+s.z1)/2);dummy.scale.set(model.dx*1.015,model.dy*1.015,Math.max(.01,s.z1-s.z0));dummy.updateMatrix();mesh.setMatrixAt(idx,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true;group.add(mesh)}
  $('threeStats').textContent=roi?'focus region':'full model';
}
function animate(){requestAnimationFrame(animate);if(renderer){controls.update();renderer.render(scene,camera)}}
function fit3d(){const [lo,hi]=modelBoundsZ(model),size=Math.max(model.width,model.height,hi-lo);camera.position.set(size*1.05,-size*1.15,size*.82);controls.target.set(0,0,(lo+hi)/2);controls.update()}

function renderAll(){renderCellTree();renderMaskList();renderStructure();renderMask();renderMain();renderSection();renderThree();$('mainFaceLabel').textContent=`${activeFace} surface`;$('activeFacePill').textContent=activeFace[0].toUpperCase()+activeFace.slice(1);$('maskSummary').textContent=layout.name||'GDS';$('maskCellLabel').textContent=activeCell;$('baseSummary').textContent=`${Number(model.width.toFixed(2))} × ${Number(model.height.toFixed(2))} × ${Number(model.thickness.toFixed(2))}`;syncUndo();}
function updateOperationUI(){const t=$('operationType').value;$('layerNameRow').classList.toggle('hidden',t!=='add');$('targetLayerRow').classList.toggle('hidden',t!=='grow');$('growthModeRow').classList.toggle('hidden',t==='etch');$('operationNote').textContent=t==='etch'?'Etch removes the requested depth vertically through the stack.':$('growthMode').value==='conformal'?'Conformal expands the footprint to represent sidewall coverage.':'Direct follows the selected footprint without lateral growth.'}
function applyOp(){const type=$('operationType').value,thickness=Number($('operationThickness').value);if(!(thickness>0))return status('Thickness must be greater than zero.');let mask=$('operationArea').value==='full'?fullFaceMask(model):rasterMask();if(!mask.some(v=>v))return status('The selected mask does not cover the base.');let name=$('layerName').value.trim()||`Layer ${model.layers.length}`;let target=$('targetLayer').value;if(type==='grow'&&!target)return status('Create a layer before growing it.');saveHistory();applyOperation(model,{type,name,target,thickness,face:activeFace,mask,growth:$('growthMode').value});renderAll();status(`${type==='etch'?'Etched':type==='grow'?`Grew ${target}`:`Added ${name}`} on the ${activeFace}.`)}

function bindUi(){
  document.querySelectorAll('#substrateShape button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#substrateShape button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.shape==='circle')$('baseHeight').value=$('baseWidth').value});
  $('applyBaseBtn').onclick=()=>{const shape=document.querySelector('#substrateShape button.active').dataset.shape,width=Number($('baseWidth').value),height=shape==='circle'?width:Number($('baseHeight').value),thickness=Number($('baseThickness').value);if(width<=0||height<=0||thickness<=0)return status('Base dimensions must be positive.');model=createModel({shape,width,height,thickness});history=[];future=[];section={a:[-width*.42,0],b:[width*.42,0]};renderAll();fit3d();status('Base recreated.')};
  $('demoMaskBtn').onclick=()=>{parsedGds=null;layout=makeDemoLayout();selectedKeys=new Set(['TOP|1|0']);activeCell=layout.root||'TOP';expandedCells=new Set([activeCell]);hoveredLayerKey=null;maskTransform={x:0,y:0,scale:1,rotation:0};syncTransformInputs();renderAll();status('Demo mask loaded.')};
  $('gdsInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{status(`Reading ${f.name}…`);parsedGds=parseGDS(await f.arrayBuffer());layout=flattenGDS(parsedGds,parsedGds.root);layout.name=f.name;layout.hierarchy=hierarchyFromParsed(parsedGds);activeCell=parsedGds.root;expandedCells=new Set([activeCell]);hoveredLayerKey=null;selectedKeys=new Set(layout.combos.map(x=>x.key));fitImportedLayout();renderAll();status(`${f.name}: ${layout.elements.length} area objects; ${layout.linework.length} zero-width line objects ignored for operations.`)}catch(err){console.error(err);status(`GDS import failed: ${err.message}`)}e.target.value=''};
  for(const id of ['maskOffsetX','maskOffsetY','maskScale','maskRotation'])$(id).oninput=()=>{maskTransform={x:Number($('maskOffsetX').value)||0,y:Number($('maskOffsetY').value)||0,scale:Math.max(1e-8,Number($('maskScale').value)||1),rotation:Number($('maskRotation').value)||0};renderMask();renderMain();renderSection();};
  document.querySelectorAll('.roi-tool').forEach(b=>b.onclick=()=>{roiTool=b.dataset.tool;roiDraft=null;document.querySelectorAll('.roi-tool').forEach(x=>x.classList.toggle('active',x===b));status(roiTool==='polygon'?'3D focus: click points in Mask; double-click to close.':'3D focus: drag in Mask to draw the render region.')});$('clearRoiBtn').onclick=()=>{roi=null;roiDraft=null;roiTool=null;document.querySelectorAll('.roi-tool').forEach(x=>x.classList.remove('active'));renderAll()};
  document.querySelectorAll('#faceSelect button').forEach(b=>b.onclick=()=>{activeFace=b.dataset.face;document.querySelectorAll('#faceSelect button').forEach(x=>x.classList.toggle('active',x===b));renderAll()});
  $('operationType').onchange=updateOperationUI;$('growthMode').onchange=updateOperationUI;$('applyOperationBtn').onclick=applyOp;$('fit3dBtn').onclick=fit3d;
  $('undoBtn').onclick=()=>{if(!history.length)return;future.push(cloneModel(model));model=history.pop();renderAll();status('Undid operation.')};$('redoBtn').onclick=()=>{if(!future.length)return;history.push(cloneModel(model));model=future.pop();renderAll();status('Redid operation.')};
  $('resetSectionBtn').onclick=()=>{section={a:[-model.width*.42,0],b:[model.width*.42,0]};renderMain();renderSection()};
  $('newProjectBtn').onclick=()=>{model=createModel();layout=makeDemoLayout();selectedKeys=new Set(['TOP|1|0']);activeCell=layout.root||'TOP';expandedCells=new Set([activeCell]);hoveredLayerKey=null;roi=null;history=[];future=[];activeFace='front';section={a:[-42,0],b:[42,0]};renderAll();fit3d();status('New project.')};
  $('saveProjectBtn').onclick=()=>{ensureHierarchy();const data={format:'WaferCAD-v2-preview',model,layout:{name:layout.name,root:layout.root,elements:layout.elements,linework:layout.linework,bounds:layout.bounds,combos:layout.combos,hierarchy:layout.hierarchy},selectedKeys:[...selectedKeys],activeCell,maskTransform,activeFace,roi,section};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download='wafercad-project.json';a.click();URL.revokeObjectURL(a.href)};
  $('openProjectInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const p=JSON.parse(await f.text());if(p.format!=='WaferCAD-v2-preview')throw new Error('Unsupported project format.');model=p.model;layout=p.layout;selectedKeys=new Set(p.selectedKeys||[]);ensureHierarchy();activeCell=p.activeCell||layout.root||layout.combos?.[0]?.cell||'TOP';expandedCells=new Set([layout.root||activeCell]);hoveredLayerKey=null;maskTransform=p.maskTransform||maskTransform;activeFace=p.activeFace||'front';roi=p.roi||null;section=p.section||section;parsedGds=null;history=[];future=[];syncTransformInputs();renderAll();fit3d();status(`Opened ${f.name}.`)}catch(err){status(`Open failed: ${err.message}`)}e.target.value=''};

  const mc=$('maskCanvas');let drag=null;mc.addEventListener('pointermove',e=>{const r=mc.getBoundingClientRect(),{w,h}=setupCanvas(mc),v=viewport(w,h),p=canvasToWorld(e.clientX-r.left,e.clientY-r.top,v);$('maskCoords').textContent=`x ${p[0].toFixed(1)} · y ${p[1].toFixed(1)}`;if(drag&&roiTool){roiDraft=roiTool==='rect'?{type:'rect',a:drag,b:p}:{type:'circle',c:drag,r:Math.hypot(p[0]-drag[0],p[1]-drag[1])};renderMask()}});mc.addEventListener('pointerdown',e=>{if(!roiTool||roiTool==='polygon')return;const r=mc.getBoundingClientRect(),{w,h}=setupCanvas(mc),v=viewport(w,h);drag=canvasToWorld(e.clientX-r.left,e.clientY-r.top,v);mc.setPointerCapture(e.pointerId)});mc.addEventListener('pointerup',()=>{if(roiDraft){roi=roiDraft;roiDraft=null;renderAll()}drag=null});mc.addEventListener('click',e=>{if(roiTool!=='polygon')return;const r=mc.getBoundingClientRect(),{w,h}=setupCanvas(mc),v=viewport(w,h),p=canvasToWorld(e.clientX-r.left,e.clientY-r.top,v);if(!roiDraft||roiDraft.type!=='polygon')roiDraft={type:'polygon',points:[],closed:false};roiDraft.points.push(p);renderMask()});mc.addEventListener('dblclick',e=>{if(roiTool!=='polygon'||!roiDraft||roiDraft.points.length<3)return;e.preventDefault();roi={...roiDraft,closed:true};roiDraft=null;renderAll()});
  const main=$('mainCanvas');let secDrag=false;main.addEventListener('pointerdown',e=>{const r=main.getBoundingClientRect(),{w,h}=setupCanvas(main),v=viewport(w,h),p=canvasToWorld(e.clientX-r.left,e.clientY-r.top,v,activeFace==='back');section={a:p,b:p};secDrag=true;main.setPointerCapture(e.pointerId);renderMain();renderSection()});main.addEventListener('pointermove',e=>{if(!secDrag)return;const r=main.getBoundingClientRect(),{w,h}=setupCanvas(main),v=viewport(w,h);section.b=canvasToWorld(e.clientX-r.left,e.clientY-r.top,v,activeFace==='back');renderMain();renderSection()});main.addEventListener('pointerup',()=>secDrag=false);
  window.addEventListener('resize',()=>renderAll());
}

function initialDemo(){const m=rasterMask();applyOperation(model,{type:'add',name:'Layer 1',thickness:3,face:'front',mask:m,growth:'direct'});selectedKeys=new Set(['CONTACTS|2|0']);applyOperation(model,{type:'add',name:'Contacts',thickness:2,face:'front',mask:rasterMask(),growth:'direct'});selectedKeys=new Set(['TOP|1|0']);history=[];future=[];}
activeCell=layout.root||'TOP';expandedCells=new Set([activeCell]);bindUi();initThree();initialDemo();updateOperationUI();syncTransformInputs();renderAll();fit3d();status('Demo project ready. Import a GDS file or start editing.');
