import { resolveRendererWorkstationUrl } from './test-helpers/renderer-workstation-route.mjs';
// R5: exercise BOTH real 625-site scene variants in one Chromium context.
// Large-array allocations are cached by opaque/transparent mode. The small
// preview lifetime probe tests re-imports, but cannot exercise this cache.
// All byte totals are CPU-side retained TypedArrays, not physical GPU VRAM.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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

const output = new URL('../test-results/renderer-v4-r5-dual-variant/', import.meta.url);
await mkdir(output, { recursive: true });
const rendererWorkstationUrl = await resolveRendererWorkstationUrl(baseUrl);
const browser = await launchBrowser();
const history = [];

function nonnegativeInteger(value, label) {
  const number = Number(value);
  assert.ok(Number.isSafeInteger(number) && number >= 0, label + ': invalid ' + value);
  return number;
}

async function readState(page, phase) {
  await waitForThreeReady(page, 180000);
  const d = await page.locator('#threeHost').evaluate((node) => ({ ...node.dataset }));
  assert.equal(d.v4GpuResourceStatus, 'measured', phase);
  assert.equal(d.v4GpuResourceComplete, 'true', phase);
  assert.equal(d.v4GpuResourceCrossVariantGeometries, '0', phase);
  assert.equal(d.v4GpuResourceCrossVariantMaterials, '0', phase);
  const result = {
    phase,
    variant: d.sceneVariant,
    groups: nonnegativeInteger(d.v4GpuResourceSceneGroups, 'groups'),
    geometries: nonnegativeInteger(d.v4GpuResourceGeometries, 'geometries'),
    materials: nonnegativeInteger(d.v4GpuResourceMaterials, 'materials'),
    bytes: nonnegativeInteger(d.v4GpuResourceEstimatedBufferBytes, 'buffer bytes'),
    frameSerial: nonnegativeInteger(d.rendererFrameSerial, 'frame serial'),
    disposedGroups: nonnegativeInteger(d.v4R5DisposedGroups || 0, 'disposed groups'),
  };
  assert.ok(result.groups >= 1 && result.groups <= 2, phase + ': bounded cache size');
  assert.ok(result.geometries > 0 && result.bytes > 0, phase + ': non-empty real scene');
  history.push(result);
  console.log('RENDERER_V4_R5_DUAL_VARIANT_STATE', JSON.stringify(result));
  return result;
}

async function setOpacity(page, value, variant, phase) {
  const opacityControl = page.locator('#threePanel .three-opacity-control');
  const more = page.locator('#threePanel .view-more-control');
  if (
    (await opacityControl.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))) &&
    !(await more.evaluate((node) => node.open))
  ) {
    await more.locator(':scope > summary').click();
  }
  if (!(await opacityControl.evaluate((node) => node.open))) {
    await opacityControl.locator(':scope > summary').click();
  }
  const before = await page
    .locator('#threeHost')
    .evaluate((node) => Number(node.dataset.rendererFrameSerial || 0));
  await page.locator('#threeOpacityRange').fill(value);
  await page.waitForFunction(
    ({ serial, expected }) => {
      const host = document.getElementById('threeHost');
      return (
        host?.dataset.renderState === 'ready' &&
        host.dataset.sceneVariant === expected &&
        Number(host.dataset.rendererFrameSerial || 0) > serial
      );
    },
    { serial: before, expected: variant },
    { timeout: 180000 },
  );
  assert.equal(
    await page.locator('#threeOpacityValue').textContent(),
    value === '1' ? '100%' : '50%',
    phase + ': user-visible opacity callback',
  );
  const result = await readState(page, phase);
  assert.equal(result.variant, variant, phase);
  return result;
}

try {
  const context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    await page.goto(
      rendererWorkstationUrl +
        '?rendererV4GpuCensus=1&rendererV4SharedFlatCaps=1&rendererV4HeavyCameraNoDamping=1&rendererResponsiveInteraction=1&rendererResponsiveSmoothWorker=1',
    );
    await waitForAppReady(page);
    await page
      .locator('#openProjectInput')
      .setInputFiles(
        fileURLToPath(
          new URL(
            '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
            import.meta.url,
          ),
        ),
      );
    await chooseConfirmation(page);
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened '),
      undefined,
      { timeout: 180000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    const initialOpacity = await page.locator('#threeOpacityRange').inputValue();
    const first =
      initialOpacity === '1'
        ? await readState(page, 'warm-opaque')
        : await setOpacity(page, '1', 'opaque', 'warm-opaque');
    assert.equal(first.variant, 'opaque');
    assert.equal(first.groups, 1, 'first variant should not retain old model allocations');
    const second = await setOpacity(page, '0.5', 'transparent', 'warm-transparent');
    assert.equal(second.groups, 2, 'full 625-site model must retain both distinct scene variants');
    const firstTransition = await page.locator('#threeHost').evaluate((node) => ({
      retained: Number(node.dataset.rendererRetainedVariantBuilds || 0),
      committed: Number(node.dataset.rendererCommittedVariantSwaps || 0),
    }));
    assert.ok(
      firstTransition.retained >= 1,
      'initial opacity switch must retain the previous group',
    );
    assert.equal(
      firstTransition.committed,
      firstTransition.retained,
      'every completed variant build must commit its atomic swap',
    );
    // P1: the temporary interaction tier may hide internal display meshes,
    // but releasing the pointer must restore the exact full-wafer scene.
    const canvas = page.locator('#threeHost canvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100, 'interactive 3D canvas exists');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const exactTriangles = Number(
      await page.locator('#threeHost').evaluate((node) => node.dataset.rendererDrawTriangles),
    );
    const exactSerial = second.frameSerial;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 12, centerY + 9, { steps: 3 });
    await page.waitForFunction(
      (serial) => {
        const data = document.getElementById('threeHost')?.dataset;
        return (
          data?.rendererInteractionPreview === 'active' &&
          Number(data.rendererPreviewHiddenMeshes || 0) > 0 &&
          Number(data.rendererFrameSerial || 0) > serial
        );
      },
      exactSerial,
      { timeout: 180000 },
    );
    const preview = await page.locator('#threeHost').evaluate((node) => ({
      hidden: Number(node.dataset.rendererPreviewHiddenMeshes),
      triangles: Number(node.dataset.rendererDrawTriangles),
      serial: Number(node.dataset.rendererFrameSerial),
    }));
    assert.ok(preview.hidden > 0, 'heavy internal transparent meshes are deferred');
    assert.ok(preview.triangles < exactTriangles, 'preview must submit fewer triangles');
    await page.mouse.up();
    await page.waitForFunction(
      (serial) => {
        const data = document.getElementById('threeHost')?.dataset;
        return (
          data?.rendererInteractionPreview !== 'active' &&
          data?.renderPhase === 'complete' &&
          Number(data.rendererFrameSerial || 0) > serial
        );
      },
      preview.serial,
      { timeout: 180000 },
    );
    const restoredTriangles = Number(
      await page.locator('#threeHost').evaluate((node) => node.dataset.rendererDrawTriangles),
    );
    assert.ok(restoredTriangles > preview.triangles, 'exact internal geometry must return');
    console.log(
      'RENDERER_RESPONSIVE_PREVIEW',
      JSON.stringify({
        exactTriangles,
        preview,
        restoredTriangles,
      }),
    );
    const back = await setOpacity(page, '1', 'opaque', 'return-opaque');
    for (const key of ['groups', 'geometries', 'materials', 'bytes']) {
      assert.equal(back[key], second[key], key + ': cached variant reuse must not allocate again');
    }
    assert.equal(
      back.disposedGroups,
      second.disposedGroups,
      'cache swap must not dispose a live variant',
    );
    const again = await setOpacity(page, '0.5', 'transparent', 'return-transparent');
    for (const key of ['groups', 'geometries', 'materials', 'bytes']) {
      assert.equal(again[key], second[key], key + ': reverse cache swap must not allocate again');
    }
    assert.equal(again.disposedGroups, second.disposedGroups);
    for (let cycle = 1; cycle <= 2; cycle++) {
      const opaque = await setOpacity(page, '1', 'opaque', 'repeat-' + cycle + '-opaque');
      const transparent = await setOpacity(
        page,
        '0.5',
        'transparent',
        'repeat-' + cycle + '-transparent',
      );
      for (const state of [opaque, transparent]) {
        for (const key of ['groups', 'geometries', 'materials', 'bytes']) {
          assert.equal(state[key], second[key], state.phase + ': bounded ' + key);
        }
        assert.equal(
          state.disposedGroups,
          second.disposedGroups,
          state.phase + ': cached variant must not be disposed',
        );
      }
    }
    assert.deepEqual(errors, [], 'no browser page/console errors');
    const backend = await page.locator('#threeHost canvas').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'not-reported';
    });
    console.log(
      'RENDERER_V4_R5_DUAL_VARIANT_ACCEPTANCE',
      JSON.stringify({
        backend,
        variantCount: 2,
        boundedBufferBytes: second.bytes,
        states: history.length,
      }),
    );
    await writeFile(
      new URL('report.json', output),
      JSON.stringify({ backend, history }, null, 2) + '\n',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
