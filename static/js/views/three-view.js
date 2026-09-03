import {$,rgbHexToInt,state} from '../core.js';
import {polygonTopologies,waferOutline,waferXYScale} from '../geometry.js';
import {createLayerMappingContext,displayZ,layerVisual,mappedDopingBounds,mappedSolidBounds,solidLayerDescriptors} from '../layer-model.js';

// This view owns only derived display resources. Physical editor state and the
// shared substrate Boolean cache remain with the application/controller.
export function createThreeView({
  getSubstrateSlabs,ensureSubstrateSlabs,getSubstrateZBounds,
  mainWorkspaceVisible,memoryDiagnosticsEnabled=()=>false,correctnessDiagnosticsEnabled=()=>false,
}){
  let THREE=null,OrbitControls=null,mergeGeometries=null;
  let renderer=null,scene=null,camera=null,controls=null,deviceGroup=null,axesGroup=null;
  let cameraFlipAnimation=null,resizeObserver=null;
  let render3DFrame=null,threeLoopRunning=false,threeFrameId=null;
  let initPromise=null,destroyed=false;
  const debugEnabled=(new URLSearchParams(location.search).get('qa')||'').includes('three-view');
  const debug=debugEnabled?(state._threeViewDebug||(state._threeViewDebug={instances:0,initCalls:0,rendererCreations:0,renderCalls:0,loopStarts:0,loopStops:0,frames:0})):null;
  if(debug)debug.instances++;

  // Idempotent even while the dynamic imports are still in flight.
  function init(){
    if(debug)debug.initCalls++;
    if(destroyed)return Promise.resolve();
    if(!initPromise)initPromise=initialize();
    return initPromise;
  }
  function groupBy(items,keyOf){const groups=new Map();for(const item of items){const key=keyOf(item),group=groups.get(key);if(group)group.push(item);else groups.set(key,[item]);}return groups;}
  function captureCameraState(){
    if(!camera || !controls) return null;
    return { position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() };
  }
  function restoreCameraState(cam){
    if(!cam || !camera || !controls) return;
    try{
      if(Array.isArray(cam.position)) camera.position.fromArray(cam.position);
      if(Array.isArray(cam.target)) controls.target.fromArray(cam.target);
      if(Array.isArray(cam.up)) camera.up.fromArray(cam.up);
      controls.update();
    }catch(e){ console.warn('restore camera failed',e); }
  }

  function placeCameraOnActiveFace(){if(!camera)return;const back=state.activeFace==='back';camera.position.x=back?-Math.abs(camera.position.x):Math.abs(camera.position.x);camera.position.z=back?-Math.abs(camera.position.z):Math.abs(camera.position.z);controls?.update();}
  function startCameraFaceFlip(){if(!camera||!controls)return;const target=controls.target.clone(),relative=camera.position.clone().sub(target);cameraFlipAnimation={started:performance.now(),duration:720,target,relative};controls.enabled=false;}
  function updateCameraFaceFlip(now){if(!cameraFlipAnimation)return;const a=cameraFlipAnimation,t=Math.min(1,(now-a.started)/a.duration),eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,angle=Math.PI*eased,c=Math.cos(angle),s=Math.sin(angle),r=a.relative;camera.position.set(a.target.x+r.x*c+r.z*s,a.target.y+r.y,a.target.z-r.x*s+r.z*c);camera.lookAt(a.target);if(t>=1){cameraFlipAnimation=null;controls.enabled=true;controls.update();}}

  async function initialize(){
    try{
      THREE=await import('three');
      ({OrbitControls}=await import('three/addons/controls/OrbitControls.js'));
      ({mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js'));
    }catch(e){$('threeError').classList.remove('hidden');$('threeError').textContent='The local 3D library could not be loaded. Run npm install and restart WaferCAD. '+e.message;return;}
    if(destroyed)return;
    const host=$('threeContainer');renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf1f3f5);host.appendChild(renderer.domElement);if(debug)debug.rendererCreations++;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.01,5000);camera.up.set(0,0,1);camera.position.set(state.activeFace==='back'?-7:7,-9,state.activeFace==='back'?-6:6);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.1);controls.enableDamping=true;
    scene.add(new THREE.HemisphereLight(0xffffff,0x66717c,2.0));const dl=new THREE.DirectionalLight(0xffffff,2.4);dl.position.set(5,-4,9);scene.add(dl);
    deviceGroup=new THREE.Group();scene.add(deviceGroup);axesGroup=createInfiniteAxes();axesGroup.visible=state.showAxes;scene.add(axesGroup);
    resizeObserver=new ResizeObserver(()=>resizeThree());resizeObserver.observe(host);resizeThree();render3D();startThreeLoop();
  }
  function resizeThree(){if(!renderer)return;const host=$('threeContainer'),w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  function createAxisLabel(text,color,position){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const context=canvas.getContext('2d');context.font='700 42px Segoe UI, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.fillText(text,48,32);const texture=new THREE.CanvasTexture(canvas),material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.position.set(...position);sprite.scale.set(.42,.28,1);sprite.renderOrder=1002;return sprite;}
  function createInfiniteAxes(){
    const group=new THREE.Group(),extent=1000,axes=[{points:[[-extent,0,0],[extent,0,0]],color:0xdc2626},{points:[[0,-extent,0],[0,extent,0]],color:0x16a34a},{points:[[0,0,-extent],[0,0,extent]],color:0x2563eb}];
    for(const axis of axes){const geometry=new THREE.BufferGeometry().setFromPoints(axis.points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineBasicMaterial({color:axis.color,transparent:true,opacity:.82,depthTest:false,depthWrite:false});const line=new THREE.Line(geometry,material);line.renderOrder=1000;group.add(line);}
    const origin=new THREE.Mesh(new THREE.SphereGeometry(.085,18,12),new THREE.MeshBasicMaterial({color:0x111827,depthTest:false,depthWrite:false}));origin.renderOrder=1001;origin.name='Origin';group.add(origin,createAxisLabel('X','#dc2626',[5.1,0,0]),createAxisLabel('Y','#16a34a',[0,5.1,0]),createAxisLabel('Z','#2563eb',[0,0,5.1]),createAxisLabel('O','#111827',[.18,.18,.18]));return group;
  }

  function shouldRunThreeLoop(){return !destroyed&&!!renderer&&!document.hidden&&mainWorkspaceVisible();}
  function startThreeLoop(){if(threeLoopRunning||!shouldRunThreeLoop())return;threeLoopRunning=true;if(debug)debug.loopStarts++;threeFrameId=requestAnimationFrame(animateThree);}
  function stopThreeLoop(){if(threeLoopRunning&&debug)debug.loopStops++;threeLoopRunning=false;if(threeFrameId!=null){cancelAnimationFrame(threeFrameId);threeFrameId=null;}}
  function animateThree(now=performance.now()){if(!threeLoopRunning||!renderer)return;threeFrameId=null;updateCameraFaceFlip(now);controls.update();renderer.render(scene,camera);if(debug)debug.frames++;threeFrameId=requestAnimationFrame(animateThree);}

  function render3DDebugStats(){if(!memoryDiagnosticsEnabled())return null;return state._render3DStats||(state._render3DStats={requested:0,executed:0,scheduled:false});}
  function scheduleRender3D(){if(destroyed)return;const stats=render3DDebugStats();if(stats)stats.requested++;if(render3DFrame!=null)return;render3DFrame=requestAnimationFrame(()=>{render3DFrame=null;if(stats)stats.scheduled=false;render3D();});if(stats)stats.scheduled=true;}
  function cancelScheduledRender3D(){if(render3DFrame!=null){cancelAnimationFrame(render3DFrame);render3DFrame=null;}const stats=render3DDebugStats();if(stats)stats.scheduled=false;}

  function disposeGroup(group,{textures=false}={}){
    if(!group)return;
    const geometries=new Set(),materials=new Set(),maps=new Set();
    group.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
        materials.add(material);
        if(textures&&material.map)maps.add(material.map);
      }
    });
    group.clear();
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    for(const map of maps)map.dispose();
  }
  function scaledPoly(poly,scale){return poly.map(([x,y])=>[x*scale,y*scale]);}
  function makeShape(poly){const s=new THREE.Shape();poly.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
  function makeTopologyShape(topology,scale){const shape=makeShape(scaledPoly(topology.outer,scale));for(const contour of topology.holes){const hole=new THREE.Path();scaledPoly(contour,scale).forEach(([x,y],index)=>index?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}return shape;}
  function mappedZ(z){return displayZ(z);}
  function addMergedExtrusions(items,xy,boundsOf,materialOf,kind,collectRefillDiagnostics){
    let meshCount=0;
    for(const group of groupBy(items,item=>`${item.layerId}|${item.material||item.dopant||''}`).values()){
      const geometries=[];
      for(const item of group){
        const mapped=boundsOf(item),depth=Math.max(mapped.zMax-mapped.zMin,1e-9),geometryBounds=collectRefillDiagnostics?{min:Infinity,max:-Infinity}:null;
        for(const topology of polygonTopologies(item.footprint)){
          const shape=makeTopologyShape(topology,xy),geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geometry.translate(0,0,mapped.zMin);
          if(collectRefillDiagnostics){geometry.computeBoundingBox();geometryBounds.min=Math.min(geometryBounds.min,geometry.boundingBox.min.z);geometryBounds.max=Math.max(geometryBounds.max,geometry.boundingBox.max.z);}
          geometries.push(geometry);
        }
        if(collectRefillDiagnostics)state._solidRenderBounds.push({id:item.id,layerId:item.layerId,kind,physical:{min:Number(item.zMin),max:Number(item.zMax)},mapped:{min:mapped.zMin,max:mapped.zMax},geometry:geometryBounds});
      }
      const material=materialOf(group[0]);
      if(geometries.length===1){deviceGroup.add(new THREE.Mesh(geometries[0],material));meshCount++;continue;}
      const merged=mergeGeometries(geometries,false);
      if(merged){for(const geometry of geometries)geometry.dispose();deviceGroup.add(new THREE.Mesh(merged,material));meshCount++;continue;}
      for(const geometry of geometries){deviceGroup.add(new THREE.Mesh(geometry,material.clone()));meshCount++;}
      material.dispose();
    }
    return meshCount;
  }
  function render3D(){
    if(debug)debug.renderCalls++;
    if(!THREE||!deviceGroup)return;disposeGroup(deviceGroup);if(!state.wafer||!state.slice)return;
    const debugStats=render3DDebugStats();if(debugStats)debugStats.executed++;
    const xy=waferXYScale(),scaledWafer=scaledPoly(waferOutline(),xy);
    // Both views read the same controller-owned cache; null means pending.
    void ensureSubstrateSlabs();
    const zBounds=getSubstrateZBounds(),slabs=getSubstrateSlabs();
    const slabMap=slabs?new Map(slabs.map(slab=>[`${slab.zMin}|${slab.zMax}`,slab])):null;
    // Use derived remaining substrate per Z slab; whole-face cuts produce empty remaining (no mesh) and edge-touching cuts are rendered as remaining outer regions, not as degenerate holes.
    let substrateSlabCount=0,substrateRegionCount=0,substrateMeshCount=0,substratePendingSlabs=0,substrateTopologyHoles=0;
    for(let i=0;i<zBounds.length-1;i++){
      const low=zBounds[i],high=zBounds[i+1];
      const slabKey=`${low}|${high}`;
      const slabInfo=slabMap?.get(slabKey);
      if(slabInfo){
        if(slabInfo.isEmpty){
          substrateSlabCount++;
          continue;
        }
        if(slabInfo.useHoles){
          const shape=makeShape(scaledWafer);
          for(const footprint of slabInfo.unionRegions){const pp=scaledPoly(footprint,xy);const hole=new THREE.Path();pp.forEach(([x,y],j)=>j?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}
          const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateRegionCount++;substrateMeshCount++;substrateSlabCount++;
        } else {
          for(const topology of slabInfo.remainingTopologies||slabInfo.remainingRegions.flatMap(polygonTopologies)){
            const shape=makeTopologyShape(topology,xy);
            substrateTopologyHoles+=topology.holes.length;
            const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateRegionCount++;substrateMeshCount++;
          }
          substrateSlabCount++;
        }
      } else {
        // While exact Boolean regions are pending, omit affected slabs. This avoids
        // both a transient residual rim and ever constructing a boundary-touching
        // or whole-face cut as a Three.js hole.
        const active=state.cuts.filter(c=>c.zMin<=low+1e-8&&c.zMax>=high-1e-8);
        if(active.length){substratePendingSlabs++;continue;}
        const shape=makeShape(scaledWafer);
        const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateSlabCount++;substrateRegionCount++;substrateMeshCount++;
      }
    }
    const layerDescriptors=solidLayerDescriptors(),mappingContext=createLayerMappingContext();
    const collectRefillDiagnostics=correctnessDiagnosticsEnabled();
    if(collectRefillDiagnostics)state._solidRenderBounds=[];
    const solidMeshes=addMergedExtrusions(state.solids,xy,solid=>mappedSolidBounds(solid,layerDescriptors,mappingContext),solid=>new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(solid.layerId).color),roughness:.55,metalness:solid.material.toLowerCase().includes('metal')?.6:.05,side:THREE.DoubleSide}),'solid',collectRefillDiagnostics);
    const dopingMeshes=addMergedExtrusions(state.dopings,xy,doping=>mappedDopingBounds(doping,layerDescriptors,mappingContext),doping=>new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(doping.layerId).color),transparent:true,opacity:.38,depthWrite:false,roughness:.35,metalness:0,side:THREE.DoubleSide}),'doping',collectRefillDiagnostics);
    state._renderStats={substrateSlabs:substrateSlabCount,substrateRegions:substrateRegionCount,substrateMeshes:substrateMeshCount,substratePendingSlabs,substrateTopologyHoles,solidRegions:state.solids.length,solidMeshes,dopingRegions:state.dopings.length,dopingMeshes};
    // Selected slice plane.
    const a=state.slice.a,b=state.slice.b,ax=a.x*xy,ay=a.y*xy,bx=b.x*xy,by=b.y*xy,len=Math.hypot(bx-ax,by-ay),angle=Math.atan2(by-ay,bx-ax),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors,mappingContext));const maxz=Math.max(.3,...mappedSolids.map(s=>s.zMax));const minz=Math.min(mappedZ(-state.wafer.thickness),...mappedSolids.map(s=>s.zMin)),height=maxz-minz+.2;const plane=new THREE.Mesh(new THREE.BoxGeometry(len,.018,height),new THREE.MeshBasicMaterial({color:0x2563eb,transparent:true,opacity:.18,depthWrite:false}));plane.position.set((ax+bx)/2,(ay+by)/2,(maxz+minz)/2);plane.rotation.z=angle;deviceGroup.add(plane);
    const boundaryPoints=scaledWafer.map(([x,y])=>new THREE.Vector3(x,y,.006));const boundaryGeo=new THREE.BufferGeometry().setFromPoints(boundaryPoints);const boundary=new THREE.LineLoop(boundaryGeo,new THREE.LineBasicMaterial({color:0x475569}));deviceGroup.add(boundary);
  }


  function syncAxes(){if(axesGroup)axesGroup.visible=state.showAxes;}
  function syncActiveFace({animate=false}={}){if(animate)startCameraFaceFlip();else placeCameraOnActiveFace();}
  function syncVisibility(){
    if(document.hidden||!mainWorkspaceVisible())stopThreeLoop();
    else {scheduleRender3D();startThreeLoop();}
  }
  function captureImage(){
    if(!renderer)return null;
    renderer.render(scene,camera);
    return renderer.domElement.toDataURL('image/png');
  }
  function diagnostics(){
    return {
      memory:renderer?{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}:null,
      render3D:state._render3DStats?{...state._render3DStats}:null,
      loopRunning:threeLoopRunning,
      camera:captureCameraState(),
      debug:debug?{...debug}:null,
      destroyed,
    };
  }
  // Terminal and idempotent: an in-flight init cannot resurrect disposed resources.
  function destroy(){
    if(destroyed)return;
    destroyed=true;
    cancelScheduledRender3D();stopThreeLoop();
    document.removeEventListener('visibilitychange',syncVisibility);
    resizeObserver?.disconnect();resizeObserver=null;
    cameraFlipAnimation=null;
    controls?.dispose();
    disposeGroup(deviceGroup);
    // Axis labels are application-lifetime textures, disposed only with this view.
    disposeGroup(axesGroup,{textures:true});
    scene?.clear();
    renderer?.dispose();renderer?.domElement.remove();
    renderer=null;scene=null;camera=null;controls=null;deviceGroup=null;axesGroup=null;
    if(debug)debug.instances--;
  }
  document.addEventListener('visibilitychange',syncVisibility);
  return {
    init,render:render3D,scheduleRender:scheduleRender3D,cancelScheduledRender:cancelScheduledRender3D,
    resize:resizeThree,start:startThreeLoop,stop:stopThreeLoop,syncVisibility,destroy,diagnostics,
    captureCamera:captureCameraState,restoreCamera:restoreCameraState,captureImage,syncActiveFace,syncAxes,
  };
}
