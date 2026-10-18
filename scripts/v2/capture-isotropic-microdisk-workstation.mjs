// Real Workstation / Chromium acceptance for #327's opt-in Microdisk release.
// Uses the published paper-source M07 and legacy M08. Never alters the shipped
// example, saved History or a user workspace; runs in an isolated browser origin.
// Screenshots establish native rendering only, NOT SEM-matched paper fidelity.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint, canvasInkFraction } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/isotropic-microdisk-workstation');
await mkdir(output, { recursive: true });
const evidence = {
  fixture: 'published-suspended-silica-microdisks',
  paper: 'Basiri-Esfahani et al. (2019)',
  sourceSnapshot: 'snapshot-microdisk-07',
  legacySnapshot: 'snapshot-microdisk-08',
  radiusUm: 36,
  radiusQualification: 'engineering-assumption-not-paper-measured',
  optInMaxLateralErrorUm: 0.25,
  expectedDepthBands: 72,
  paperOverlayVerified: false,
  actualWorkstation: true,
  result: 'running',
  views: [],
};
let browser;
let context;
let page;
const errors = [];

async function capture(view, kind) {
  await selectScientificView(page, kind, 1560);
  if (kind === 'three') {
    await page.waitForFunction(
      () =>
        document.querySelector('#threeHost canvas')?.width > 100 &&
        document.querySelector('#threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 120000 },
    );
  } else {
    await page.locator('#sectionCanvas').waitFor({ state: 'visible', timeout: 120000 });
  }
  await waitForPaint(page);
  const element = kind === 'three' ? '#threePanel' : '#sectionPanel';
  const canvas = kind === 'three' ? '#threeHost canvas' : '#sectionCanvas';
  const metrics = await page.evaluate((target) => {
    const node = document.querySelector(target);
    return { width: node?.width || 0, height: node?.height || 0 };
  }, canvas);
  assert.ok(metrics.width > 100 && metrics.height > 100, kind + ' canvas missing');
  if (kind === 'section') {
    metrics.inkFraction = await canvasInkFraction(page, canvas);
    assert.ok(metrics.inkFraction > 0.002, 'Native physical Section has no painted content');
  }
  const filename = view + '-' + kind + '-native.png';
  await page.locator(element).screenshot({
    path: resolve(output, filename),
    animations: 'disabled',
    timeout: 120000,
  });
  const screenshotSha256 = createHash('sha256')
    .update(await readFile(resolve(output, filename)))
    .digest('hex');
  evidence.views.push({ variant: view, kind, filename, screenshotSha256, metrics });
}

try {
  browser = await launchBrowser();
  ({ page, context } = await newUiPage(browser, {
    viewport: { width: 1560, height: 960 },
    acceptDownloads: false,
  }));
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  await page.goto(base + '/app.html?start=example&example=suspended-silica-microdisk', {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  const prepared = await page.evaluate(async () => {
    const response = await fetch('/examples/suspended-silica-microdisks.wafercad');
    if (!response.ok) throw new Error('Published Microdisk source unavailable');
    const originalText = await response.text();
    const originalFile = new File([originalText], 'original-microdisk.wafercad', {
      type: 'application/json',
    });
    const { readProjectFile } = await import('/project-io.js');
    const project = await readProjectFile(originalFile);
    const M07 = project.snapshots.find((item) => item.id === 'snapshot-microdisk-07')?.state?.model;
    const M08 = project.snapshots.find((item) => item.id === 'snapshot-microdisk-08')?.state?.model;
    if (!M07 || !M08) throw new Error('Actual M07/M08 published scientific snapshots missing');
    const { applyOperation, geometryArea } = await import('/model.js');
    const { adaptiveReleaseDepthBands } = await import('/isotropic-release-oracle.js');
    const { pointInMulti } = await import('/vector-geometry.js');
    const bands = adaptiveReleaseDepthBands({
      radius: 36,
      maxLateralErrorUm: 0.25,
      maxBands: 128,
    });
    if (bands.length !== 72) throw new Error('Unexpected adaptive depth-band budget');
    const volumeOf = (model, id) =>
      model.regions.reduce(
        (sum, region) =>
          sum +
          geometryArea(region.geom) *
            region.stack.reduce(
              (height, part) => height + (part.layerId === id ? part.z1 - part.z0 : 0),
              0,
            ),
        0,
      );
    const stackAt = (model, xy) =>
      model.regions.find((region) => pointInMulti(xy, region.geom))?.stack || [];
    const adaptive = structuredClone(M07);
    const result = applyOperation(adaptive, {
      type: 'etch',
      etchProfile: 'isotropic',
      etchTargetLayerIds: ['base'],
      thickness: 36,
      face: 'front',
      area: adaptive.boundary,
      isotropicLateralErrorUm: 0.25,
    });
    if (!result.changed) throw new Error('Adaptive M07 Process rejected: ' + result.error);
    const baseVol07 = volumeOf(M07, 'base');
    const baseVolAdaptive = volumeOf(adaptive, 'base');
    const oxideVol07 = volumeOf(M07, 'layer-1');
    const oxideVolAdaptive = volumeOf(adaptive, 'layer-1');
    if (!(baseVolAdaptive < baseVol07 && baseVolAdaptive > 0))
      throw new Error('Actual M07 Si release did not reduce Si mass');
    if (Math.abs(oxideVolAdaptive - oxideVol07) > oxideVol07 * 1e-6)
      throw new Error('Experimental Si release consumed retained oxide');
    const undercut = stackAt(adaptive, [110, 0]);
    if (!undercut.some((part) => part.layerId === 'base' && part.z1 < 40))
      throw new Error('Actual spoked disk not undercut at the source SiO2 annulus');
    if (!stackAt(adaptive, [0, 0]).some((part) => part.layerId === 'base' && part.z1 === 40))
      throw new Error('Physical source central support was removed');
    if (JSON.stringify(M08.regions) === JSON.stringify(adaptive.regions))
      throw new Error('Experimental and old eight-band materials unexpectedly identical');
    const originalSourceHash = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(originalText),
    );
    const digest = [...new Uint8Array(originalSourceHash)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const createInspector = (model, name) => {
      const inspection = {
        ...project,
        name,
        model: structuredClone(model),
        section: { a: [-175, 0], b: [175, 0] },
        display: {
          ...project.display,
          sectionDetailRoi: null,
          sectionCollapse: null,
          threeShowBorders: false,
          sectionShowBorders: false,
        },
      };
      // Isolated read-only inspection copies, not edited source snapshots.
      // Never attach old M08 History to a newly synthesized Process result.
      delete inspection.snapshots;
      delete inspection.snapshotBranches;
      delete inspection.processRecipe;
      return JSON.stringify(inspection);
    };
    return {
      originalFileSha256: digest,
      massesUm3: {
        preReleaseSi: baseVol07,
        legacySi: volumeOf(M08, 'base'),
        adaptiveSi: baseVolAdaptive,
        preReleaseOxide: oxideVol07,
        legacyOxide: volumeOf(M08, 'layer-1'),
        adaptiveOxide: oxideVolAdaptive,
      },
      probeXYUm: [110, 0],
      actualUndercutStack: undercut,
      legacyUndercutStack: stackAt(M08, [110, 0]),
      inspectorProjects: {
        legacy: createInspector(M08, 'Microdisk old eight-band native inspection'),
        adaptive: createInspector(adaptive, 'Microdisk opt-in adaptive native inspection'),
      },
    };
  });
  evidence.originalFileSha256 = prepared.originalFileSha256;
  evidence.massesUm3 = prepared.massesUm3;
  evidence.physicalProbeXYUm = prepared.probeXYUm;
  evidence.adaptiveUndercutStack = prepared.actualUndercutStack;
  evidence.legacyUndercutStack = prepared.legacyUndercutStack;
  for (const variant of ['legacy', 'adaptive']) {
    const projectText = prepared.inspectorProjects[variant];
    await page.evaluate(async (text) => {
      const { stageStartupFile } = await import('/startup-file.js');
      await stageStartupFile(
        new File([text], 'microdisk-native-inspector.wafercad', {
          type: 'application/json',
        }),
        'project',
      );
    }, projectText);
    await page.goto(base + '/app.html?start=staged', {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    });
    await page.waitForFunction(
      () => ['true', 'error'].includes(document.body.dataset.ready),
      null,
      { timeout: 180000 },
    );
    assert.equal(
      await page.locator('body').getAttribute('data-ready'),
      'true',
      variant + ' failed to import into actual native v2 Workstation',
    );
    const snap = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(snap.sharedIdentity, true, 'Main and other views must share one material Model');
    assert.equal(snap.model.kernel, 'vector-2.5d-v1');
    assert.deepEqual(snap.section, { a: [-175, 0], b: [175, 0] });
    await capture(variant, 'three');
    await capture(variant, 'section');
    const check = await page.evaluate(async () => {
      const { sectionSlices } = await import('/model-view-geometry.js');
      const model = window.WaferCadV2Workstation.snapshot().model;
      const z = sectionSlices(model, [-175, 0], [175, 0]);
      const t = (110 + 175) / 350;
      return z
        .filter((slice) => slice.t0 <= t && t <= slice.t1 && slice.z1 > slice.z0)
        .map(({ layerId, z0, z1 }) => ({ layerId, z0, z1 }));
    });
    assert.ok(check.length, variant + ' physical native section missing source region');
    evidence.views.push({
      variant,
      kind: 'section-material-probe',
      xy: [110, 0],
      materialBands: check,
    });
  }
  const probes = evidence.views.filter((item) => item.kind === 'section-material-probe');
  assert.equal(probes.length, 2);
  assert.notDeepEqual(
    probes[0].materialBands,
    probes[1].materialBands,
    'Physical native Section must distinguish original M08 from adaptive Process geometry',
  );
  assert.deepEqual(errors, [], 'Actual Workstation page must not throw during release captures');
  evidence.result = 'captured-unreviewed';
} catch (error) {
  evidence.result = 'failed';
  evidence.error = String(error.stack || error);
  evidence.pageErrors = errors;
  if (page) {
    await page
      .screenshot({
        path: resolve(output, 'failure.png'),
        animations: 'disabled',
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(evidence, null, 2) + '\n');
  await context?.close();
  await browser?.close();
}
