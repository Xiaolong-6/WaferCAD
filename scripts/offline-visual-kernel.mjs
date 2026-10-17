#!/usr/bin/env node
// Offline, read-only WaferCAD scientific image export. No localhost navigation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadGeometryKernel, processBenchmark } from './process-benchmarks.mjs';
import { renderMainSvg, renderSectionSvg } from './offline-visual-svg.mjs';

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
  for (const key of Object.keys(result)) if (!['--project', '--fixture', '--view', '--output', '--width', '--height', '--face', '--scale', '--svg-only', '--no-borders'].includes(key)) throw Error(`Unknown option: ${key}`);
  return result;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = () => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unavailable'; }
};
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
  if (!['section', 'main'].includes(view)) throw Error('P0 supports --view main|section only. UI, Mask and native 3D are not implemented.');
  const width = Number(settings['--width'] || 1100), height = Number(settings['--height'] || 760);
  const out = resolve(settings['--output'] || 'test-results/offline-visual');
  const { project, inputSha256, source } = await loadInput(settings);
  if (!project?.model) throw Error('Project has no canonical model.');
  const { sectionSlices, surfaceGroups } = await import('../site/model-view-geometry.js');
  const borders = !settings['--no-borders'];
  const sectionA = project.section?.a || [-project.model.width * .42, 0];
  const sectionB = project.section?.b || [project.model.width * .42, 0];
  const data = view === 'main'
    ? renderMainSvg({ model: project.model, patches: surfaceGroups(project.model, settings['--face'] || project.activeFace || 'front'), title: `${project.name || source} / Main`, width, height, face: settings['--face'] || project.activeFace || 'front', borders })
    : renderSectionSvg({ model: project.model, slices: sectionSlices(project.model, sectionA, sectionB), a: sectionA, b: sectionB, title: `${project.name || source} / Section`, width, height, scaleMode: settings['--scale'] || 'auto', borders });
  await mkdir(out, { recursive: true });
  const svgPath = join(out, `${view}.svg`), pngPath = join(out, `${view}.png`), evidencePath = join(out, `${view}.evidence.json`);
  const evidence = { schema: 'wafercad-offline-visual-p0', source, inputSha256, commit: sha(), width, height, borders, ...data.evidence, captureMethod: settings['--svg-only'] ? 'svg' : 'svg-inline-chromium-png', renderingScope: 'scientific geometry inspection, not native UI/Three pixel acceptance' };
  await writeFile(svgPath, data.svg, 'utf8');
  if (!settings['--svg-only']) await pngFromSvg(data.svg, pngPath, width, height);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { svgPath, pngPath: settings['--svg-only'] ? null : pngPath, evidencePath, evidence };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(options(process.argv.slice(2))).then(({ svgPath, pngPath, evidencePath }) => console.log(JSON.stringify({ svgPath, pngPath, evidencePath }))).catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
}