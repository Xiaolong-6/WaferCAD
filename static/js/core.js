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
    const payload = JSON.stringify({
      wafer:state.wafer, activeFace:state.activeFace,
      solids:state.solids, cuts:state.cuts, dopings:state.dopings, layerVisuals:state.layerVisuals,
      gds:state.gds, imprintedFaces:state.imprintedFaces,
      selectedFaceIds:[... (state.selectedFaceIds||[])], patternSelectedKeys:[... (state.patternSelectedKeys||[]) ],
      slice:state.slice, snapshots:state.snapshots, activeSnapshotId:state.activeSnapshotId,
      topBounds:state.topBounds, zExag:state.zExag, showAxes:state.showAxes, maskBaseOpacity:state.maskBaseOpacity,
      // transform is inside gds, keep for compat
      transform:state.gds.transform
    });
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
    if(d.wafer!==undefined) state.wafer=d.wafer;
    if(d.activeFace) state.activeFace=d.activeFace;
    if(Array.isArray(d.solids)) state.solids=d.solids;
    if(Array.isArray(d.cuts)) state.cuts=d.cuts;
    if(Array.isArray(d.dopings)) state.dopings=d.dopings;
    if(d.layerVisuals) state.layerVisuals=d.layerVisuals;
    if(d.gds) {
      state.gds={...state.gds, ...d.gds};
      if(d.transform) state.gds.transform=d.transform;
    }
    if(Array.isArray(d.imprintedFaces)) state.imprintedFaces=d.imprintedFaces;
    if(Array.isArray(d.selectedFaceIds)) state.selectedFaceIds=new Set(d.selectedFaceIds);
    if(Array.isArray(d.patternSelectedKeys)) state.patternSelectedKeys=new Set(d.patternSelectedKeys);
    if(d.slice!==undefined) state.slice=d.slice;
    if(Array.isArray(d.snapshots)) state.snapshots=d.snapshots;
    if(d.activeSnapshotId!==undefined) state.activeSnapshotId=d.activeSnapshotId;
    if(d.topBounds!==undefined) state.topBounds=d.topBounds;
    if(d.zExag!==undefined) state.zExag=d.zExag;
    if(d.showAxes!==undefined) state.showAxes=d.showAxes;
    if(d.maskBaseOpacity!==undefined) state.maskBaseOpacity=d.maskBaseOpacity;
    if(d._topFaceSelection && Array.isArray(d._topFaceSelection.selectedSolidIds)) state._topFaceSelection.selectedSolidIds=new Set(d._topFaceSelection.selectedSolidIds);
    // restore file blob for cell switching (base64 stored on import)
    try{
      const b64=sessionStorage.getItem('wafercad_gds_blob');
      const name=sessionStorage.getItem('wafercad_gds_name');
      if(b64 && !state._gdsFileBlob){
        const bytes=Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
        state._gdsFileBlob=new File([bytes], name||'file.gds');
        state._gdsFileName=name||'file.gds';
      }
    }catch{}
    return true;
  }catch{ return false; }
}
export function hasSharedState(){
  try{ return !!(sessionStorage.getItem('wafercad_gds') || localStorage.getItem('wafercad_shared')); }catch{ return false; }
}
export function clearSharedState(){
  try{
    sessionStorage.removeItem('wafercad_gds');
    sessionStorage.removeItem('wafercad_gds_blob');
    sessionStorage.removeItem('wafercad_gds_name');
    localStorage.removeItem('wafercad_shared');
    localStorage.removeItem('wafercad_last_save_ts');
  }catch{}
}
