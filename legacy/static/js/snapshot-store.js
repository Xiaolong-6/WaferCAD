import {clone,state} from './core.js';

function hashText(text){let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return `device-${(hash>>>0).toString(16)}-${text.length}`;}
export function captureDevice(){return clone({wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,imprintedFaces:state.imprintedFaces});}
export function internDevice(device=captureDevice()){const text=JSON.stringify(device),key=hashText(text);state.snapshotDevices=state.snapshotDevices||{};if(!state.snapshotDevices[key])state.snapshotDevices[key]=device;return key;}
export function resolveSnapshotDevice(snapshot){const device=state.snapshotDevices?.[snapshot?.deviceRef]||snapshot?.device;if(!device)throw new Error('Snapshot geometry is unavailable.');return device;}
export function internThumbnail(dataUrl){if(!dataUrl)return null;const key=hashText(dataUrl);state.snapshotThumbnails=state.snapshotThumbnails||{};if(!state.snapshotThumbnails[key])state.snapshotThumbnails[key]=dataUrl;return key;}
export function resolveSnapshotThumbnail(snapshot){return state.snapshotThumbnails?.[snapshot?.thumbRef]||snapshot?.thumb||null;}
export function pruneSnapshotDevices(){const used=new Set((state.snapshots||[]).map(snapshot=>snapshot.deviceRef).filter(Boolean));for(const key of Object.keys(state.snapshotDevices||{}))if(!used.has(key))delete state.snapshotDevices[key];const usedThumbs=new Set((state.snapshots||[]).map(snapshot=>snapshot.thumbRef).filter(Boolean));for(const key of Object.keys(state.snapshotThumbnails||{}))if(!usedThumbs.has(key))delete state.snapshotThumbnails[key];}
