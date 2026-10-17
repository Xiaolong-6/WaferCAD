#!/usr/bin/env node
// Read-only project-to-geometry adapter for Python-based isolated visual inspection.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';

const parse = (args) => {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project', '--output', '--three'].includes(args[i]) || args[i + 1] === undefined)
      throw Error('Expected --project PATH --output DIRECTORY [--three true|false]');
    options[args[i]] = args[i + 1];
  }
  if (!options['--project'] || !options['--output']) throw Error('Missing --project or --output');
  if (options['--three'] !== undefined && !['true', 'false'].includes(options['--three']))
    throw Error('--three must be true or false');
  return options;
};

export async function exportNativeModel({ projectPath, output, withThree = false }) {
  // Loading the same polygon kernel as the regular Node science tests avoids a second geometry engine.
  const source = await readFile(new URL('../site/vendor/polygon-clipping.umd.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  globalThis.polygonClipping = module.exports;

  const { readProjectFile, MAX_PROJECT_FILE_BYTES } = await import('../site/project-io.js');
  const { surfaceGroups, sectionSlices } = await import('../site/model-view-geometry.js');
  const { drawShapeGeometry } = await import('../site/draw-mask-geometry.js');
  const { maskLocalToWorld, maskRoiWorldGeometry } = await import('../site/mask-roi-geometry.js');
  const filename = resolve(projectPath);
  const bytes = await readFile(filename);
  if (bytes.byteLength > MAX_PROJECT_FILE_BYTES) throw Error('Project exceeds native file-size limit');
  const project = await readProjectFile({ size: bytes.byteLength, text: async () => bytes.toString('utf8') });
  const model = project.model;
  const section = project.section || { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] };
  const transform = project.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const sourceMode = project.maskSourceMode === 'draw' ? 'draw' : 'file';
  const fileElements = [...(project.layout?.elements || []), ...(project.layout?.linework || [])]
    .filter((item) => ['polygon', 'path'].includes(item.kind))
    .map((item) => ({ ...item, points: item.points.map((p) => maskLocalToWorld(p, transform)),
      width: item.kind === 'path' ? item.width * Math.abs(Number(transform.scale) || 1) : 0 }));
  const maskRoi = project.maskRoi
    ? maskRoiWorldGeometry(project.maskRoi, sourceMode === 'file' ? transform : {}, 96)
    : null;
  const result = {
    schema: 'wafercad-chat-native-geometry-v1',
    source: basename(filename),
    project: project.name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    model: { boundary: model.boundary, width: model.width, height: model.height, layers: model.layers },
    activeFace: project.activeFace || 'front',
    section,
    surfaces: { front: surfaceGroups(model, 'front'), back: surfaceGroups(model, 'back') },
    slices: sectionSlices(model, section.a, section.b),
    mask: {
      source: sourceMode,
      selected: [...(project.selectedLayerKeys || [])],
      fileElements,
      drawGeometries: (project.drawMask?.shapes || []).map((item) => ({ id: item.id, geom: drawShapeGeometry(item) })),
      roi: maskRoi,
      transform,
    },
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'native-model.json'), JSON.stringify(result));
  let planSummary = null;
  if (withThree) {
    const { buildRenderSurfacePlan } = await import('../site/renderer-geometry.js');
    const plan = buildRenderSurfacePlan(model);
    // No implicit hundreds-of-thousands-of-surfaces rasterization on huge M3D projects.
    if (plan.caps.length + plan.sidewalls.length > 100_000)
      throw Error(`3D preview budget exceeded (${plan.caps.length} caps, ${plan.sidewalls.length} sidewalls); use ROI before attempting an offline full-scene diagnostic`);
    await writeFile(join(output, 'native-three.json'), JSON.stringify({ ...result, plan }));
    planSummary = { caps: plan.caps.length, sidewalls: plan.sidewalls.length };
  }
  return { file: filename, output: resolve(output), project: project.name,
    inputSha256: result.sha256, surfaces: { front: result.surfaces.front.length, back: result.surfaces.back.length },
    slices: result.slices.length, fileMaskElements: fileElements.length, drawMaskShapes: result.mask.drawGeometries.length,
    three: planSummary };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const o = parse(process.argv.slice(2));
  exportNativeModel({ projectPath: o['--project'], output: o['--output'], withThree: o['--three'] === 'true' })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}