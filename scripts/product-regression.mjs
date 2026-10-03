import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import {
  loadGeometryKernel,
  processBenchmark,
  projectForBenchmark,
} from './process-benchmarks.mjs';
import { sampleById } from '../site/sample-layouts.js';

await loadGeometryKernel();
const { parseLayoutFile } = await import('../site/layout-io.js');

const output = resolve(process.env.WAFERCAD_REVIEW_DIR || 'test-results/product-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const cases = [];
const errors = [];
const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );

async function open(viewport, touch = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
  });
  // The product's pinned CDN URLs are supplied from the same npm version for repeatable CI.
  if (process.env.WAFERCAD_THREE_DIR) {
    await context.route('https://cdn.jsdelivr.net/npm/three@0.179.1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.split('/three@0.179.1/')[1];
      await route.fulfill({
        contentType: 'text/javascript',
        body: await readFile(join(process.env.WAFERCAD_THREE_DIR, path)),
      });
    });
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  const baseUrl = process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
  await page.goto(`${baseUrl.replace(/\/$/, '')}/app.html`);
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  await page.locator('#threeHost canvas').waitFor({ state: 'attached', timeout: 10000 });
  assert.equal(
    await page.locator('#threeHost canvas').count(),
    1,
    'Real 3D must render in this suite',
  );
  return { page, context };
}

async function capture(page, name) {
  // Allow two rendered frames after layout or model changes.
  await page.evaluate(
    () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      ),
  );
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  cases.push(name);
}

async function checkLayout(page) {
  const problems = await page.evaluate(() => {
    const issues = [];
    const threeError = document.getElementById('threeHost')?.dataset.renderError;
    if (threeError) issues.push(`3D render error: ${threeError}`);
    if (document.documentElement.scrollWidth > innerWidth) issues.push('page horizontal overflow');
    for (const panel of document.querySelectorAll('.view-panel')) {
      const head = panel.querySelector('.view-head').getBoundingClientRect();
      for (const element of panel.querySelectorAll(
        '.view-head button, .view-head summary, .three-border-toggle',
      )) {
        const rect = element.getBoundingClientRect();
        if (!element.checkVisibility() || element.closest('.focus-popover, .three-opacity-popover'))
          continue;
        if (!rect.width || !rect.height) continue;
        if (
          rect.left < head.left - 1 ||
          rect.right > head.right + 1 ||
          rect.bottom > head.bottom + 1
        )
          issues.push(`${element.id || element.className}: outside header`);
      }
    }
    for (const id of ['mainCanvas', 'maskCanvas', 'sectionCanvas']) {
      const canvas = document.getElementById(id);
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 100) issues.push(`${id}: too small`);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (
        Math.abs(canvas.width - rect.width * dpr) > 2 ||
        Math.abs(canvas.height - rect.height * dpr) > 2
      )
        issues.push(`${id}: stale canvas size`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
}

async function checkCompactProcessLayout(page, name) {
  await page.locator('#operationTab').click();
  await page.locator('[data-process-mode="etch"]').click();
  await page.locator('#etchSurfaceMode').selectOption('rough');

  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('#operationTools'),
      feature = document.querySelector('#roughFeatureRow').getBoundingClientRect(),
      featureCv = document.querySelector('#roughFeatureCvRow').getBoundingClientRect(),
      height = document.querySelector('#roughHeightRow').getBoundingClientRect(),
      heightCv = document.querySelector('#roughHeightCvRow').getBoundingClientRect(),
      labels = [...panel.querySelectorAll('.param-field > span:first-child')].map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent.trim(), height: rect.height, width: rect.width };
      });
    return {
      overflow: panel.scrollWidth - panel.clientWidth,
      featureTop: feature.top,
      featureCvTop: featureCv.top,
      heightTop: height.top,
      heightCvTop: heightCv.top,
      labels,
    };
  });

  assert.ok(metrics.overflow <= 1, `${name}: Process panel horizontal overflow ${metrics.overflow}px`);
  if (name === 'phone') {
    assert.ok(
      Math.abs(metrics.featureTop - metrics.featureCvTop) > 4,
      'phone: Feature fields should collapse to one column',
    );
    assert.ok(
      Math.abs(metrics.heightTop - metrics.heightCvTop) > 4,
      'phone: Height fields should collapse to one column',
    );
  } else {
    assert.ok(
      Math.abs(metrics.featureTop - metrics.featureCvTop) <= 2,
      `${name}: Feature XY and CV are not aligned in one row`,
    );
    assert.ok(
      Math.abs(metrics.heightTop - metrics.heightCvTop) <= 2,
      `${name}: Height mean and CV are not aligned in one row`,
    );
    for (const label of metrics.labels) {
      assert.ok(label.height <= 16, `${name}: wrapped parameter label ${label.text}`);
    }
  }

  await capture(page, `${name}-tab-operation-rough`);

  await page.locator('[data-process-mode="implant"]').click();
  const implantOverflow = await page.locator('#operationTools').evaluate(
    (panel) => panel.scrollWidth - panel.clientWidth,
  );
  assert.ok(implantOverflow <= 1, `${name}: Implant panel horizontal overflow ${implantOverflow}px`);
  await capture(page, `${name}-tab-operation-implant`);
}

async function checkPopover(page, selector, panelId) {
  const popup = await page.locator(selector).boundingBox();
  const panel = await page.locator(panelId).boundingBox();
  assert.ok(popup && panel);
  assert.ok(
    popup.x >= panel.x && popup.x + popup.width <= panel.x + panel.width,
    `${selector}: horizontally clipped`,
  );
  assert.ok(
    popup.y >= panel.y && popup.y + popup.height <= panel.y + panel.height,
    `${selector}: vertically clipped`,
  );
}

async function coords(page) {
  return Promise.all(
    ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'].map(async (id) =>
      Number(await page.locator(`#${id}`).inputValue()),
    ),
  );
}

async function dragHandle(page, endpoint, dx, dy, cancel = false) {
  const handle = page.locator(`[data-endpoint=${endpoint}]`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert.ok(box);
  // Grab off-center to prove the endpoint does not jump to the pointer.
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4 + dx, box.y + box.height / 2 + 2 + dy, {
    steps: 5,
  });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

async function checkAB(page, name) {
  const nmRoundedMicron = (value) => Math.round(value * 1000) / 1000;
  const mainCanvas = page.locator('#mainCanvas');
  const canvas = await mainCanvas.boundingBox();
  assert.ok(canvas);

  // Existing Slice geometry is editable even with the parameter panel closed.
  assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
  assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

  // Slice opens the parameter panel and starts one-shot replacement creation.
  await page.locator('#sectionControlsBtn').click();
  assert.equal(await page.locator('#sectionCoordsPanel').isVisible(), true);
  assert.equal(await page.locator('[data-endpoint=a]').isHidden(), true);
  await page.mouse.move(canvas.x + canvas.width * 0.28, canvas.y + canvas.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.72, canvas.y + canvas.height * 0.58, {
    steps: 5,
  });
  await page.mouse.up();
  assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
  assert.equal(await page.locator('[data-endpoint=b]').isVisible(), true);

  const before = await coords(page);
  const a = await page.locator('[data-endpoint=a]').boundingBox();
  const b = await page.locator('[data-endpoint=b]').boundingBox();
  const scale = Math.min((canvas.width - 68) / 100000, (canvas.height - 68) / 100000);
  await dragHandle(page, 'a', 16, -8);
  const after = await coords(page);
  close(after[0], nmRoundedMicron(before[0] + 16 / scale));
  close(after[1], nmRoundedMicron(before[1] + 8 / scale));
  close(after[2], before[2]);
  close(after[3], before[3]);
  assert.equal(await page.locator('#sectionCoordsPanel').isVisible(), true);
  await dragHandle(page, 'b', -10, 9);
  const moved = await coords(page);
  close(moved[2], nmRoundedMicron(before[2] - 10 / scale));
  close(moved[3], nmRoundedMicron(before[3] - 9 / scale));
  await dragHandle(page, 'a', 12, 6, true);
  assert.deepEqual(await coords(page), moved, 'Escape cancels only the in-progress drag');
  if (name === 'phone') {
    const session = await page.context().newCDPSession(page);
    const target = await page.locator('[data-endpoint=a]').boundingBox();
    const x = target.x + target.width / 2;
    const y = target.y + target.height / 2;
    const beforeTouch = await coords(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 0 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 6, y: y - 4, id: 0 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const touchMoved = await coords(page);
    close(touchMoved[0], nmRoundedMicron(beforeTouch[0] + 6 / scale));
    close(touchMoved[1], nmRoundedMicron(beforeTouch[1] + 4 / scale));
    moved[0] = touchMoved[0];
    moved[1] = touchMoved[1];
    await session.detach();
  }
  await page.locator('#operationTab').click();
  await page.locator('#faceToggleBtn').click();
  await dragHandle(page, 'a', 8, 0);
  const back = await coords(page);
  close(back[0], nmRoundedMicron(moved[0] - 8 / scale));
  await page.locator('#faceToggleBtn').click();
  const handleSize = (await page.locator('[data-endpoint=a]').boundingBox()).width;
  assert.ok(handleSize <= (name === 'phone' ? 32 : 24), `A/B handle is too large: ${handleSize}px`);
  await page.locator('#mainZoomIn').click();
  assert.equal((await page.locator('[data-endpoint=a]').boundingBox()).width, handleSize);
  await dragHandle(page, 'a', 4, 0);
  back[0] = nmRoundedMicron(back[0] + 4 / (scale * 1.25));
  close((await coords(page))[0], back[0]);
  await page.locator('#mainZoomFit').click();
  await page.locator('#settingsTab').click();
  for (const [unit, multiplier] of [
    ['nm', 1000],
    ['mm', 0.001],
    ['um', 1],
  ]) {
    await page.locator('#xyUnitSelect').selectOption(unit);
    const values = await coords(page);
    values.forEach((value, i) => close(value, back[i] * multiplier));
  }
  await page.locator('[data-endpoint=a]').focus();
  await page.keyboard.press('ArrowRight');
  close((await coords(page))[0], nmRoundedMicron(back[0] + 1 / scale));
  await capture(page, `${name}-ab-edit`);
  await checkLayout(page);
  // Closing Slice hides only the parameter panel; geometry remains directly editable.
  await page.locator('#sectionControlsBtn').click();
  assert.equal(await page.locator('#sectionCoordsPanel').isHidden(), true);
  assert.equal(await page.locator('[data-endpoint=a]').isVisible(), true);
}

async function loadProject(page, project, name) {
  await page.locator('#settingsTab').click();
  await page.locator('#openProjectInput').setInputFiles({
    name: `${name}.wafercad`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(
    (filename) => document.querySelector('#statusText').textContent === `Opened ${filename}.`,
    `${name}.wafercad`,
  );
}

async function checkSectionSeams(page, project) {
  const { modelBoundsZ } = await import('../site/model.js');
  const [lo, hi] = modelBoundsZ(project.model);
  const pad = Math.max(1.5, (hi - lo) * 0.08);
  // Z=0 is uninterrupted substrate in every benchmark, including after etching.
  // Inspect actual canvas pixels across the old column boundaries at each DPR.
  const colors = await page.evaluate(
    ({ lo, hi, pad }) => {
      const canvas = document.querySelector('#sectionCanvas');
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const width = canvas.width / dpr,
        height = canvas.height / dpr;
      const row = Math.round((10 + ((hi + pad) / (hi - lo + 2 * pad)) * (height - 32)) * dpr);
      const start = Math.ceil((27 + (width - 37) * 0.1) * dpr);
      const end = Math.floor((27 + (width - 37) * 0.9) * dpr);
      const pixels = canvas.getContext('2d').getImageData(start, row, end - start, 1).data;
      const unique = new Set();
      for (let i = 0; i < pixels.length; i += 4) unique.add([...pixels.slice(i, i + 4)].join(','));
      return [...unique];
    },
    { lo, hi, pad },
  );
  const rgba = colors.map((color) => color.split(',').map(Number)),
    channelRange = [0, 1, 2, 3].map((channel) => {
      const values = rgba.map((value) => value[channel]);
      return Math.max(...values) - Math.min(...values);
    });
  assert.ok(
    channelRange.every((range) => range <= 1),
    `false Section seams: ${colors.join(' / ')}`,
  );
}

async function sectionMaterialThickness(page, hexColor, xFraction = 0.5) {
  return page.evaluate(
    ({ hexColor, xFraction }) => {
      const canvas = document.querySelector('#sectionCanvas'),
        dpr = Math.min(devicePixelRatio || 1, 2),
        cssWidth = canvas.width / dpr,
        x = Math.round((27 + (cssWidth - 37) * xFraction) * dpr),
        data = canvas.getContext('2d').getImageData(x, 0, 1, canvas.height).data,
        target = [
          parseInt(hexColor.slice(1, 3), 16),
          parseInt(hexColor.slice(3, 5), 16),
          parseInt(hexColor.slice(5, 7), 16),
        ],
        matches = [];
      for (let y = 0; y < canvas.height; y++) {
        const offset = y * 4,
          distance =
            Math.abs(data[offset] - target[0]) +
            Math.abs(data[offset + 1] - target[1]) +
            Math.abs(data[offset + 2] - target[2]);
        if (distance <= 12) matches.push(y);
      }
      let best = 0,
        run = 0,
        previous = -2;
      for (const y of matches) {
        run = y === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = y;
      }
      const zPxPerUm = Number(canvas.dataset.zPxPerUm);
      return best / dpr / zPxPerUm;
    },
    { hexColor, xFraction },
  );
}

async function checkROI(page, name) {
  const benchmark = await processBenchmark('island', 'conformal');
  const project = projectForBenchmark(benchmark);
  project.display.xyUnit = 'nm';
  // 10 nm features in a 100 nm base, with a high screen zoom.
  project.model = (await import('../site/model.js')).createModel({
    shape: 'rect',
    width: 0.1,
    height: 0.1,
    thickness: 10,
  });
  project.section = { a: [-0.04, 0], b: [0.04, 0] };
  project.roi = { type: 'rect', a: [-0.007123, -0.004567], b: [0.005222, 0.006789] };
  project.planViews.main.zoom = 4;
  await loadProject(page, project, `${name}-nm-roi`);
  await page.locator('#focusEditor > summary').click();
  await checkPopover(page, '#focusEditor .focus-popover', '#mainPanel');
  const width = Number(await page.locator('#roiWidth').inputValue());
  const height = Number(await page.locator('#roiHeight').inputValue());
  assert.equal(width, 12);
  assert.equal(height, 11);
  const center = [
    Number(await page.locator('#roiX').inputValue()),
    Number(await page.locator('#roiY').inputValue()),
  ];
  assert.deepEqual(center, [-1, 1]);
  for (const reference of ['top-left', 'bottom-left', 'top-right', 'bottom-right', 'center']) {
    await page.locator('#roiAnchorSelect').selectOption(reference);
    close(Number(await page.locator('#roiWidth').inputValue()), width);
    close(Number(await page.locator('#roiHeight').inputValue()), height);
  }
  close(Number(await page.locator('#roiX').inputValue()), center[0]);
  close(Number(await page.locator('#roiY').inputValue()), center[1]);
  await page.locator('#focusEditor > summary').click();
  await page.locator('#mainCanvas').scrollIntoViewIfNeeded();
  const box = await page.locator('#mainCanvas').boundingBox();
  const scale = Math.min((box.width - 68) / 0.1, (box.height - 68) / 0.1) * 4;
  const x = box.x + box.width / 2 - 0.007123 * scale;
  const y = box.y + box.height / 2 - 0.006789 * scale;
  await page.mouse.move(x + 2, y + 2);
  await page.mouse.down();
  await page.mouse.move(x - 9 + 2, y - 7 + 2, { steps: 5 });
  await page.mouse.up();
  await page.locator('#focusEditor > summary').click();
  assert.equal(
    Number(await page.locator('#roiWidth').inputValue()),
    Math.round(12.345 + (9 / scale) * 1000),
  );
  assert.equal(
    Number(await page.locator('#roiHeight').inputValue()),
    Math.round(11.356 + (7 / scale) * 1000),
  );
  await page.locator('#focusEditor .focus-popover').evaluate((element) => {
    element.scrollTop = 0;
  });
  await checkPopover(page, '#focusEditor .focus-popover', '#mainPanel');
  await capture(page, `${name}-nm-roi-editor`);
  await page.locator('#focusEditor > summary').click();

  project.roi = { type: 'circle', c: [0, 0], r: 0.005 };
  await loadProject(page, project, `${name}-circle`);
  await page.locator('#mainCanvas').scrollIntoViewIfNeeded();
  const circleBox = await page.locator('#mainCanvas').boundingBox();
  const circleScale = Math.min((circleBox.width - 68) / 0.1, (circleBox.height - 68) / 0.1) * 4;
  const hx = circleBox.x + circleBox.width / 2 - 0.005 * circleScale;
  const hy = circleBox.y + circleBox.height / 2 - 0.005 * circleScale;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx - 10, hy - 10, { steps: 5 });
  await page.mouse.up();
  await page.locator('#focusEditor > summary').click();
  assert.equal(
    Number(await page.locator('#roiRadius').inputValue()),
    Math.round(5 + (5 / circleScale) * 1000),
  );
  await page.locator('#focusEditor > summary').click();

  project.roi = { type: 'sector', c: [0, 0], r: 0.01, startDeg: 300, endDeg: 60 };
  await loadProject(page, project, `${name}-sector`);
  await page.locator('#focusEditor > summary').click();
  assert.equal((await page.locator('#roiShapeLabel').textContent()).trim(), 'Sector');
  assert.equal(await page.locator('#roiRadius').inputValue(), '10');
  assert.equal(await page.locator('#roiStartAngle').inputValue(), '300');
  assert.equal(await page.locator('#roiEndAngle').inputValue(), '60');
  await page.locator('#focusEditor > summary').click();
  await checkLayout(page);
}

try {
  for (const [name, viewport, touch] of [
    ['wide', { width: 1440, height: 900 }, false],
    ['medium', { width: 1000, height: 800 }, false],
    ['phone', { width: 390, height: 844 }, true],
  ]) {
    const { page, context } = await open(viewport, touch);
    await capture(page, `${name}-empty`);
    await checkLayout(page);
    await checkAB(page, name);
    await page.locator('#threePanel .three-opacity-control > summary').click();
    await checkPopover(page, '#threePanel .three-opacity-popover', '#threePanel');
    await page.locator('#threePanel .three-opacity-control > summary').click();
    for (const tab of ['base', 'mask', 'operation', 'snapshots', 'settings']) {
      await page.locator(`#${tab}Tab`).click();
      await capture(page, `${name}-tab-${tab}`);
      await checkLayout(page);
    }
    await checkCompactProcessLayout(page, name);
    await page.locator('#snapshotsTab').click();
    await page.locator('#saveSnapshotBtn').click();
    const savedCoords = await coords(page);
    await page.locator('#settingsTab').click();
    await page.locator('#xyUnitSelect').selectOption('nm');
    await page.locator('#snapshotsTab').click();
    await page.locator('.snapshot-action').first().click();
    await page.waitForFunction(
      () => /Restored snapshot/.test(document.getElementById('statusText')?.textContent || ''),
      null,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('#xyUnitSelect').inputValue(), 'um');
    assert.deepEqual(await coords(page), savedCoords);
    await capture(page, `${name}-snapshot-restored`);
    await page.locator('#maskTab').click();
    for (const sample of ['gds-alm', 'gds-basic-instances', 'oas-cblock']) {
      await page.locator('#sampleMaskSelect').selectOption(sample);
      await page.waitForFunction(
        (label) =>
          document.querySelector('#statusText').textContent.startsWith(label) &&
          document.querySelector('#statusText').textContent.includes('area objects;'),
        sampleById(sample).label,
      );
      assert.ok((await page.locator('#cellTree').textContent()).trim());
      const descriptor = sampleById(sample);
      const bytes = await readFile(new URL(`../site/${descriptor.path.slice(2)}`, import.meta.url));
      const imported = await parseLayoutFile(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        descriptor.path,
      );
      const bounds = imported.layout.bounds;
      const baseWidth =
        Math.max(1, ...['minX', 'minY', 'maxX', 'maxY'].map((key) => Math.abs(bounds[key]))) * 2.2;
      await page.locator('#baseTab').click();
      await page.locator('#baseWidth').fill(String(baseWidth));
      await page.locator('#applyBaseBtn').click();
      await page.locator('#maskTab').click();
      await capture(page, `${name}-${sample}`);
      await checkLayout(page);
    }
    for (const kind of ['step', 'trench', 'island']) {
      for (const growth of ['direct', 'conformal']) {
        const benchmark = await processBenchmark(kind, growth);
        const project = projectForBenchmark(benchmark);
        await writeFile(
          join(output, `${kind}-${growth}.wafercad`),
          JSON.stringify(project, null, 2),
        );
        await loadProject(page, project, `${kind}-${growth}`);
        await capture(page, `${name}-${kind}-${growth}`);
        await checkSectionSeams(page, project);
        await checkLayout(page);
        if (name === 'phone') {
          await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
          await capture(page, `${name}-${kind}-${growth}-section`);
        }
        if (name === 'wide') {
          const back = projectForBenchmark(await processBenchmark(kind, growth, 'back'));
          back.activeFace = 'back';
          await loadProject(page, back, `${kind}-${growth}-back`);
          const view = await page.locator('#threeHost canvas').boundingBox();
          await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.7);
          await page.mouse.down();
          await page.mouse.move(view.x + view.width / 2, view.y + view.height * 0.45, {
            steps: 12,
          });
          await page.mouse.up();
          await page.waitForTimeout(400);
          await capture(page, `${name}-${kind}-${growth}-back`);
          await checkSectionSeams(page, back);
        }
        const etched = structuredClone(project);
        const { applyOperation } = await import('../site/model.js');
        const { rectMulti } = await import('../site/vector-geometry.js');
        applyOperation(etched.model, {
          type: 'etch',
          thickness: 1.5,
          area: rectMulti(6, 8),
          face: 'front',
        });
        await writeFile(
          join(output, `${kind}-${growth}-etch.wafercad`),
          JSON.stringify(etched, null, 2),
        );
        await loadProject(page, etched, `${kind}-${growth}-etch`);
        await capture(page, `${name}-${kind}-${growth}-etch`);
        await checkSectionSeams(page, etched);
        await checkLayout(page);
        if (name === 'phone') {
          await page.locator('#sectionCanvas').scrollIntoViewIfNeeded();
          await capture(page, `${name}-${kind}-${growth}-etch-section`);
        }
      }
    }
    if (name === 'wide') {
      const { applyOperation, createModel } = await import('../site/model.js');
      const { rectMulti } = await import('../site/vector-geometry.js');
      const roughModel = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 }),
        roughArea = rectMulti(10, 12);
      applyOperation(roughModel, {
        type: 'etch',
        thickness: 1.5,
        face: 'front',
        area: roughArea,
        surface: {
          kind: 'rough',
          featureSize: 0.45,
          meanHeight: 0.6,
          featureCv: 0.3,
          heightCv: 0.35,
          geometryMode: 'ideal',
        },
      });
      applyOperation(roughModel, {
        type: 'add',
        name: 'Rough coat',
        thickness: 0.8,
        face: 'front',
        area: roughArea,
        growth: 'direct',
      });
      const roughProject = projectForBenchmark({
        model: roughModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, roughProject, 'wide-rough-buried-interface');
      await checkSectionSeams(page, roughProject);
      const normalThickness = await sectionMaterialThickness(page, '#6C8EBF'),
        normalZMax = await page.locator('#sectionCanvas').getAttribute('data-z-max-um');
      assert.ok(
        Math.abs(normalThickness - 0.8) < 0.06,
        `rough coating physical thickness changed: ${normalThickness} µm`,
      );
      assert.ok(Number(normalZMax) >= 4.8 - 1e-9, `rough Auto Z max too small: ${normalZMax}`);
      await capture(page, 'wide-rough-buried-interface');
      await page.locator('#sectionMaxBtn').click();
      await page.waitForTimeout(120);
      const maxThickness = await sectionMaterialThickness(page, '#6C8EBF');
      assert.ok(
        Math.abs(maxThickness - 0.8) < 0.04,
        `maximized rough coating thickness changed: ${maxThickness} µm`,
      );
      assert.ok(
        Math.abs(maxThickness - normalThickness) < 0.04,
        `rough coating thickness depends on zoom: ${normalThickness} vs ${maxThickness} µm`,
      );
      await capture(page, 'wide-rough-buried-interface-max');
      await page.locator('#sectionMaxBtn').click();
      await page.waitForTimeout(120);

      // 3D integration guardrails: clean opaque rough surfaces and sorted
      // translucent layers should remain layer-colored without screen-door noise.
      await page.locator('#threeMaxBtn').click();
      const roughCanvas = page.locator('#threeHost canvas'),
        fitLodZones = Number(await roughCanvas.getAttribute('data-rough-lod-zones')),
        fitTriangles = Number(await roughCanvas.getAttribute('data-rough-triangle-count')),
        fitSubdivisionTriangles = Number(
          await roughCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        fitSceneBudget = Number(
          await roughCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        fitPlanBuilds = Number(
          await roughCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        fitRoughRebuilds = Number(
          await roughCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        fitSpatialZoneBuilds = Number(
          await roughCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        fitBaseTriangulations = Number(
          await roughCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.ok(fitLodZones >= 1, `rough LOD diagnostics missing at Fit: ${fitLodZones}`);
      assert.ok(fitTriangles > 0, `rough triangle diagnostics missing at Fit: ${fitTriangles}`);
      assert.ok(
        fitSubdivisionTriangles <= fitSceneBudget,
        `rough subdivision budget exceeded at Fit: ${fitSubdivisionTriangles} > ${fitSceneBudget}`,
      );
      assert.ok(fitPlanBuilds >= 1, `surface plan build diagnostics missing: ${fitPlanBuilds}`);
      assert.ok(fitRoughRebuilds >= 1, `rough rebuild diagnostics missing: ${fitRoughRebuilds}`);
      assert.ok(fitSpatialZoneBuilds >= 1, `rough spatial zones were not prepared: ${fitSpatialZoneBuilds}`);
      assert.ok(
        fitBaseTriangulations >= fitSpatialZoneBuilds,
        `rough base triangulation cache is incomplete: ${fitBaseTriangulations} < ${fitSpatialZoneBuilds}`,
      );
      await capture(page, 'wide-rough-3d-opaque-max');

      await roughCanvas.hover();
      for (let step = 0; step < 8; step++) await page.mouse.wheel(0, -600);
      await page.waitForTimeout(320);
      const zoomLodZones = Number(await roughCanvas.getAttribute('data-rough-lod-zones')),
        zoomStitches = Number(await roughCanvas.getAttribute('data-rough-lod-stitches')),
        zoomTriangles = Number(await roughCanvas.getAttribute('data-rough-triangle-count')),
        zoomSubdivisionTriangles = Number(
          await roughCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        zoomSceneBudget = Number(
          await roughCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        zoomPlanBuilds = Number(
          await roughCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        zoomRoughRebuilds = Number(
          await roughCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        zoomSpatialZoneBuilds = Number(
          await roughCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        zoomBaseTriangulations = Number(
          await roughCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.equal(
        zoomLodZones,
        fitLodZones,
        `camera LOD changed the cached spatial zone count: ${fitLodZones} -> ${zoomLodZones}`,
      );
      assert.ok(zoomStitches > 0, `adaptive LOD zoom has no seam stitches: ${zoomStitches}`);
      assert.ok(zoomTriangles > 0, `adaptive LOD zoom lost rough triangles: ${zoomTriangles}`);
      assert.ok(
        zoomSubdivisionTriangles <= zoomSceneBudget,
        `rough subdivision budget exceeded after zoom: ${zoomSubdivisionTriangles} > ${zoomSceneBudget}`,
      );
      assert.equal(
        zoomPlanBuilds,
        fitPlanBuilds,
        `camera LOD rebuilt the static surface plan: ${fitPlanBuilds} -> ${zoomPlanBuilds}`,
      );
      assert.ok(
        zoomRoughRebuilds > fitRoughRebuilds,
        `camera zoom did not rebuild rough geometry: ${fitRoughRebuilds} -> ${zoomRoughRebuilds}`,
      );
      assert.equal(
        zoomSpatialZoneBuilds,
        fitSpatialZoneBuilds,
        `camera zoom rebuilt rough spatial zones: ${fitSpatialZoneBuilds} -> ${zoomSpatialZoneBuilds}`,
      );
      assert.equal(
        zoomBaseTriangulations,
        fitBaseTriangulations,
        `camera zoom retriangulated rough base geometry: ${fitBaseTriangulations} -> ${zoomBaseTriangulations}`,
      );
      await capture(page, 'wide-rough-3d-adaptive-zoom-max');
      await page.locator('#fit3dBtn').click();
      await page.waitForTimeout(180);
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-3d-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      // Multi-cap stress: several independent rough patches must share one
      // scene-wide subdivision budget, and camera LOD changes must not rebuild
      // the static ownership plan.
      const roughStressModel = createModel({
        shape: 'rect',
        width: 40,
        height: 40,
        thickness: 8,
      });
      for (const [index, [cx, cy]] of [
        [-10, -10],
        [10, -10],
        [-10, 10],
        [10, 10],
      ].entries()) {
        applyOperation(roughStressModel, {
          type: 'etch',
          thickness: 1 + index * 0.15,
          face: 'front',
          area: rectMulti(8, 8, cx, cy),
          surface: {
            kind: 'rough',
            featureSize: 0.35 + index * 0.04,
            meanHeight: 0.5,
            featureCv: 0.25,
            heightCv: 0.3,
            seed: 101 + index,
            morphology: 'stochastic',
            polarity: 'inverted',
            geometryMode: 'ideal',
          },
        });
      }
      const roughStressProject = projectForBenchmark({
        model: roughStressModel,
        section: { a: [-19, 0], b: [19, 0] },
      });
      await loadProject(page, roughStressProject, 'wide-rough-stress');
      await page.locator('#threeMaxBtn').click();
      await page.waitForTimeout(180);
      const stressCanvas = page.locator('#threeHost canvas'),
        stressBudget = Number(
          await stressCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        stressSubdivision = Number(
          await stressCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        stressPlanBuilds = Number(
          await stressCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        stressRebuilds = Number(
          await stressCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        stressSpatialZoneBuilds = Number(
          await stressCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        stressBaseTriangulations = Number(
          await stressCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.ok(stressBudget > 0, `rough stress budget missing: ${stressBudget}`);
      assert.ok(
        stressSubdivision <= stressBudget,
        `multi-cap rough subdivision exceeded global budget: ${stressSubdivision} > ${stressBudget}`,
      );
      await stressCanvas.hover();
      for (let step = 0; step < 5; step++) await page.mouse.wheel(0, -500);
      await page.waitForTimeout(280);
      const stressZoomPlanBuilds = Number(
          await stressCanvas.getAttribute('data-surface-plan-build-count'),
        ),
        stressZoomRebuilds = Number(
          await stressCanvas.getAttribute('data-rough-rebuild-count'),
        ),
        stressZoomBudget = Number(
          await stressCanvas.getAttribute('data-rough-scene-triangle-budget'),
        ),
        stressZoomSubdivision = Number(
          await stressCanvas.getAttribute('data-rough-subdivision-triangle-count'),
        ),
        stressZoomSpatialZoneBuilds = Number(
          await stressCanvas.getAttribute('data-rough-spatial-zone-build-count'),
        ),
        stressZoomBaseTriangulations = Number(
          await stressCanvas.getAttribute('data-rough-base-triangulation-count'),
        );
      assert.equal(
        stressZoomPlanBuilds,
        stressPlanBuilds,
        `multi-cap camera zoom rebuilt surface plan: ${stressPlanBuilds} -> ${stressZoomPlanBuilds}`,
      );
      assert.ok(
        stressZoomRebuilds > stressRebuilds,
        `multi-cap camera zoom did not rebuild rough meshes: ${stressRebuilds} -> ${stressZoomRebuilds}`,
      );
      assert.equal(
        stressZoomSpatialZoneBuilds,
        stressSpatialZoneBuilds,
        `multi-cap camera zoom rebuilt spatial zones: ${stressSpatialZoneBuilds} -> ${stressZoomSpatialZoneBuilds}`,
      );
      assert.equal(
        stressZoomBaseTriangulations,
        stressBaseTriangulations,
        `multi-cap camera zoom retriangulated base geometry: ${stressBaseTriangulations} -> ${stressZoomBaseTriangulations}`,
      );
      assert.ok(
        stressZoomSubdivision <= stressZoomBudget,
        `multi-cap zoom exceeded global budget: ${stressZoomSubdivision} > ${stressZoomBudget}`,
      );
      await capture(page, 'wide-rough-stress-global-budget');
      await page.locator('#threeMaxBtn').click();

      // Rough Etch -> Conformal regression: inherited rough interfaces are
      // buried material interfaces and must not create closure skirts inside 3D.
      const roughConformalModel = createModel({
        shape: 'rect',
        width: 20,
        height: 12,
        thickness: 8,
      });
      applyOperation(roughConformalModel, {
        type: 'etch',
        thickness: 1.5,
        face: 'front',
        area: rectMulti(10, 8),
        surface: {
          kind: 'rough',
          featureSize: 0.45,
          meanHeight: 0.6,
          featureCv: 0.3,
          heightCv: 0.35,
          morphology: 'stochastic',
          polarity: 'inverted',
          geometryMode: 'ideal',
        },
      });
      applyOperation(roughConformalModel, {
        type: 'add',
        name: 'Rough conformal coat',
        thickness: 0.8,
        face: 'front',
        area: roughConformalModel.boundary,
        growth: 'conformal',
      });
      const roughConformalProject = projectForBenchmark({
        model: roughConformalModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, roughConformalProject, 'wide-rough-conformal');
      await checkSectionSeams(page, roughConformalProject);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-conformal-3d-opaque-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      await capture(page, 'wide-rough-conformal-3d-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      // Opaque host material must occlude a buried Implant. Lowering global
      // 3D opacity reveals the same internal annotation volume.
      const implantModel = createModel({ shape: 'rect', width: 20, height: 12, thickness: 8 });
      applyOperation(implantModel, {
        type: 'implant',
        name: 'Buried implant',
        thickness: 1,
        face: 'front',
        area: rectMulti(10, 8),
        color: '#9B5DE5',
      });
      applyOperation(implantModel, {
        type: 'add',
        name: 'Opaque cap',
        thickness: 0.8,
        face: 'front',
        area: implantModel.boundary,
        growth: 'direct',
      });
      const implantProject = projectForBenchmark({
        model: implantModel,
        section: { a: [-9, 0], b: [9, 0] },
      });
      await loadProject(page, implantProject, 'wide-implant-buried');
      await page.locator('#threeMaxBtn').click();
      assert.equal(
        Number(await page.locator('#threeHost').getAttribute('data-implant-internal-count')),
        0,
        'Opaque 3D must not add buried implant volume meshes',
      );
      assert.equal(
        Number(await page.locator('#threeHost').getAttribute('data-implant-surface-count')),
        0,
        'Opaque 3D must not add a surface overlay for a fully buried implant',
      );
      await capture(page, 'wide-implant-buried-opaque-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('0.5');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);
      await page.locator('#threeMaxBtn').click();
      assert.ok(
        Number(await page.locator('#threeHost').getAttribute('data-implant-internal-count')) > 0,
        'Transparent 3D must add the buried implant volume for inspection',
      );
      await capture(page, 'wide-implant-buried-transparent-max');
      await page.locator('#threeMaxBtn').click();
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.locator('#threeOpacityRange').fill('1');
      await page.locator('#threePanel .three-opacity-control > summary').click();
      await page.waitForTimeout(120);

      await checkLayout(page);
    }

    await checkROI(page, name);
    await context.close();
    console.log(`${name}: A/B, units, ROI, tabs, imports and six process views passed`);
  }
  // Breakpoint edges catch wrap/overflow changes without multiplying every dataset.
  for (const width of [600, 601, 900, 901]) {
    const { page, context } = await open({ width, height: 900 });
    await checkLayout(page);
    await page.locator('#sectionControlsBtn').click();
    await capture(page, `breakpoint-${width}`);
    await checkLayout(page);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'report.json'), JSON.stringify({ cases, errors }, null, 2));
  const cards = cases
    .map(
      (name) =>
        `<figure><a href="${name}.png"><img src="${name}.png" loading="lazy"></a><figcaption>${name}</figcaption></figure>`,
    )
    .join('');
  await writeFile(
    join(output, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>WaferCAD product review</title><style>body{font:14px system-ui;margin:24px;background:#f4f6f8}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;background:white;padding:10px}img{width:100%;height:280px;object-fit:contain}figcaption{margin-top:8px}</style><h1>WaferCAD product review</h1><p>${cases.length} captures · actual Chromium/WebGL · 1440 / 1000 / 390 px plus breakpoint edges. Open each image to inspect full resolution.</p><main>${cards}</main>`,
  );
  console.log(`WaferCAD product regression: OK (${cases.length} captures)`);
} finally {
  await browser.close();
}
