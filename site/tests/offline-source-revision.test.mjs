import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineSourceRevision } from '../../scripts/offline-source-revision.mjs';
const create = () => mkdtempSync(join(tmpdir(),'wafercad-revision-'));
test('Portable bundle carries original Git revision without .git or network',()=>{
  const dir=create();
  try {
    const commit='e'.repeat(40);
    writeFileSync(join(dir,'offline-source-manifest.json'),JSON.stringify({schema:'wafercad-offline-bundle-v1',revision:commit,dirtyAtPackaging:false}));
    assert.deepEqual(offlineSourceRevision(dir),{commit,sourceType:'portable-offline-bundle',dirtyAtPackaging:false,manifest:true});
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('Malformed source revision fails closed',()=>{
  const dir=create();
  try {
    writeFileSync(join(dir,'offline-source-manifest.json'),JSON.stringify({schema:'wafercad-offline-bundle-v1',revision:'wrong'}));
    assert.throws(()=>offlineSourceRevision(dir),/Invalid manifest revision/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});