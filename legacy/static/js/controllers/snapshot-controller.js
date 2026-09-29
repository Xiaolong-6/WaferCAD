import {state,uid} from '../core.js';
import {internDevice,internThumbnail,pruneSnapshotDevices,resolveSnapshotDevice,resolveSnapshotThumbnail} from '../snapshot-store.js';

// Capture/restore and UI callbacks are synchronous, matching the existing APIs.
// Always read shared state: project load/reset may replace its snapshot arrays.
export function createSnapshotController({captureCurrentDevice,restoreDevice,captureCamera,restoreCamera,captureThumbnail,onSnapshotsChanged,onSnapshotActivated,reportStatus,qa=false}){
  const debug=qa?(state._snapshotControllerDebug||(state._snapshotControllerDebug={instances:0,creates:0,activates:0,autosaves:0,deletes:0,restores:0})):null;
  if(debug)debug.instances++;

  function listSnapshots(){return state.snapshots.map(snapshot=>{
    const device=resolveSnapshotDevice(snapshot);
    return {id:snapshot.id,name:snapshot.name,active:snapshot.id===state.activeSnapshotId,thumbnail:resolveSnapshotThumbnail(snapshot),solids:device.solids.length,cuts:device.cuts.length};
  });}
  function create(name){
    const thumb=captureThumbnail(),camera=captureCamera();
    const snapshot={id:uid('snap'),name,created:new Date().toISOString(),deviceRef:internDevice(captureCurrentDevice()),thumbRef:internThumbnail(thumb),camera};
    state.snapshots.push(snapshot);state.activeSnapshotId=snapshot.id;
    if(debug)debug.creates++;
    onSnapshotsChanged();reportStatus(`Snapshot saved: ${name}`);
  }
  function saveActive(){
    const active=state.snapshots.find(snapshot=>snapshot.id===state.activeSnapshotId);
    if(active){
      if(debug)debug.autosaves++;
      try{
        active.deviceRef=internDevice(captureCurrentDevice());delete active.device;
        const thumb=captureThumbnail();if(thumb){active.thumbRef=internThumbnail(thumb);delete active.thumb;}
        const camera=captureCamera();if(camera)active.camera=camera;
        active.updated=new Date().toISOString();
      }catch(error){console.warn('auto-save snapshot failed',error);}
    }
    return active;
  }
  function autoSaveActive(){if(saveActive())onSnapshotsChanged();}
  function activate(id){
    if(id===state.activeSnapshotId)return;
    const snapshot=state.snapshots.find(item=>item.id===id);if(!snapshot)return;
    if(debug)debug.activates++;
    const active=saveActive();
    // Preserve the established ordering: ID is set before restore, whose app
    // callback refreshes/persists the device. Camera restoration follows it.
    state.activeSnapshotId=snapshot.id;
    restoreDevice(resolveSnapshotDevice(snapshot));
    if(debug)debug.restores++;
    if(snapshot.camera)restoreCamera(snapshot.camera);
    onSnapshotActivated({hasCamera:!!snapshot.camera});
    reportStatus(active?`Auto-saved previous state, switched to ${snapshot.name}`:`Restored snapshot: ${snapshot.name}`);
  }
  function deleteSnapshot(id){
    const index=state.snapshots.findIndex(snapshot=>snapshot.id===id);if(index===-1)return;
    const name=state.snapshots[index].name;state.snapshots.splice(index,1);pruneSnapshotDevices();
    // Selecting the last remaining ID does not restore that snapshot's device.
    if(state.activeSnapshotId===id)state.activeSnapshotId=state.snapshots.length?state.snapshots[state.snapshots.length-1].id:null;
    if(debug)debug.deletes++;
    onSnapshotsChanged();reportStatus(`Deleted snapshot: ${name}`);
  }
  function diagnostics(){return {activeSnapshotId:state.activeSnapshotId,count:state.snapshots.length,debug:debug?{...debug}:null};}
  return {create,activate,delete:deleteSnapshot,autoSaveActive,listSnapshots,diagnostics};
}
