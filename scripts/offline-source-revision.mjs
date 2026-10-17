// Exact source provenance from an unpacked offline bundle or Git checkout.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

export function offlineSourceRevision(root) {
  const base = resolve(root);
  try {
    const manifest = JSON.parse(readFileSync(join(base, 'offline-source-manifest.json'), 'utf8'));
    if (manifest?.schema !== 'wafercad-offline-bundle-v1') throw Error('Unsupported offline source manifest');
    if (!/^[a-f0-9]{40}$/.test(manifest.revision) && manifest.revision !== 'unavailable') throw Error('Invalid manifest revision');
    return { commit: manifest.revision, sourceType: 'portable-offline-bundle', dirtyAtPackaging: Boolean(manifest.dirtyAtPackaging), manifest: true };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:base, encoding:'utf8', stdio:['ignore','pipe','ignore'],timeout:8000}).trim();
    const status = execFileSync('git', ['status', '--porcelain'], {cwd:base, encoding:'utf8', stdio:['ignore','pipe','ignore'],timeout:8000}).trim();
    return {commit, sourceType:'git-checkout', dirtyAtPackaging:Boolean(status), manifest:false};
  } catch {
    return {commit:'unavailable', sourceType:'unavailable', dirtyAtPackaging:true, manifest:false};
  }
}