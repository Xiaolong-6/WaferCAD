import { openMetalensUnitProject } from './project-fixtures.mjs';
// Compare M2 prototype chrome and Manual editor against the real integrated v2 UI.
// Raster screenshots are review artifacts; no unapproved pixel baseline is created.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const out = resolve('test-results/ui-v2-m2-parity');
await mkdir(out, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  comparator: 'M2 prototype chrome vs real Stage C Manual',
  result: 'running',
  cases: [],
};
const browser = await launchBrowser();
const expected = [
  'Operation',
  'Material / target',
  'Thickness / depth',
  'Layer name',
  'Coverage',
  'Active face',
  'Area',
  'Also add to Recipe',
];
const normalize = (label) =>
  label
    .replace(/\s*·\s*(µm|nm|mm)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
function requireOrdered(labels, contract, kind) {
  let cursor = -1;
  for (const label of contract) {
    const next = labels.findIndex((entry, index) => index > cursor && entry === label);
    assert.ok(
      next >= 0,
      `${kind}: expected ${label} after index ${cursor}; got ${labels.join(' | ')}`,
    );
    cursor = next;
  }
}
async function capture(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const node = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!node || !node.checkVisibility()) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const labels = [...document.querySelectorAll('.p-inspector label .wc-label')]
      .filter((node) => node.checkVisibility())
      .map((node) => node.textContent.trim());
    const fieldLabels = [...document.querySelectorAll('.p-inspector label .wc-label')].filter(
      (node) => node.checkVisibility(),
    );
    const operationLabel = fieldLabels[0];
    const modes = box('.p-inspector [aria-label="Process modes"]');
    const gapAfterModes =
      modes && operationLabel
        ? operationLabel.getBoundingClientRect().top - modes.y - modes.height
        : null;
    const areaLabel = fieldLabels.find((node) => node.textContent.trim() === 'Area');
    const areaOptions = areaLabel
      ? [...areaLabel.closest('label').querySelectorAll('option')].map((node) =>
          node.textContent.trim(),
        )
      : [];
    const root = document.querySelector('.p-workbench');
    const style = getComputedStyle(root);
    const stepper = [...document.querySelectorAll('.p-inspector .p-stepper')].find((node) =>
      node.querySelector('input'),
    );
    const thickness = stepper && {
      box: box(stepper),
      label: box(stepper.querySelector('.wc-label')),
      input: box(stepper.querySelector('input')),
      buttons: [...stepper.querySelectorAll('.p-actions button')].map(box),
    };
    return {
      root: box('.p-workbench'),
      topbar: box('.p-topbar'),
      nav: box('.p-nav'),
      inspector: box('.p-inspector'),
      stage: box('.p-stage'),
      labels,
      thickness,
      gapAfterModes,
      areaOptions,
      font: style.fontFamily,
      theme: document.documentElement.dataset.theme,
      overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      chrome: [...document.querySelectorAll('.p-nav [data-action^="domain:"]')].map(
        (node) => node.dataset.action,
      ),
    };
  });
}
const near = (a, b, tolerance, subject) => {
  assert.ok(Math.abs(a - b) <= tolerance, `${subject}: M2 ${a}, real ${b}`);
};
try {
  report.browser = browser.version();
  for (const width of [1440, 1024, 768, 390]) {
    const opened = [];
    try {
      for (const [role, url] of [
        ['m2', `${base}/app-v2.html?domain=process`],
        ['real', `${base}/app.html?start=example&example=metalens`],
      ]) {
        const { page, context } = await newUiPage(browser, {
          viewport: { width, height: 960 },
        });
        opened.push({ role, page, context });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        if (role === 'real') await openMetalensUnitProject(page, base);
        else await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
          timeout: 120000,
        });
        if (role === 'real' && !(await page.locator('.p-nav').isVisible()))
          await page.locator('[data-action="show-editor"]').click();
        const process = page.locator('.p-nav [data-action="domain:process"]');
        await process.click();
        await waitForPaint(page);
        await page
          .locator('.p-inspector')
          .screenshot({ path: resolve(out, `${role}-manual-${width}.png`) });
        assert.deepEqual(errors, [], `${role} page errors`);
      }
      const m2 = await capture(opened[0].page);
      const real = await capture(opened[1].page);
      assert.equal(m2.theme, 'light');
      assert.equal(real.theme, m2.theme);
      assert.deepEqual(real.chrome, m2.chrome, 'M2 primary navigation identity and order');
      assert.equal(real.font, m2.font, 'M2 typography family');
      assert.equal(real.overflowX, 0, 'Real shell must fit the viewport');
      assert.ok(m2.root && real.root && m2.nav && real.nav && m2.inspector && real.inspector);
      near(m2.root.width, real.root.width, 2, 'Workbench width');
      near(m2.nav.width, real.nav.width, 2, 'Primary navigation width');
      near(m2.inspector.width, real.inspector.width, 2, 'Manual inspector width');
      if (width >= 821 && m2.stage && real.stage)
        near(m2.stage.x - m2.root.x, real.stage.x - real.root.x, 2, 'Canvas column origin');
      const m2Labels = m2.labels.map(normalize);
      const realLabels = real.labels.map(normalize);
      requireOrdered(m2Labels, expected, 'M2 source');
      requireOrdered(realLabels, expected, 'Live v2');
      assert.deepEqual(real.areaOptions, m2.areaOptions, 'M2 Area choice wording and order');
      assert.ok(Number.isFinite(m2.gapAfterModes) && Number.isFinite(real.gapAfterModes));
      near(m2.gapAfterModes, real.gapAfterModes, 2, 'M2 mode-to-Manual top spacing');
      for (const [kind, stepper] of [
        ['M2', m2.thickness],
        ['real', real.thickness],
      ]) {
        assert.ok(stepper?.box && stepper.label && stepper.input, `${kind} labelled stepper`);
        assert.equal(stepper.buttons.length, 2, `${kind} stepper owns +/- controls`);
        assert.ok(
          stepper.label.y + stepper.label.height <= stepper.input.y + 2,
          `${kind} stepper label must be above, not beside, the input`,
        );
        near(stepper.buttons[0].y, stepper.buttons[1].y, 2, `${kind} +/- horizontal row`);
        assert.ok(
          stepper.buttons[0].x >= stepper.input.x + stepper.input.width - 2,
          `${kind} +/- controls must follow the input in the same row`,
        );
      }
      near(m2.thickness.box.height, real.thickness.box.height, 2, 'M2 stepper total height');
      near(m2.thickness.input.width, real.thickness.input.width, 2, 'M2 stepper input width');
      report.cases.push({ width, result: 'pass', m2, real });
      console.log(`M2 live parity ${width}px: chrome, Manual control order and layout PASS`);
    } catch (error) {
      report.cases.push({ width, result: 'fail', error: error.stack || error.message });
      console.error(`M2 live parity ${width}px failed:`, error.stack || error.message);
      throw error;
    } finally {
      await Promise.all(opened.map(({ context }) => context.close()));
    }
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
