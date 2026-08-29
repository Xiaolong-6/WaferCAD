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
  gds:{filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,transform:{offsetX:0,offsetY:0,rotationDeg:0,scale:1}},
  imprintedFaces:[],
  selectedFaceIds:new Set(),
  patternSelectedKeys:new Set(),
  slice:null,
  snapshots:[],
  activeSnapshotId:null,
  topBounds:null,
  zExag:8,
  showAxes:false,
  maskBaseOpacity:.35,
  operationUndo:[],
  _exactThickness:null,
  _topFaceSelection:{enabled:false,selectedSolidIds:new Set()},
};

export function uid(prefix='id'){return `${prefix}_${Math.random().toString(36).slice(2,10)}`;}
export function clone(value){return JSON.parse(JSON.stringify(value));}
export function status(message){const el=$('statusText'); if(el) el.textContent=message;}
export function formatDisplayNumber(value){return String(Number(Number(value).toPrecision(10)));}
export function rgbHexToInt(hex){return parseInt(hex.replace('#',''),16);}
export function persistSharedState(){
  try{
    const payload = JSON.stringify({wafer:state.wafer, gds:state.gds, transform:state.gds.transform, patternSelectedKeys:[... (state.patternSelectedKeys||[]) ], solids:state.solids, cuts:state.cuts, dopings:state.dopings, layerVisuals:state.layerVisuals, snapshots:state.snapshots });
    sessionStorage.setItem('wafercad_gds', payload);
    localStorage.setItem('wafercad_shared', payload);
    localStorage.setItem('wafercad_last_save_ts', String(Date.now()));
  }catch{}
}
export function loadSharedState(){
  try{
    const raw = sessionStorage.getItem('wafercad_gds') || localStorage.getItem('wafercad_shared');
    if(!raw) return false;
    const d=JSON.parse(raw);
    if(d.wafer) state.wafer=d.wafer;
    if(d.gds) {
      state.gds={...state.gds, ...d.gds};
      if(d.transform) state.gds.transform=d.transform;
      if(Array.isArray(d.patternSelectedKeys)) state.patternSelectedKeys=new Set(d.patternSelectedKeys);
    }
    if(Array.isArray(d.solids)) state.solids=d.solids;
    if(Array.isArray(d.cuts)) state.cuts=d.cuts;
    if(Array.isArray(d.dopings)) state.dopings=d.dopings;
    if(d.layerVisuals) state.layerVisuals=d.layerVisuals;
    if(Array.isArray(d.snapshots)) state.snapshots=d.snapshots;
    return true;
  }catch{ return false; }
}
export function hasSharedState(){
  try{ return !!(sessionStorage.getItem('wafercad_gds') || localStorage.getItem('wafercad_shared')); }catch{ return false; }
}
export function clearSharedState(){
  try{ sessionStorage.removeItem('wafercad_gds'); localStorage.removeItem('wafercad_shared'); localStorage.removeItem('wafercad_last_save_ts'); }catch{}
}
