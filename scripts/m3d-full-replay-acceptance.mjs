import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import { newUiContext, waitForAppReady, waitForThreeReady } from './test-helpers/ui.mjs';
import {
  closeFunctionPanel,
  ensurePrimaryViewVisible,
  openFunctionPanel,
} from './test-helpers/product.mjs';
import {
  exportCurrentProject,
  loadProject,
} from './test-helpers/product-scientific.mjs';

await loadGeometryKernel();
const { createModel } = await import('../site/model.js');
const { pointInMulti } = await import('../site/vector-geometry.js');
const { serializeProject, readProjectFile } = await import('../site/project-io.js');
const { validateProjectFile } = await import('../site/project-schema.js');

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateDir = join(repoRoot, 'examples/projects/m3d-selfpowered-2026-candidate');
const resultDir = join(repoRoot, 'test-results/m3d/full-replay');
const maskDir = join(resultDir, 'masks_gds');
const repoOut = join(repoRoot, 'examples/projects/m3d-selfpowered-2026-replay');
await mkdir(maskDir, { recursive: true });
await mkdir(resultDir, { recursive: true });
if (process.argv.includes('--write-repo')) await mkdir(repoOut, { recursive: true });

function rec(t, d, payload = Buffer.alloc(0)) {
  if (payload.length % 2) payload = Buffer.concat([payload, Buffer.alloc(1)]);
  const h = Buffer.alloc(4);
  h.writeUInt16BE(payload.length + 4);
  h[2] = t;
  h[3] = d;
  return Buffer.concat([h, payload]);
}
function i16(v) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(v);
  return b;
}
function real(v) {
  const b = Buffer.alloc(8);
  let e = 64;
  while (v >= 1) {
    v /= 16;
    e++;
  }
  while (v < 1 / 16) {
    v *= 16;
    e--;
  }
  b[0] = e;
  for (let i = 1; i < 8; i++) {
    v *= 256;
    b[i] = Math.floor(v);
    v -= b[i];
  }
  return b;
}
function gds(name, rects) {
  const c = [
    rec(0, 2, i16(600)),
    rec(1, 2, Buffer.alloc(24)),
    rec(2, 6, Buffer.from('M3D_REPLAY_V2')),
    rec(3, 5, Buffer.concat([real(0.001), real(1e-9)])),
    rec(5, 2, Buffer.alloc(24)),
    rec(6, 6, Buffer.from(name.substring(0, 32))),
  ];
  for (const [x, y, w, h] of rects) {
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ];
    const xy = Buffer.alloc(40);
    pts.flat().forEach((n, i) => xy.writeInt32BE(Math.round(n * 1000), i * 4));
    c.push(
      rec(8, 0),
      rec(13, 2, i16(1)),
      rec(14, 2, i16(0)),
      rec(16, 3, xy),
      rec(17, 0),
    );
  }
  c.push(rec(7, 0), rec(4, 0));
  return Buffer.concat(c);
}
function svgRects(svg) {
  return [...svg.matchAll(/<rect\s([^>]+)>?/g)].map((m) => {
    const a = Object.fromEntries(
      [...m[1].matchAll(/([\w]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]),
    );
    return [Number(a.x), Number(a.y), Number(a.width), Number(a.height)];
  });
}
async function makeMask(file) {
  const svg = await readFile(join(candidateDir, 'masks', file), 'utf8');
  const isPvm = file.startsWith('PVM_');
  const dx = isPvm ? -30 : 2;
  const dy = isPvm ? -15 : -9;
  const rects = svgRects(svg).map(([x, y, w, h]) => [x + dx, y + dy, w, h]);
  const out = file.replace(/\.svg$/, '.gds');
  await writeFile(join(maskDir, out), gds(out, rects));
  return { out, rects };
}

const maskNames = [
  'PVM_M01_Si_channel_etch.svg',
  'PVM_M02_Cr_contact.svg',
  'PVM_M03_Pt_contact.svg',
  'M3D_M04_power_rail.svg',
  'M3D_M05_power_via_open_ILD1.svg',
  'M3D_M06_local_back_gate.svg',
  'M3D_M07_HfO2_open.svg',
  'M3D_M08_WSe2_channel.svg',
  'M3D_M09_WSe2_SD.svg',
  'M3D_M10_WSe2_cap.svg',
  'M3D_M11_MoS2_channel.svg',
  'M3D_M12_MoS2_SD_bridge.svg',
  'M3D_M13_ILD2_data_power_via_open.svg',
  'M3D_M14_graphene_channel.svg',
  'M3D_M15_graphene_SD_via_connect.svg',
  'M3D_M16_final_cap_open_sensing_windows.svg',
];
const masks = new Map();
for (const name of maskNames) masks.set(name, await makeMask(name));
await writeFile(join(maskDir, 'M3D_FIELD.gds'), gds('M3D_FIELD', [[2, -9, 28, 18]]));

const stages = [
  { name: '01_PVM_Si', mask: 'PVM_M01_Si_channel_etch.svg', section: [-30, 0, 0, 0], ops: [{ kind: 'etch', target: 'SOI B-doped Si 70nm', z: 0.07, area: 'mask' }] },
  { name: '02_PVM_Cr', mask: 'PVM_M02_Cr_contact.svg', section: [-30, 0, 0, 0], ops: [{ kind: 'add', name: 'S02 Cr 20nm', z: 0.02, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S02 Au 50nm', z: 0.05, coverage: 'direct', area: 'mask' }] },
  { name: '03_PVM_Pt', mask: 'PVM_M03_Pt_contact.svg', section: [-30, 0, 0, 0], ops: [{ kind: 'add', name: 'S03 Pt 80nm', z: 0.08, coverage: 'direct', area: 'mask' }] },
  { name: '04_Power_Rails', mask: 'M3D_M04_power_rail.svg', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S04 Pt power rails 70nm', z: 0.07, coverage: 'direct', area: 'mask' }] },
  { name: '05_ILD1', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S05 ILD1 Al2O3 100nm', z: 0.1, coverage: 'conformal', area: 'full' }] },
  { name: '06_Power_Via_Open', mask: 'M3D_M05_power_via_open_ILD1.svg', section: [16, -9, 16, 9], ops: [{ kind: 'etch', target: 'S05 ILD1 Al2O3 100nm', z: 0.1, area: 'mask' }] },
  { name: '07_Power_Via_Fill', mask: 'M3D_M05_power_via_open_ILD1.svg', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S07 Ti power via 120nm', z: 0.12, coverage: 'direct', area: 'mask' }] },
  { name: '08_Back_Gates', mask: 'M3D_M06_local_back_gate.svg', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'add', name: 'S08 Ti back gate 2nm', z: 0.002, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S08 Pt back gate 18nm', z: 0.018, coverage: 'direct', area: 'mask' }] },
  { name: '09_HfO2', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'add', name: 'S09 HfO2 gate dielectric 10nm', z: 0.01, coverage: 'conformal', area: 'full' }] },
  { name: '10_HfO2_Open', mask: 'M3D_M07_HfO2_open.svg', section: [16, -9, 16, 9], ops: [{ kind: 'etch', target: 'S09 HfO2 gate dielectric 10nm', z: 0.01, area: 'mask' }] },
  { name: '11_WSe2_Transfer', field: true, section: [2, 2.65, 30, 2.65], ops: [{ kind: 'add', name: 'S11 WSe2 bilayer 1.4nm', z: 0.0014, coverage: 'transfer', transferMode: 'follow', area: 'mask' }] },
  { name: '12_WSe2_Pattern', mask: 'M3D_M08_WSe2_channel.svg', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'etch', target: 'S11 WSe2 bilayer 1.4nm', z: 0.0014, area: 'invert' }] },
  { name: '13_WSe2_SD', mask: 'M3D_M09_WSe2_SD.svg', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'add', name: 'S13 Pd WSe2 SD 10nm', z: 0.01, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S13 Pt WSe2 SD 30nm', z: 0.03, coverage: 'direct', area: 'mask' }] },
  { name: '14_WSe2_Anneal', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'record' }] },
  { name: '15_WSe2_Cap', mask: 'M3D_M10_WSe2_cap.svg', section: [2, 2.65, 30, 2.65], ops: [{ kind: 'add', name: 'S15 Al2O3 WSe2 cap 20nm', z: 0.02, coverage: 'conformal', area: 'mask' }] },
  { name: '16_MoS2_Transfer', field: true, section: [2, -2.45, 30, -2.45], ops: [{ kind: 'add', name: 'S16 MoS2 monolayer 0.7nm', z: 0.0007, coverage: 'transfer', transferMode: 'follow', area: 'mask' }] },
  { name: '17_MoS2_Pattern', mask: 'M3D_M11_MoS2_channel.svg', section: [2, -2.45, 30, -2.45], ops: [{ kind: 'etch', target: 'S16 MoS2 monolayer 0.7nm', z: 0.0007, area: 'invert' }] },
  { name: '18_MoS2_SD_Bridge', mask: 'M3D_M12_MoS2_SD_bridge.svg', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S18 Ni MoS2 SD bridge 30nm', z: 0.03, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S18 Au MoS2 SD bridge 10nm', z: 0.01, coverage: 'direct', area: 'mask' }] },
  { name: '19_ILD2', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S19 ILD2 Al2O3 50nm', z: 0.05, coverage: 'conformal', area: 'full' }] },
  { name: '20_Data_Power_Via_Open', mask: 'M3D_M13_ILD2_data_power_via_open.svg', section: [16, -9, 16, 9], ops: [{ kind: 'etch', target: 'S19 ILD2 Al2O3 50nm', z: 0.05, area: 'mask' }] },
  { name: '21_Via2_Fill', mask: 'M3D_M13_ILD2_data_power_via_open.svg', section: [16, -9, 16, 9], ops: [{ kind: 'add', name: 'S21 Ti via2 2nm', z: 0.002, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S21 Ni via2 28nm', z: 0.028, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S21 Au via2 30nm', z: 0.03, coverage: 'direct', area: 'mask' }] },
  { name: '22_Graphene_Transfer', field: true, section: [2, -0.125, 30, -0.125], ops: [{ kind: 'add', name: 'S22 Graphene monolayer 0.3nm', z: 0.0003, coverage: 'transfer', transferMode: 'follow', area: 'mask' }] },
  { name: '23_Graphene_Pattern', mask: 'M3D_M14_graphene_channel.svg', section: [2, -0.125, 30, -0.125], ops: [{ kind: 'etch', target: 'S22 Graphene monolayer 0.3nm', z: 0.0003, area: 'invert' }] },
  { name: '24_Graphene_SD', mask: 'M3D_M15_graphene_SD_via_connect.svg', section: [2, -0.125, 30, -0.125], ops: [{ kind: 'add', name: 'S24 Ti graphene SD 2nm', z: 0.002, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S24 Ni graphene SD 28nm', z: 0.028, coverage: 'direct', area: 'mask' }, { kind: 'add', name: 'S24 Au graphene SD 30nm', z: 0.03, coverage: 'direct', area: 'mask' }] },
  { name: '25_Final_Al2O3', section: [2, -0.125, 30, -0.125], ops: [{ kind: 'add', name: 'S25 Al2O3 final cap 70nm', z: 0.07, coverage: 'conformal', area: 'full' }] },
  { name: '26_Final_Sensing_Windows', mask: 'M3D_M16_final_cap_open_sensing_windows.svg', section: [2, -0.125, 30, -0.125], ops: [{ kind: 'etch', target: 'S25 Al2O3 final cap 70nm', z: 0.07, area: 'mask' }] },
];

const base = createModel({ shape: 'rect', width: 60, height: 30, thickness: 1 });
const seed = projectForBenchmark({ model: base, section: { a: [-29, 0], b: [29, 0] } });
seed.name = 'M3D self-powered heterogeneous IC full replay seed';
seed.maskSourceMode = 'file';
seed.snapshots = [];

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}
function assertTransferZeroGap(model, layerName) {
  const layer = model.layers.find((item) => item.name === layerName);
  assert.ok(layer, 'Missing transfer layer ' + layerName);
  let films = 0;
  for (const region of model.regions) {
    const index = region.stack.findIndex((segment) => segment.layerId === layer.id);
    if (index < 0) continue;
    films++;
    assert.ok(index > 0, layerName + ': unsupported transfer segment');
    const film = region.stack[index];
    const below = region.stack[index - 1];
    assert.ok(
      Math.abs(film.z0 - below.z1) <= 1e-7,
      layerName + ': air gap ' + (film.z0 - below.z1),
    );
  }
  assert.ok(films > 0, layerName + ': no transferred film found');
}
function maskCenter(file, index = 0) {
  const item = masks.get(file);
  assert.ok(item?.rects?.length, 'Missing mask rectangles for ' + file);
  const [x, y, w, h] = item.rects[index];
  return [x + w / 2, y + h / 2];
}

const browser = await chromium.launch({
  headless: process.env.WAFERCAD_HEADFUL !== '1',
  ...(process.env.WAFERCAD_CHROMIUM
    ? { executablePath: process.env.WAFERCAD_CHROMIUM }
    : {}),
  args: [
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
const context = await newUiContext(browser, {
  viewport: { width: 1800, height: 1200 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

async function importMask(stage) {
  const file = stage.field ? 'M3D_FIELD.gds' : masks.get(stage.mask)?.out;
  if (!file) return;
  await openFunctionPanel(page, 'mask', { timeout: 30000 });
  await page.locator('#gdsInput').setInputFiles(join(maskDir, file));
  await page.waitForFunction(
    (name) => document.getElementById('maskSummary')?.textContent?.includes(name),
    file,
    { timeout: 30000 },
  );
  await closeFunctionPanel(page);
}
async function setSection(coords) {
  for (const [i, id] of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'].entries()) {
    const input = page.locator('#' + id);
    await input.fill(String(coords[i]));
    await input.press('Tab');
  }
}
async function applyOp(op) {
  await openFunctionPanel(page, 'process', { timeout: 30000 });
  await page
    .locator('[data-process-mode="' + (op.kind === 'record' ? 'record' : op.kind) + '"]')
    .click();
  const beforeCount = await page.locator('.history-step-wrap').count();
  const beforeStatus = await page.locator('#statusText').textContent();
  if (op.kind === 'record') {
    await page.locator('#recordProcessType').selectOption('anneal');
    await page.locator('#recordProcessLabel').fill('S14 WSe2 NO anneal');
    await page.locator('#recordTemperature').fill('100');
    await page.locator('#recordDuration').fill('30');
    await page.locator('#recordAmbient').fill('NO');
    await page
      .locator('#recordNote')
      .fill('Paper recipe: 100 C, 30 min. Metadata only; no geometry change.');
  } else {
    await page.locator('#operationArea').selectOption(op.area);
    await page.locator('#operationThickness').fill(String(op.z));
    if (op.kind === 'add') {
      await page.locator('#layerName').fill(op.name);
      await page.locator('#growthMode').selectOption(op.coverage);
      if (op.coverage === 'transfer') {
        await page.locator('#transferMode').selectOption(op.transferMode || 'follow');
      }
    } else {
      await page.locator('#etchProfile').selectOption('directional');
      await page.locator('#etchSurfaceMode').selectOption('smooth');
      await page.locator('#etchTargetLayer').selectOption({ label: op.target });
    }
  }
  const started = performance.now();
  await page.locator('#applyOperationBtn').click({ noWaitAfter: true, timeout: 300000 });
  await page.waitForFunction(
    ({ beforeCount, beforeStatus }) => {
      const button = document.getElementById('applyOperationBtn');
      const status = document.getElementById('statusText')?.textContent || '';
      const count = document.querySelectorAll('.history-step-wrap').length;
      return !button?.disabled && count > beforeCount && status !== beforeStatus;
    },
    { beforeCount, beforeStatus },
    { timeout: 300000 },
  );
  const status = await page.locator('#statusText').textContent();
  assert.match(status || '', /^(Deposited|Transferred|Etched|Recorded|Extended|Planarized)/);
  await closeFunctionPanel(page);
  return { status, seconds: (performance.now() - started) / 1000 };
}
async function bookmark(name) {
  await openFunctionPanel(page, 'snapshots', { timeout: 30000 });
  const step = page.locator('.history-step-wrap').last();
  await step.locator('.snapshot-more-trigger').click();
  await step.locator('.snapshot-more-popover button', { hasText: 'Add bookmark' }).click();
  const group = step.locator('.history-bookmarks-group');
  if ((await group.getAttribute('open')) == null) {
    await group.locator('.history-bookmarks-summary').click();
  }
  const row = step.locator('.history-bookmark-row').last();
  await row.locator('.snapshot-more-trigger').click();
  await row.locator('.snapshot-more-popover button', { hasText: 'Rename bookmark' }).click();
  const input = row.locator('input[aria-label="Bookmark name"]');
  await input.fill(name);
  await input.press('Enter');
  await closeFunctionPanel(page);
}
async function capture(name) {
  await closeFunctionPanel(page);
  if (await page.locator('#mainZoomFit').isVisible()) await page.locator('#mainZoomFit').click();
  if (await page.locator('#fit3dBtn').isVisible()) await page.locator('#fit3dBtn').click();
  await page.screenshot({
    path: join(resultDir, name + '.png'),
    fullPage: true,
    animations: 'disabled',
  });
}
async function saveCurrent(name) {
  const project = await exportCurrentProject(page, 300000);
  validateProjectFile(project);
  const text = serializeProject(project);
  await writeFile(join(resultDir, name + '.wafercad'), text);
  return project;
}

const timings = [];
const stageChecks = [];
let finalProject;
try {
  await page.goto((process.env.WAFERCAD_URL || 'http://127.0.0.1:4173') + '/app.html', {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppReady(page);
  await loadProject(page, seed, 'm3d-full-replay-seed');

  for (const op of [
    { kind: 'add', name: 'SOI BOX SiO2 2um', z: 2, coverage: 'direct', area: 'full' },
    { kind: 'add', name: 'SOI B-doped Si 70nm', z: 0.07, coverage: 'direct', area: 'full' },
  ]) {
    timings.push({ stage: '00_SOI', ...(await applyOp(op)) });
  }
  await bookmark('00_SOI');
  await capture('00_SOI');
  await saveCurrent('00_SOI');

  for (const stage of stages) {
    if (stage.mask || stage.field) await importMask(stage);
    await setSection(stage.section);
    const stageTiming = [];
    for (const op of stage.ops) stageTiming.push(await applyOp(op));
    await bookmark(stage.name);
    const project = await saveCurrent(stage.name);
    await capture(stage.name);
    timings.push(...stageTiming.map((entry) => ({ stage: stage.name, ...entry })));

    if (stage.name === '11_WSe2_Transfer') {
      assertTransferZeroGap(project.model, 'S11 WSe2 bilayer 1.4nm');
    }
    if (stage.name === '16_MoS2_Transfer') {
      assertTransferZeroGap(project.model, 'S16 MoS2 monolayer 0.7nm');
    }
    if (stage.name === '22_Graphene_Transfer') {
      assertTransferZeroGap(project.model, 'S22 Graphene monolayer 0.3nm');
    }
    if (stage.name === '25_Final_Al2O3') {
      assert.ok(
        project.model.layers.some((layer) => layer.name === 'S25 Al2O3 final cap 70nm'),
      );
    }
    if (stage.name === '26_Final_Sensing_Windows') finalProject = project;
    stageChecks.push({ stage: stage.name, ok: true });
  }

  assert.deepEqual(pageErrors, []);
  assert.ok(finalProject, 'Final project was not exported');
  validateProjectFile(finalProject);
  assert.equal(finalProject.snapshots.length, 27, 'Expected 27 named bookmarks from 00 to 26');

  const finalCap = finalProject.model.layers.find(
    (layer) => layer.name === 'S25 Al2O3 final cap 70nm',
  );
  const graphene = finalProject.model.layers.find(
    (layer) => layer.name === 'S22 Graphene monolayer 0.3nm',
  );
  assert.ok(finalCap && graphene);

  for (let index = 0; index < 2; index++) {
    const p = maskCenter('M3D_M16_final_cap_open_sensing_windows.svg', index);
    const region = regionAt(finalProject.model, p);
    assert.ok(region, 'No material owner at sensing-window point ' + JSON.stringify(p));
    assert.ok(
      !region.stack.some((segment) => segment.layerId === finalCap.id),
      'Final cap remains in sensing window ' + JSON.stringify(p),
    );
    assert.ok(
      region.stack.some((segment) => segment.layerId === graphene.id),
      'Graphene missing in sensing window ' + JSON.stringify(p),
    );
  }

  await ensurePrimaryViewVisible(page, 'main');
  await page
    .locator('#mainPanel')
    .screenshot({ path: join(resultDir, 'final_Main.png'), animations: 'disabled' });
  await ensurePrimaryViewVisible(page, 'three');
  await waitForThreeReady(page, 300000);
  if (await page.locator('#fit3dBtn').isVisible()) await page.locator('#fit3dBtn').click();
  await page
    .locator('#threePanel')
    .screenshot({ path: join(resultDir, 'final_3D.png'), animations: 'disabled' });
  if (await page.locator('#sectionPanel').isVisible()) {
    await page
      .locator('#sectionPanel')
      .screenshot({ path: join(resultDir, 'final_Section.png'), animations: 'disabled' });
  }
  await page.screenshot({
    path: join(resultDir, 'final_overview.png'),
    fullPage: true,
    animations: 'disabled',
  });
} finally {
  await browser.close();
}

const finalText = serializeProject(finalProject);
const reopened = await readProjectFile({
  size: Buffer.byteLength(finalText),
  text: async () => finalText,
});
validateProjectFile(reopened);
assert.deepEqual(reopened.model, finalProject.model);
assert.equal(reopened.snapshots.length, 27);

const validation = {
  pass: true,
  branch: 'test/m3d-full-replay-20261008',
  modeledFieldUm: [60, 30],
  bookmarks: finalProject.snapshots.length,
  processNodes: finalProject.snapshotBranches?.nodes?.length || 0,
  transferZeroGap: { WSe2: true, MoS2: true, graphene: true },
  finalConformalAl2O3: true,
  finalSensingWindows: true,
  roundTripExactModel: true,
  pageErrors,
  timings,
  stageChecks,
};
await writeFile(join(resultDir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await writeFile(
  join(resultDir, 'AUDIT.md'),
  '# M3D full replay audit — 2026-10-08\n\n' +
    '- Base branch: fix/photodetector-reconstruction-v2.\n' +
    '- Replay branch: test/m3d-full-replay-20261008.\n' +
    '- Native browser Process UI replay from a 60 × 30 µm blank representative field.\n' +
    '- Corrected v2 masks were converted from the committed SVGs without geometry edits other than the documented PVM/M3D field translations.\n' +
    '- WSe2, MoS2 and graphene Transfer / Laminate operations used Follow surface; exported canonical stacks were checked for zero support gap.\n' +
    '- S25 70 nm conformal Al2O3 completed through the real Process/worker UI path.\n' +
    '- S26 selectively removed the final Al2O3 in both sensing windows while retaining graphene below.\n' +
    '- The exported final project re-opened with exact model equality and 27 named bookmarks.\n\n' +
    'See validation.json for per-operation timings and final_*.png for final visual inspection.\n',
);

if (process.argv.includes('--write-repo')) {
  await writeFile(join(repoOut, 'M3D_selfpowered_full_replay.wafercad'), finalText);
  await writeFile(join(repoOut, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  await writeFile(join(repoOut, 'AUDIT.md'), await readFile(join(resultDir, 'AUDIT.md'), 'utf8'));
  for (const file of ['final_Main.png', 'final_3D.png', 'final_Section.png', 'final_overview.png']) {
    try {
      await writeFile(join(repoOut, file), await readFile(join(resultDir, file)));
    } catch {}
  }
}

console.log(
  JSON.stringify({
    pass: true,
    bookmarks: finalProject.snapshots.length,
    nodes: validation.processNodes,
    s25Seconds: timings
      .filter((item) => item.stage === '25_Final_Al2O3')
      .reduce((sum, item) => sum + item.seconds, 0),
    s26: true,
  }),
);
