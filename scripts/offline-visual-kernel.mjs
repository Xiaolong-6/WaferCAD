#!/usr/bin/env node
// Offline, read-only WaferCAD scientific image export. No localhost navigation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineSourceRevision } from './offline-source-revision.mjs';
import { loadGeometryKernel, processBenchmark } from './process-benchmarks.mjs';
import { renderMainSvg, renderSectionSvg } from './offline-visual-svg.mjs';
import { renderMaskSvg } from './offline-mask-svg.mjs';

function options(argv) {
  const flags = new Set(['--svg-only', '--no-borders']);
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw Error(`Unknown argument: ${flag}`);
    if (flags.has(flag)) result[flag] = true;
    else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw Error(`Missing value for ${flag}`);
      result[flag] = argv[++i];
    }
  }
  for (const key of Object.keys(result)) if (!['--project', '--fixture', '--view', '--output', '--width', '--height', '--face', '--scale', '--svg-only', '--no-borders', '--mask-source', '--mask-opacity'].includes(key)) throw Error(`Unknown option: ${key}`);
  return result;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function loadInput(settings) {
  await loadGeometryKernel();
  if (settings['--fixture']) {
    if (settings['--project']) throw Error('Specify either --fixture or --project.');
    if (settings['--fixture'] !== 'step') throw Error('Only the native step fixture is available.');
    const fixture = await processBenchmark('step', 'direct');
    return { project: { name: 'WaferCAD native step fixture', model: fixture.model, section: fixture.section }, inputSha256: null, source: 'native-process-benchmark:step' };
  }
  if (!settings['--project']) throw Error('Missing --project <path> or --fixture step.');
  const path = resolve(settings['--project']);
  const bytes = await readFile(path);
  const { readProjectFile, MAX_PROJECT_FILE_BYTES } = await import('../site/project-io.js');
  if (bytes.length > MAX_PROJECT_FILE_BYTES) throw Error('Project exceeds size safety limit.');
  const project = await readProjectFile({ size: bytes.length, text: async () => bytes.toString('utf8') });
  return { project, inputSha256: hash(bytes), source: basename(path) };
}
async function pngFromSvg(svg, pngPath, width, height) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WAFERCAD_CHROMIUM || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    // Intentionally use about:blank and inline SVG. Never navigate to file:// or localhost.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;background:white}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.locator('svg').screenshot({ path: pngPath, animations: 'disabled' });
  } finally { await browser.close(); }
}
export async function run(settings) {
  const view = settings['--view'] || 'section';
  if (!['section', 'main', 'mask'].includes(view)) throw Error('Offline visual kernel supports --view main|section|mask.');
  const width = Number(settings['--width'] || 1100), height = Number(settings['--height'] || 760);
  const out = resolve(settings['--output'] || 'test-results/offline-visual');
  const { project, inputSha256, source } = await loadInput(settings);
  if (!project?.model) throw Error('Project has no canonical model.');
  const { sectionSlices, surfaceGroups } = await import('../site/model-view-geometry.js');
  const borders = !settings['--no-borders'];
  const sectionA = project.section?.a || [-project.model.width * .42, 0];
  const sectionB = project.section?.b || [project.model.width * .42, 0];
  let data;
  if (view === 'main') {
    data = renderMainSvg({ model: project.model, patches: surfaceGroups(project.model, settings['--face'] || project.activeFace || 'front'), title: `${project.name || source} / Main`, width, height, face: settings['--face'] || project.activeFace || 'front', borders });
  } else if (view === 'section') {
    data = renderSectionSvg({ model: project.model, slices: sectionSlices(project.model, sectionA, sectionB), a: sectionA, b: sectionB, title: `${project.name || source} / Section`, width, height, scaleMode: settings['--scale'] || 'auto', borders });
  } else {
    const [{ maskLocalToWorld, maskRoiWorldGeometry }, { drawShapeGeometry }] = await Promise.all([
      import('../site/mask-roi-geometry.js'),
      import('../site/draw-mask-geometry.js'),
    ]);
    const maskSource = settings['--mask-source'] || project.maskSourceMode || 'file';
    const transform = project.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
    const selected = new Set(project.selectedLayerKeys || []);
    const fileElements = [...(project.layout?.linework || []), ...(project.layout?.elements || [])]
      .filter(item => item.kind === 'polygon' || item.kind === 'path')
      .map(item => ({ ...item, points: item.points.map(p => maskLocalToWorld(p, transform)),
        width: item.kind === 'path' ? item.width * Math.abs(Number(transform.scale) || 1) : 0,
        selected: selected.has(`${item.layer}|${item.datatype}`) }));
    const drawGeometries = (project.drawMask?.shapes || []).map(shape => ({ id: shape.id, geom: drawShapeGeometry(shape) }));
    const roiTransform = maskSource === 'file' ? transform : { x: 0, y: 0, scale: 1, rotation: 0 };
    const roiGeometry = project.maskRoi ? maskRoiWorldGeometry(project.maskRoi, roiTransform, 96) : null;
    const activeFace = settings['--face'] || project.activeFace || 'front';
    const opacity = settings['--mask-opacity'] === undefined ? Number(project.maskOpacity ?? 0.65) : Number(settings['--mask-opacity']);
    data = renderMaskSvg({model: project.model, fileElements, drawGeometries, source: maskSource,
      referencePatches: borders ? surfaceGroups(project.model, activeFace) : [], roiGeometry,
      face: activeFace, opacity, width, height, title: `${project.name || source} / Mask`});
    data.evidence.maskTransform = maskSource === 'file' ? transform : null;
  }
  await mkdir(out, { recursive: true });
  const svgPath = join(out, `${view}.svg`), pngPath = join(out, `${view}.png`), evidencePath = join(out, `${view}.evidence.json`);
  const evidence = { schema: 'wafercad-offline-visual-p0', source, inputSha256, ...offlineSourceRevision(fileURLToPath(new URL('..', import.meta.url))), width, height, borders, ...data.evidence, captureMethod: settings['--svg-only'] ? 'svg' : 'svg-inline-chromium-png', renderingScope: 'scientific geometry inspection, not native UI/Three pixel acceptance' };
  await writeFile(svgPath, data.svg, 'utf8');
  if (!settings['--svg-only']) await pngFromSvg(data.svg, pngPath, width, height);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { svgPath, pngPath: settings['--svg-only'] ? null : pngPath, evidencePath, evidence };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(options(process.argv.slice(2))).then(({ svgPath, pngPath, evidencePath }) => console.log(JSON.stringify({ svgPath, pngPath, evidencePath }))).catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}