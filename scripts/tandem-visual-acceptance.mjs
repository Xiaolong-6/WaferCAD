import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { exportCurrentProject } from './test-helpers/product-scientific.mjs';
import {
  newUiContext,
  closeFunctionPanel,
  waitForAppReady,
  waitForPaint,
  waitForStatus,
} from './test-helpers/ui.mjs';
await loadGeometryKernel();
const { expandProjectStorage } = await import('../site/project-io.js');

export async function runTandemVisualAcceptance(
  page,
  output = 'test-results/ui-acceptance/tandem',
) {
  await mkdir(output, { recursive: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const original = expandProjectStorage(
    JSON.parse(
      await readFile(
        new URL(
          '../site/examples/fully-textured-perovskite-silicon-tandem.wafercad',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const base = original.model.regions[0].stack.find((segment) => segment.layerId === 'base');
  for (const key of [
    'morphology',
    'polarity',
    'meanHeight',
    'featureSize',
    'featureCv',
    'heightCv',
    'etchDepth',
  ])
    assert.equal(base.frontSurface[key], base.backSurface[key]);
  const url = process.env.WAFERCAD_URL || 'http://127.0.0.1:4174';
  await page.goto(url + '/', { waitUntil: 'domcontentloaded' });
  const card = page.locator(
    '.welcome-example-card[data-example-id="fully-textured-perovskite-silicon-tandem"]',
  );
  await card.scrollIntoViewIfNeeded();
  for (const view of ['main', 'mask', 'three', 'section']) {
    await card.locator(`[data-preview-view="${view}"]`).click();
    await card.locator('.welcome-example-project-preview.ready').waitFor();
    await page.waitForFunction((view) => {
      const doc = document.querySelector(
        '.welcome-example-card[data-example-id="fully-textured-perovskite-silicon-tandem"] iframe',
      )?.contentDocument;
      return (
        doc?.documentElement.dataset.previewView === view &&
        (view !== 'three' ||
          doc.querySelector('#threeHost canvas')?.dataset.roughMeshMode === 'detailed')
      );
    }, view);
    await waitForPaint(page);
    await card
      .locator('.welcome-example-project-preview')
      .screenshot({ path: resolve(output, `welcome-${view}.png`) });
  }
  await page
    .locator(
      '.welcome-example-card[data-example-id="fully-textured-perovskite-silicon-tandem"] .welcome-example-title-link',
    )
    .click();
  await waitForAppReady(page);
  await waitForStatus(page, /Opened fully-textured-perovskite-silicon-tandem.wafercad/);
  await page.waitForFunction(
    () => document.querySelector('#threeHost')?.dataset.renderState === 'ready',
  );
  await closeFunctionPanel(page);
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('.section-collapse-advanced').evaluate((node) => {
    node.open = true;
  });
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'visible' });
  await page.locator('#sectionCollapseScaleLinked').setChecked(true);
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'hidden' });
  const shots = {};
  const states = [];
  async function visibleThreeShot(path) {
    for (let attempt = 0; attempt < 20; attempt++) {
      await waitForPaint(page);
      const shot = await page.locator('#threeHost').screenshot({ path });
      const coloredRatio = await page.evaluate(async (base64) => {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (
            Math.max(data[index], data[index + 1], data[index + 2]) -
              Math.min(data[index], data[index + 1], data[index + 2]) >
            25
          )
            count++;
        }
        return count / (canvas.width * canvas.height);
      }, shot.toString('base64'));
      if (coloredRatio > 0.03) return shot;
      await page.waitForTimeout(100);
    }
    assert.fail('3D material caps must be visible after rendering settles');
  }
  async function capture(name, ratio) {
    await page.waitForFunction((expected) => {
      const section = document.querySelector('#sectionCanvas')?.dataset,
        three = document.querySelector('#threeHost')?.dataset;
      return (
        section &&
        three &&
        Math.abs(
          Number(section.sectionFrontPxPerUm) / Number(section.sectionBackPxPerUm) - expected,
        ) < 1e-9 &&
        Math.abs(Number(three.zFrontScale) / Number(three.zBackScale) - expected) < 1e-9
      );
    }, ratio);
    await page.waitForFunction(
      () =>
        document.querySelector('#threeHost')?.dataset.renderState === 'ready' &&
        document.querySelector('#threeHost canvas')?.dataset.roughMeshMode === 'detailed',
    );
    await waitForPaint(page);
    shots[name] = {
      sectionRaster: await page.locator('#sectionCanvas').evaluate((canvas) => canvas.toDataURL()),
      section: await page
        .locator('#sectionCanvas')
        .screenshot({ path: resolve(output, name + '-section.png') }),
      three: await visibleThreeShot(resolve(output, name + '-three.png')),
    };
    await page.screenshot({ path: resolve(output, name + '-scene.png') });
    const state = await page.evaluate(() => ({
      section: { ...document.querySelector('#sectionCanvas').dataset },
      three: { ...document.querySelector('#threeHost').dataset },
      front: Number(document.querySelector('#sectionCollapseFrontScale').value),
      back: Number(document.querySelector('#sectionCollapseBackScale').value),
      linked: document.querySelector('#sectionCollapseScaleLinked').checked,
    }));
    states.push({ name, expectedRatio: ratio, ...state });
    console.log(
      'TANDEM_VISUAL_STATE',
      name,
      state.section.sectionFrontPxPerUm,
      state.section.sectionBackPxPerUm,
      state.three.zFrontScale,
      state.three.zBackScale,
    );
  }
  await capture('locked-1to1', 1);
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('.section-collapse-advanced').evaluate((node) => {
    node.open = true;
  });
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'visible' });
  await page.locator('#sectionCollapseScaleLinked').setChecked(false);
  await page.locator('#sectionCollapseFrontScale').fill('2');
  await page.locator('#sectionCollapseFrontScale').press('Tab');
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'hidden' });
  await capture('unlocked-2to1', 2);
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('.section-collapse-advanced').evaluate((node) => {
    node.open = true;
  });
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'visible' });
  await page.locator('#sectionCollapseFrontScale').fill('1');
  await page.locator('#sectionCollapseFrontScale').press('Tab');
  await page.locator('#sectionCollapseBackScale').fill('2');
  await page.locator('#sectionCollapseBackScale').press('Tab');
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'hidden' });
  await capture('unlocked-1to2', 0.5);
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('.section-collapse-advanced').evaluate((node) => {
    node.open = true;
  });
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'visible' });
  await page.locator('#sectionCollapseScaleLinked').setChecked(true);
  assert.equal(await page.locator('#sectionCollapseFrontScale').inputValue(), '1');
  assert.equal(await page.locator('#sectionCollapseBackScale').inputValue(), '1');
  await page.locator('#sectionCollapseAxisBtn').click();
  await page.locator('#sectionCollapseScaleLinked').waitFor({ state: 'hidden' });
  await capture('relocked-1to1', 1);
  const exported = await exportCurrentProject(page);
  assert.deepEqual(exported.model, original.model);
  for (const key of ['position', 'target']) {
    exported.display.threeCamera[key].forEach((value, index) =>
      assert.ok(
        Math.abs(value - original.display.threeCamera[key][index]) < 1e-6,
        `Opening the example must retain the saved camera ${key}`,
      ),
    );
  }
  assert.equal(exported.display.threeCamera.fov, original.display.threeCamera.fov);
  await page.locator('#threeMaxBtn').click();
  await page.waitForFunction(
    () => document.querySelector('#threeHost canvas')?.dataset.roughMeshMode === 'detailed',
  );
  await waitForPaint(page);
  await visibleThreeShot(resolve(output, 'locked-front-three-max.png'));
  const threeBounds = await page.locator('#threeHost').boundingBox(),
    frontPolarAngle = Math.atan2(Math.hypot(1.05, 1.15), 0.82),
    verticalDrag = ((Math.PI - 2 * frontPolarAngle) * threeBounds.height) / (2 * Math.PI);
  await page.mouse.move(
    threeBounds.x + threeBounds.width / 2,
    threeBounds.y + threeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    threeBounds.x + threeBounds.width / 2,
    threeBounds.y + threeBounds.height / 2 - verticalDrag,
    { steps: 15 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector('#threeHost canvas')?.dataset.roughMeshMode === 'detailed',
  );
  await waitForPaint(page);
  await visibleThreeShot(resolve(output, 'locked-back-three-max.png'));
  assert.deepEqual(errors, []);
  const report = {
    example: 'fully-textured-perovskite-silicon-tandem',
    samePyramidParameters: {
      heightUm: base.frontSurface.meanHeight,
      featureUm: base.frontSurface.featureSize,
      featureCv: base.frontSurface.featureCv,
      heightCv: base.frontSurface.heightCv,
      frontSeed: base.frontSurface.seed,
      backSeed: base.backSurface.seed,
    },
    states,
    modelUnchanged: true,
    pageErrors: errors,
    sectionCanvasRasterReLockIdentical:
      shots['locked-1to1'].sectionRaster === shots['relocked-1to1'].sectionRaster,
    sectionReLockPngIdentical: shots['locked-1to1'].section.equals(shots['relocked-1to1'].section),
    threeReLockPngIdentical: shots['locked-1to1'].three.equals(shots['relocked-1to1'].three),
    visualInspectionPending: true,
  };
  assert.equal(
    report.sectionCanvasRasterReLockIdentical,
    true,
    'Section restores the identical rendered image',
  );
  await writeFile(resolve(output, 'validation.json'), JSON.stringify(report, null, 2));
  console.log(
    'TANDEM_VISUAL_ACCEPTANCE',
    JSON.stringify({
      ...report,
      states: states.map((s) => ({ name: s.name, ratio: s.expectedRatio })),
    }),
  );
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const browser = await chromium.launch({
    headless: process.env.WAFERCAD_HEADFUL !== '1',
    ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const context = await newUiContext(browser, {
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    await runTandemVisualAcceptance(page, process.argv[2]);
  } finally {
    await browser.close();
  }
}
