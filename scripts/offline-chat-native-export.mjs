#!/usr/bin/env node
// Read-only project-to-geometry adapter for Python-based isolated visual inspection.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';

const parse = (args) => {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !['--project', '--output', '--three', '--roi'].includes(args[i]) ||
      args[i + 1] === undefined
    )
      throw Error(
        'Expected --project PATH --output DIRECTORY [--three true|false] [--roi xmin,ymin,xmax,ymax]',
      );
    options[args[i]] = args[i + 1];
  }
  if (!options['--project'] || !options['--output']) throw Error('Missing --project or --output');
  if (options['--three'] !== undefined && !['true', 'false'].includes(options['--three']))
    throw Error('--three must be true or false');
  return options;
};

export async function exportNativeModel({ projectPath, output, withThree = false, roi = null }) {
  // Loading the same polygon kernel as the regular Node science tests avoids a second geometry engine.
  const source = await readFile(
    new URL('../site/vendor/polygon-clipping.umd.js', import.meta.url),
    'utf8',
  );
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  globalThis.polygonClipping = module.exports;

  const { readProjectFile, MAX_PROJECT_FILE_BYTES } = await import('../site/project-io.js');
  const { surfaceGroups, sectionSlices } = await import('../site/model-view-geometry.js');
  const { drawShapeGeometry } = await import('../site/draw-mask-geometry.js');
  const { maskLocalToWorld, maskRoiWorldGeometry } = await import('../site/mask-roi-geometry.js');
  const filename = resolve(projectPath);
  const bytes = await readFile(filename);
  if (bytes.byteLength > MAX_PROJECT_FILE_BYTES)
    throw Error('Project exceeds native file-size limit');
  const project = await readProjectFile({
    size: bytes.byteLength,
    text: async () => bytes.toString('utf8'),
  });
  const model = project.model;
  let threeClip = null;
  let roiBounds = null;
  if (roi !== undefined && roi !== null) {
    if (!withThree) throw Error('The --roi option requires --three true');
    const values = typeof roi === 'string' ? roi.split(',').map(Number) : roi;
    if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite))
      throw Error('--roi must contain four finite numbers: xmin,ymin,xmax,ymax');
    const [xmin, ymin, xmax, ymax] = values;
    if (xmin >= xmax || ymin >= ymax) throw Error('ROI must have positive XY dimensions');
    // Reject an obviously nonintersecting ROI before the potentially expensive
    // native Boolean surface ownership pass (large M3D/array projects).
    const vertices = (model.boundary || []).flatMap((poly) => poly.flat());
    if (
      !vertices.length ||
      vertices.every(([x, y]) => x < xmin) ||
      vertices.every(([x, y]) => x > xmax) ||
      vertices.every(([x, y]) => y < ymin) ||
      vertices.every(([x, y]) => y > ymax)
    )
      throw Error('3D ROI does not overlap the wafer boundary');
    const { rectMulti } = await import('../site/vector-geometry.js');
    threeClip = rectMulti(xmax - xmin, ymax - ymin, (xmin + xmax) / 2, (ymin + ymax) / 2);
    roiBounds = { xmin, ymin, xmax, ymax };
  }
  const section = project.section || { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] };
  const transform = project.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const sourceMode = project.maskSourceMode === 'draw' ? 'draw' : 'file';
  const fileElements = [...(project.layout?.elements || []), ...(project.layout?.linework || [])]
    .filter((item) => ['polygon', 'path'].includes(item.kind))
    .map((item) => ({
      ...item,
      points: item.points.map((p) => maskLocalToWorld(p, transform)),
      width: item.kind === 'path' ? item.width * Math.abs(Number(transform.scale) || 1) : 0,
    }));
  const maskRoi = project.maskRoi
    ? maskRoiWorldGeometry(project.maskRoi, sourceMode === 'file' ? transform : {}, 96)
    : null;
  const result = {
    schema: 'wafercad-chat-native-geometry-v1',
    source: basename(filename),
    project: project.name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    model: {
      boundary: model.boundary,
      width: model.width,
      height: model.height,
      layers: model.layers,
    },
    activeFace: project.activeFace || 'front',
    section,
    surfaces: { front: surfaceGroups(model, 'front'), back: surfaceGroups(model, 'back') },
    slices: sectionSlices(model, section.a, section.b),
    mask: {
      source: sourceMode,
      selected: [...(project.selectedLayerKeys || [])],
      fileElements,
      drawGeometries: (project.drawMask?.shapes || []).map((item) => ({
        id: item.id,
        geom: drawShapeGeometry(item),
      })),
      roi: maskRoi,
      transform,
    },
  };
  let planSummary = null;
  let planJson = null;
  if (withThree) {
    const { buildRenderSurfacePlan } = await import('../site/renderer-geometry.js');
    const plan = buildRenderSurfacePlan(model, threeClip);
    // No implicit hundreds-of-thousands-of-surfaces rasterization on huge M3D projects.
    if (plan.caps.length + plan.sidewalls.length === 0)
      throw Error('No material surfaces intersect the requested 3D ROI');
    if (plan.caps.length + plan.sidewalls.length > 100_000)
      throw Error(
        `3D preview budget exceeded (${plan.caps.length} caps, ${plan.sidewalls.length} sidewalls); use ROI before attempting an offline full-scene diagnostic`,
      );
    planJson = JSON.stringify({ ...result, plan, threeRoiUm: roiBounds });
    planSummary = { caps: plan.caps.length, sidewalls: plan.sidewalls.length, roiUm: roiBounds };
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'native-model.json'), JSON.stringify(result));
  if (planJson) await writeFile(join(output, 'native-three.json'), planJson);
  return {
    file: filename,
    output: resolve(output),
    project: project.name,
    inputSha256: result.sha256,
    surfaces: { front: result.surfaces.front.length, back: result.surfaces.back.length },
    slices: result.slices.length,
    fileMaskElements: fileElements.length,
    drawMaskShapes: result.mask.drawGeometries.length,
    three: planSummary,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const o = parse(process.argv.slice(2));
  exportNativeModel({
    projectPath: o['--project'],
    output: o['--output'],
    withThree: o['--three'] === 'true',
    roi: o['--roi'] || null,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 1;
    });
}
