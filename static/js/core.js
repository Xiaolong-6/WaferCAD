export const $ = (id) => document.getElementById(id);
export const NS = 'http://www.w3.org/2000/svg';
export const palette = ['#2563eb','#dc2626','#059669','#7c3aed','#d97706','#0891b2','#db2777','#4f46e5','#65a30d','#9333ea'];

export const DEFAULT_WAFER = {shape:'circle',diameter:100000,thickness:500,material:'Si',displayUnits:{lateral:'mm',thickness:'um'},edgeFeature:'none'};
export const UNIT_TO_UM = {nm:.001,um:1,mm:1000,cm:10000};

export const state = {
  wafer:null,
  activeFace:'front',
  solids:[],
  cuts:[],
  dopings:[],
  layerVisuals:{},
  gds:{filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,maskPolarity:'transmit',truncated:false,polygonLimit:20000,committedProjection:null,transform:{offsetX:0,offsetY:0,rotationDeg:0,scale:1}},
  imprintedFaces:[],
  selectedFaceIds:new Set(),
  patternSelectedKeys:new Set(),
  slice:null,
  snapshots:[],
  snapshotDevices:{},
  snapshotThumbnails:{},
  activeSnapshotId:null,
  topBounds:null,
  zExag:8,
  zMapping:'linear',
  zLogK:.05,
  showAxes:false,
  maskBaseOpacity:.35,
  sectionBreak:{enabled:false,mode:'surfaces',frontKeep:5,backKeep:5,from:-495,to:-5},
  selectionMode:'top',
  operationUndo:[],
  _revision:0,
  _exactThickness:null,
  _topFaceSelection:{enabled:false,selectedSolidIds:new Set()},
};

export function uid(prefix='id'){return `${prefix}_${Math.random().toString(36).slice(2,10)}`;}
export function clone(value){return JSON.parse(JSON.stringify(value));}
export function status(message){const el=$('statusText'); if(el) el.textContent=message;}
export function formatDisplayNumber(value){return String(Number(Number(value).toPrecision(10)));}
export function rgbHexToInt(hex){return parseInt(hex.replace('#',''),16);}
const DB_NAME='wafercad-local',DB_STORE='records',DB_VERSION=1;
let persistenceQueue=Promise.resolve();
function openPersistenceDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(DB_STORE))request.result.createObjectStore(DB_STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB open failed'));});}
async function writeStateBundle(payload,source){const db=await openPersistenceDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE);store.put(payload,'state');store.put(source,'gds-source');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('IndexedDB write failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB write aborted'));});}finally{db.close();}}
async function readRecord(key){const db=await openPersistenceDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly'),request=tx.objectStore(DB_STORE).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB read failed'));});}finally{db.close();}}
async function clearRecords(){const db=await openPersistenceDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('IndexedDB clear failed'));});}finally{db.close();}}
function persistencePayload(){return {wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,gds:state.gds,imprintedFaces:state.imprintedFaces,selectedFaceIds:[...(state.selectedFaceIds||[])],patternSelectedKeys:[...(state.patternSelectedKeys||[])],slice:state.slice,snapshots:state.snapshots,snapshotDevices:state.snapshotDevices,snapshotThumbnails:state.snapshotThumbnails,activeSnapshotId:state.activeSnapshotId,topBounds:state.topBounds,zExag:state.zExag,zMapping:state.zMapping,zLogK:state.zLogK,showAxes:state.showAxes,maskBaseOpacity:state.maskBaseOpacity,sectionBreak:state.sectionBreak,selectionMode:state.selectionMode,transform:state.gds.transform,_revision:state._revision,_topFaceSelection:{selectedSolidIds:[...(state._topFaceSelection?.selectedSolidIds||[])]}};}
function hydrateState(d){
  if(!d||typeof d!=='object')return false;if(d.wafer!==undefined)state.wafer=d.wafer;if(d.activeFace)state.activeFace=d.activeFace;if(Array.isArray(d.solids))state.solids=d.solids;if(Array.isArray(d.cuts))state.cuts=d.cuts;if(Array.isArray(d.dopings))state.dopings=d.dopings;if(d.layerVisuals)state.layerVisuals=d.layerVisuals;if(d.gds){state.gds={...state.gds,...d.gds};if(d.transform)state.gds.transform=d.transform;}if(Array.isArray(d.imprintedFaces))state.imprintedFaces=d.imprintedFaces;if(Array.isArray(d.selectedFaceIds))state.selectedFaceIds=new Set(d.selectedFaceIds);if(Array.isArray(d.patternSelectedKeys))state.patternSelectedKeys=new Set(d.patternSelectedKeys);if(d.slice!==undefined)state.slice=d.slice;if(Array.isArray(d.snapshots))state.snapshots=d.snapshots;if(d.snapshotDevices&&typeof d.snapshotDevices==='object')state.snapshotDevices=d.snapshotDevices;if(d.snapshotThumbnails&&typeof d.snapshotThumbnails==='object')state.snapshotThumbnails=d.snapshotThumbnails;if(d.activeSnapshotId!==undefined)state.activeSnapshotId=d.activeSnapshotId;if(d.topBounds!==undefined)state.topBounds=d.topBounds;if(d.zExag!==undefined)state.zExag=d.zExag;if(d.zMapping==='linear'||d.zMapping==='log')state.zMapping=d.zMapping;if(Number.isFinite(Number(d.zLogK))&&Number(d.zLogK)>0)state.zLogK=Number(d.zLogK);if(d.showAxes!==undefined)state.showAxes=d.showAxes;if(d.maskBaseOpacity!==undefined)state.maskBaseOpacity=d.maskBaseOpacity;if(d.sectionBreak&&typeof d.sectionBreak==='object')state.sectionBreak={...state.sectionBreak,...d.sectionBreak};if(d.selectionMode==='top'||d.selectionMode==='imprinted'||d.selectionMode==='patterns')state.selectionMode=d.selectionMode;if(Number.isFinite(Number(d._revision)))state._revision=Number(d._revision);if(d._topFaceSelection&&Array.isArray(d._topFaceSelection.selectedSolidIds))state._topFaceSelection.selectedSolidIds=new Set(d._topFaceSelection.selectedSolidIds);return true;
}
export function commitState(reason='state-mutation'){
  state._revision=(Number(state._revision)||0)+1;const payload=structuredClone(persistencePayload()),blob=state._gdsFileBlob||null,blobName=state._gdsFileName||blob?.name||null,timestamp=Date.now();
  try{localStorage.setItem('wafercad_has_state','1');localStorage.setItem('wafercad_last_save_ts',String(timestamp));}catch{}
  window.dispatchEvent(new CustomEvent('wafercad:state-change',{detail:{reason,revision:state._revision}}));
  persistenceQueue=persistenceQueue.catch(()=>{}).then(async()=>{await writeStateBundle(payload,blob?{blob,name:blobName,revision:payload._revision}:null);return true;}).catch(error=>{status(`Persistence failed: ${error.message}. Current in-memory state is still active.`);window.dispatchEvent(new CustomEvent('wafercad:persistence-error',{detail:{error}}));return false;});
  return persistenceQueue;
}
export function persistSharedState(reason){return commitState(reason||'legacy-mutation');}
export async function loadSharedState(){
  try{
    let saved=await readRecord('state');
    if(!saved){const raw=sessionStorage.getItem('wafercad_gds')||localStorage.getItem('wafercad_shared');if(raw)saved=JSON.parse(raw);}
    if(!hydrateState(saved))return false;
    const source=await readRecord('gds-source');if(source?.blob){state._gdsFileBlob=source.blob;state._gdsFileName=source.name||source.blob.name||'layout.gds';}
    try{sessionStorage.removeItem('wafercad_gds');sessionStorage.removeItem('wafercad_gds_blob');sessionStorage.removeItem('wafercad_gds_name');localStorage.removeItem('wafercad_shared');}catch{}
    return true;
  }catch(error){status(`Restore failed: ${error.message}`);return false;}
}
export function hasSharedState(){try{return localStorage.getItem('wafercad_has_state')==='1'||!!(sessionStorage.getItem('wafercad_gds')||localStorage.getItem('wafercad_shared'));}catch{return false;}}
export async function clearSharedState(){
  await persistenceQueue.catch(()=>{});
  try{await clearRecords();}catch(error){status(`Unable to clear persisted state: ${error.message}`);}
  try{sessionStorage.removeItem('wafercad_gds');sessionStorage.removeItem('wafercad_gds_blob');sessionStorage.removeItem('wafercad_gds_name');localStorage.removeItem('wafercad_shared');localStorage.removeItem('wafercad_has_state');localStorage.removeItem('wafercad_last_save_ts');}catch{}
}
