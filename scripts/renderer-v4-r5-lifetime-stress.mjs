// R5 bounded multi-cycle acceptance on a lightweight real WaferCAD project.
// Measures *owned JS buffers/scene objects* and actual dispose invocations.
// Chromium SwiftShader results must not be described as hardware-GPU VRAM.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  newUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
  chooseConfirmation,
  closeFunctionPanel,
  baseUrl,
} from './test-helpers/ui.mjs';

const output = new URL('../test-results/renderer-v4-r5-lifetime/', import.meta.url);
await mkdir(output, { recursive: true });
const fixture = await readFile(
  fileURLToPath(
    new URL('../site/examples/previews/three-tier-silicon-jlfets.wafercad', import.meta.url),
  ),
);
const browser = await launchBrowser();
const states = [];

async function snapshot(page, phase) {
  await waitForThreeReady(page, 120000);
  const data = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
  assert.equal(data.renderState, 'ready', phase);
  assert.equal(data.v4GpuResourceStatus, 'measured', phase);
  assert.equal(data.v4GpuResourceComplete, 'true', phase);
  assert.equal(data.v4GpuResourceCrossVariantGeometries, '0', phase);
  assert.equal(data.v4GpuResourceCrossVariantMaterials, '0', phase);
  const result = {
    phase,
    variant: data.sceneVariant,
    generation: data.sceneGeneration,
    frameSerial: Number(data.rendererFrameSerial),
    groups: Number(data.v4GpuResourceSceneGroups),
    geometries: Number(data.v4GpuResourceGeometries),
    materials: Number(data.v4GpuResourceMaterials),
    bytes: Number(data.v4GpuResourceEstimatedBufferBytes),
    disposedGroups: Number(data.v4R5DisposedGroups || 0),
    disposedGeometries: Number(data.v4R5DisposedGeometries || 0),
    disposedMaterials: Number(data.v4R5DisposedMaterials || 0),
    retiredTemplates: Number(data.v4R5RetiredFlatTemplates || 0),
  };
  assert.ok(result.groups >= 1 && result.groups <= 2, phase + ': at most two retained variants');
  assert.ok(result.geometries > 0 && result.bytes > 0, phase + ': live geometry');
  for (const key of ['frameSerial', 'disposedGroups', 'disposedGeometries', 'disposedMaterials']) {
    assert.ok(Number.isSafeInteger(result[key]) && result[key] >= 0, phase + ': ' + key);
  }
  states.push(result);
  return result;
}

async function waitNewFrame(page, before, expectedVariant) {
  await page.waitForFunction(
    ({ previous, variant }) => {
      const host = document.getElementById('threeHost');
      return (
        host?.dataset.renderState === 'ready' &&
        host?.dataset.sceneVariant === variant &&
        Number(host.dataset.rendererFrameSerial || 0) > previous
      );
    },
    { previous: before, variant: expectedVariant },
    { timeout: 120000 },
  );
}

async function importFixture(page, iteration) {
  const before = await page
    .locator('#threeHost')
    .evaluate((node) => Number(node.dataset.rendererFrameSerial || 0));
  await page.locator('#openProjectInput').setInputFiles({
    name: 'r5-lifetime-' + iteration + '.wafercad',
    mimeType: 'application/octet-stream',
    buffer: fixture,
  });
  await chooseConfirmation(page);
  await page.waitForFunction(
    (name) => document.getElementById('statusText')?.textContent.includes(name),
    'r5-lifetime-' + iteration + '.wafercad',
    { timeout: 120000 },
  );
  await waitNewFrame(page, before, 'opaque');
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = observePageErrors(page);
    await page.goto(baseUrl + '/app.html?rendererV4GpuCensus=1&rendererV4SharedFlatCaps=1');
    await waitForAppReady(page);
    await importFixture(page, 0);
    await closeFunctionPanel(page);
    const opacityControl = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    if (
      await opacityControl.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))
    ) {
      if (!(await more.evaluate((node) => node.open))) {
        await more.locator(':scope > summary').click();
      }
    }
    if (!(await opacityControl.evaluate((node) => node.open))) {
      await opacityControl.locator(':scope > summary').click();
    }
    const range = page.locator('#threeOpacityRange');
    const changeOpacity = async (opacity, label) => {
      const before = await page
        .locator('#threeHost')
        .evaluate((node) => Number(node.dataset.rendererFrameSerial || 0));
      await range.fill(opacity);
      const variant = opacity === '1' ? 'opaque' : 'transparent';
      await waitNewFrame(page, before, variant);
      return snapshot(page, label);
    };

    // Construct both retained scene variants. Revisit them without
    // reimporting to prove the variant cache stays bounded, not ever-growing.
    const opaque0 = await snapshot(page, 'initial-opaque');
    assert.equal(opaque0.variant, 'opaque');
    await changeOpacity('0.5', 'warm-transparent');
    const opaque1 = await changeOpacity('1', 'warm-opaque');
    for (let cycle = 0; cycle < 3; cycle++) {
      const transparent = await changeOpacity('0.5', 'cycle-' + cycle + '-transparent');
      const opaque = await changeOpacity('1', 'cycle-' + cycle + '-opaque');
      assert.equal(transparent.groups, 2);
      assert.equal(opaque.groups, 2);
      assert.equal(opaque.bytes, opaque1.bytes, 'opaque cache must not grow by repeated toggles');
      assert.equal(opaque.geometries, opaque1.geometries);
      assert.equal(opaque.materials, opaque1.materials);
    }

    // Two user-imported project revisions must invalidate and retire prior
    // scene groups, not preserve stale resources in an orphaned cache.
    const beforeReload = states.at(-1);
    for (let revision = 1; revision <= 2; revision++) {
      await importFixture(page, revision);
      const current = await snapshot(page, 'reimport-' + revision);
      assert.equal(current.variant, 'opaque');
      assert.ok(
        current.disposedGroups > beforeReload.disposedGroups,
        'reimport must retire at least one old scene group',
      );
      assert.ok(
        current.disposedGeometries > beforeReload.disposedGeometries,
        'reimport must dispose old geometry',
      );
      assert.ok(
        current.disposedMaterials > beforeReload.disposedMaterials,
        'reimport must dispose old materials',
      );
    }
    assert.deepEqual(errors, [], 'no page/console errors from repeated scene lifetime');
    console.log(
      'RENDERER_V4_R5_LIFETIME_STRESS',
      JSON.stringify({
        backend: await page.locator('#threeHost canvas').evaluate((canvas) => {
          const gl = canvas.getContext('webgl2');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'not-reported';
        }),
        states,
      }),
    );
    await writeFile(new URL('report.json', output), JSON.stringify({ states }, null, 2) + '\n');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
