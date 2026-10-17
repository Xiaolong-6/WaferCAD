#!/usr/bin/env node
// Native owned surface topology -> VTK diagnostic PNG. No local browser navigation.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadInput } from './offline-visual-kernel.mjs';
import { collectOwnedMesh } from './offline-three-mesh.mjs';
const here = dirname(fileURLToPath(import.meta.url));
function parse(argv) {
  const opts = {};
  const flags = new Set(['--mesh-only', '--no-borders']);
  for (let i=0;i<argv.length;i++) {
    const key = argv[i];
    if (!key.startsWith('--') || !['--mesh-only','--no-borders','--project','--fixture','--output','--width','--height','--z-exaggeration'].includes(key)) throw Error(`Unknown option ${key}`);
    if (flags.has(key)) opts[key] = true;
    else {
      if (!argv[i+1] || argv[i+1].startsWith('--')) throw Error(`Missing ${key} value`);
      opts[key] = argv[++i];
    }
  }
  return opts;
}
export async function captureThree(opts = {}) {
  const width = Number(opts['--width'] || 1100), height = Number(opts['--height'] || 760);
  const zExaggeration = Number(opts['--z-exaggeration'] || 1);
  if (!Number.isInteger(width) || width < 320 || width > 4096 || !Number.isInteger(height) || height < 320 || height > 4096 || !(zExaggeration > 0 && zExaggeration <= 1000)) throw Error('Invalid raster dimensions or Z exaggeration.');
  const input = await loadInput(opts);
  const THREE = await import('three');
  const [{ buildRenderSurfacePlan }, { triangulatePolygon }] = await Promise.all([
    import('../site/renderer-geometry.js'),
    import('../site/polygon-triangulation.js'),
  ]);
  const plan = buildRenderSurfacePlan(input.project.model);
  const mesh = collectOwnedMesh({ model: input.project.model, plan, triangulate: (poly) => triangulatePolygon(THREE, poly), borders: !opts['--no-borders'] });
  const output = resolve(opts['--output'] || 'test-results/offline-three');
  await mkdir(output, { recursive: true });
  const meshPath = join(output, 'three.mesh.json'), pngPath = join(output, 'three.png'), evidencePath = join(output, 'three.evidence.json');
  await writeFile(meshPath, `${JSON.stringify(mesh)}\n`);
  if (!opts['--mesh-only']) {
    execFileSync(process.env.WAFERCAD_PYTHON || 'python3', [join(here,'offline-three-vtk.py'), meshPath, pngPath, String(width), String(height), String(zExaggeration)], { timeout: 120000, stdio: 'inherit' });
  }
  let commit = 'unavailable';
  try { commit = execFileSync('git', ['rev-parse','HEAD'], {cwd:resolve(here,'..'),encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch {}
  const evidence = { schema:'wafercad-offline-three-p0', source:input.source, inputSha256:input.inputSha256, commit, renderer:opts['--mesh-only']?'geometry-only':'VTK-offscreen-native-owned-mesh', nativeGeometryOwner:'buildRenderSurfacePlan', triangleOwner:'triangulatePolygon', zExaggeration, resolution:{width,height}, ...mesh.evidence, acceptanceScope:'Read-only geometry preview only. Not WaferCAD Three.js screenshot/LOD or rough shader validation.' };
  await writeFile(evidencePath, `${JSON.stringify(evidence,null,2)}\n`);
  return { meshPath, pngPath: opts['--mesh-only'] ? null : pngPath, evidencePath, evidence };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) captureThree(parse(process.argv.slice(2))).then(({meshPath,pngPath,evidencePath})=>console.log(JSON.stringify({meshPath,pngPath,evidencePath}))).catch((error)=>{console.error(error.stack||String(error));process.exitCode=1;});