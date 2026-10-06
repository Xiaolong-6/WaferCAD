import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { setInterval, clearInterval } from 'node:timers';
import { chromium } from 'playwright';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import {
  newUiContext,
  waitForAppReady,
  openFunctionPanel,
  closeFunctionPanel,
  waitForThreeReady,
} from './test-helpers/ui.mjs';
import { loadProject } from './test-helpers/product-scientific.mjs';
import { assertNativeFig3Contract } from './test-helpers/example-contracts.mjs';
import { nativeApply } from './test-helpers/native-fig3.mjs';
await loadGeometryKernel();
const io = await import('../site/project-io.js');
const api = await import('../site/model.js');
const { pointInMulti } = await import('../site/vector-geometry.js');
const schema = await import('../site/project-schema.js');
const dir = new URL('../test-results/native-fig3/complete-ui/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.WAFERCAD_HEADFUL !== '1',
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: [
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const context = await newUiContext(browser, {
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const resumeAfterCmp = process.argv[2] === '--resume-after-cmp';
const resumeAfterGate = process.argv[2] === '--resume-after-gate';
const verifyComplete = process.argv[2] === '--verify-complete';
const resume = resumeAfterCmp || resumeAfterGate || verifyComplete;
const log = resume
  ? JSON.parse(await readFile(new URL('operations.json', dir), 'utf8')).slice(
      0,
      resumeAfterGate ? 15 : 8,
    )
  : [];
const monitor = setInterval(
  () =>
    page
      .evaluate(() => ({
        url: location.href,
        status: document.querySelector('#statusText')?.textContent,
        disabled: document.querySelector('#applyOperationBtn')?.disabled,
        confirmation: !document.querySelector('#confirmationDialogOverlay')?.hidden,
        stage: document.querySelector('#processTaskStage')?.textContent,
      }))
      .then((state) => console.log('UI_STATE', state))
      .catch(() => {}),
  30000,
);
async function save(name) {
  await openFunctionPanel(page, 'project', { timeout: 300000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 300000 });
  await page.locator('#exportProjectBtn').click({ timeout: 300000 });
  const download = await downloadPromise;
  const project = io.expandProjectStorage(
    JSON.parse(await readFile(await download.path(), 'utf8')),
  );
  await closeFunctionPanel(page);
  schema.validateProjectFile(project);
  await writeFile(new URL(name + '.wafercad', dir), io.serializeProject(project));
  console.log('EXPORT', name, project.model.regions.length, project.snapshotBranches.nodes.length);
  return project;
}
async function apply(p) {
  const r = await nativeApply(page, p);
  log.push(r);
  await writeFile(new URL('operations.json', dir), JSON.stringify(log, null, 2));
  assert.equal(r.passed, true, r.status);
  return r;
}
try {
  await page.goto((process.env.WAFERCAD_URL || 'http://127.0.0.1:4174') + '/app.html', {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppReady(page);
  const source = io.expandProjectStorage(
    JSON.parse(
      resume
        ? await readFile(
            new URL(
              verifyComplete
                ? 'fig3-site-native-three-tiers.wafercad'
                : resumeAfterGate
                  ? 't3-native-gate.wafercad'
                  : 'ild2-native-complete.wafercad',
              dir,
            ),
            'utf8',
          )
        : brotliDecompressSync(
            await readFile(
              new URL(
                '../tests/fixtures/native-fig3/tier2-before-gate.wafercad.br',
                import.meta.url,
              ),
            ),
          ),
    ),
  );
  await loadProject(page, source, 'fig3-native-T2');
  const before = await save(
    verifyComplete
      ? 'verify-complete'
      : resumeAfterGate
        ? 'resume-after-gate'
        : resumeAfterCmp
          ? 'resume-after-cmp'
          : 'before-ild2',
  );
  assert.deepEqual(before.model, source.model);
  assert.equal(
    before.snapshotBranches.nodes.length,
    verifyComplete ? 40 : resumeAfterGate ? 37 : resumeAfterCmp ? 30 : 22,
  );
  let target = 250.4028;
  if (!resume) {
    await apply({
      type: 'add',
      name: 'T2 HfO2 gate',
      thickness: 0.01,
      layer: 9,
      growth: 'conformal',
    });
    await apply({ type: 'add', name: 'T2 Gate metal', thickness: 0.0404, layer: 12 });
    await apply({
      type: 'etch',
      name: 'T2 contact windows',
      thickness: 0.01,
      layer: 13,
      target: 'T2 HfO2 gate',
    });
    await apply({
      type: 'record',
      name: 'T2 forming-gas anneal',
      processType: 'anneal',
      temperature: 300,
      duration: 0.75,
      ambient: 'Forming gas',
      note: '45 s; gate metal 40.4 nm merged. Native Conformal gate retained.',
    });
    const tier2 = await save('t2-native-complete');
    target = Number(
      (Math.max(...tier2.model.regions.map((r) => api.surfaceZ(r.stack))) + 0.09).toFixed(6),
    );
    await apply({
      type: 'add',
      name: 'ILD2 HfO2 liner',
      thickness: 0.02,
      layer: 9,
      growth: 'conformal',
    });
    await save('ild2-native-liner');
    await apply({
      type: 'record',
      name: 'ILD2 SOG/CMP geometry assumption',
      note: `Fig2 90 nm reference, not measured Fig3 ILD. Target next membrane base Z=${target} um, 90 nm above completed-tier highest feature. SOG overfill/native CMP are geometric surrogates.`,
    });
    await apply({
      type: 'add',
      name: 'ILD2 SOG overfill',
      thickness: 0.2,
      layer: 9,
      growth: 'conformal',
    });
    await apply({
      type: 'etch',
      name: 'ILD2 Planarize/CMP',
      profile: 'planarize',
      thickness: target,
      layer: 9,
    });
    const ild = await save('ild2-native-complete');
    for (const region of ild.model.regions)
      assert.ok(Math.abs(api.surfaceZ(region.stack) - target) < 0.000051, 'Planar top');
  }
  if (!resumeAfterGate && !verifyComplete) {
    await apply({
      type: 'record',
      name: 'T3 donor/roll-transfer conditions',
      temperature: 170,
      note: 'External donor 8-10 nm Si, P doping ~1e19 cm^-3. Geometric transfer models placement, not bonding chemistry.',
    });
    await apply({
      type: 'add',
      name: 'T3 Si membrane',
      thickness: 0.01,
      layer: 9,
      growth: 'transfer',
    });
    await apply({
      type: 'electrical',
      name: 'T3 n-type P doping ~1e19 cm^-3',
      thickness: 0.01,
      layer: 9,
    });
    await apply({ type: 'add', name: 'T3 S/D metal', thickness: 0.0414, layer: 11 });
    await apply({
      type: 'etch',
      name: 'T3 silicon isolation',
      thickness: 0.01,
      layer: 10,
      area: 'invert',
      target: 'T3 Si membrane',
    });
    await apply({
      type: 'record',
      name: 'T3 contact anneal',
      processType: 'anneal',
      temperature: 400,
      duration: 1 / 6,
      ambient: 'N2',
      note: '10 s. S/D 41.4 nm is a merged geometric metal layer.',
    });
    await save('t3-before-gate');
    await apply({
      type: 'add',
      name: 'T3 HfO2 gate',
      thickness: 0.01,
      layer: 9,
      growth: 'conformal',
    });
    await save('t3-native-gate');
  }
  if (!verifyComplete) {
    await apply({ type: 'add', name: 'T3 Gate metal', thickness: 0.0404, layer: 12 });
    await apply({
      type: 'etch',
      name: 'T3 contact windows',
      thickness: 0.01,
      layer: 13,
      target: 'T3 HfO2 gate',
    });
    await apply({
      type: 'record',
      name: 'T3 forming-gas anneal',
      processType: 'anneal',
      temperature: 300,
      duration: 0.75,
      ambient: 'Forming gas',
      note: '45 s; gate metal 40.4 nm merged. Native Conformal gate retained. Native oxide omitted.',
    });
  }
  const final = await save('fig3-site-native-three-tiers');
  const physicalContract = assertNativeFig3Contract(final, pointInMulti);
  assert.deepEqual(
    final.snapshotBranches.nodes.slice(0, before.snapshotBranches.nodes.length),
    before.snapshotBranches.nodes,
  );

  await loadProject(page, final, 'fig3-site-native-three-tiers');
  const reopened = await save('reopened-three-tiers');
  assert.deepEqual(reopened.model, final.model);
  assert.deepEqual(reopened.snapshotBranches, final.snapshotBranches);
  await closeFunctionPanel(page);
  await waitForThreeReady(page, 300000);
  await page.screenshot({ path: new URL('completed.png', dir).pathname.replace(/^\/(\w:)/, '$1') });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('validation.json', dir),
    JSON.stringify(
      {
        operations: log,
        errors,
        steps: final.snapshotBranches.nodes.length,
        regions: final.model.regions.length,
        planarityTargetUm: target,
        reopenedModelAndHistoryIdentical: true,
        physicalContract,
        resumedAfterCmp: resumeAfterCmp,
        resumedAfterGate: resumeAfterGate,
        verificationOnly: verifyComplete,
      },
      null,
      2,
    ),
  );
  console.log('NATIVE_ILD2_T3_PASS');
} catch (error) {
  console.log(
    'UI_FAILURE',
    await page.evaluate(() => ({
      url: location.href,
      status: document.querySelector('#statusText')?.textContent,
      confirm: document.querySelector('#confirmationDialogOverlay')?.textContent,
    })),
  );
  await page.screenshot({ path: new URL('failed.png', dir).pathname.replace(/^\/(\w:)/, '$1') });
  throw error;
} finally {
  clearInterval(monitor);
  await browser.close();
}
