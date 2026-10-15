// Reference-aligned Section cuts for independently inspecting literature reconstructions.
// Evidence is real Chromium output; it is not an automatic SEM-image similarity verdict.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  baseUrl,
  launchBrowser,
  newLegacyUiContext,
  waitForAppReady,
  waitForThreeReady,
  waitForCanvasSizeSync,
  canvasInkFraction,
  observePageErrors,
  waitForPaint,
} from './test-helpers/ui.mjs';
import { ensurePrimaryViewVisible } from './test-helpers/product.mjs';
import { loadProject } from './test-helpers/product-scientific.mjs';

const CASES = [
  {
    id: 'suspended-silica-microdisk',
    file: 'suspended-silica-microdisks',
    source: 'Basiri-Esfahani et al. 2019, Fig. 2a; Supplementary Fig. 10',
    cuts: [{ id: 'disk-diameter', a: [-170, 0], b: [170, 0] }],
  },
  {
    id: 'perc-point-contact-solar-cell',
    file: 'perc-solar-cells-point-contacts',
    source: 'Blakers et al. 1989, front and rear contact schematic',
    cuts: [
      { id: 'rear-point-contact', a: [-9300, -9000], b: [-8700, -9000] },
      { id: 'front-plated-stripe', a: [0, -7580], b: [0, -7420] },
    ],
  },
  {
    id: 'fully-textured-perovskite-silicon-tandem',
    file: 'fully-textured-perovskite-silicon-tandem',
    source: 'Sahli et al. 2018 Supplementary Fig. S3a–e',
    cuts: [
      { id: 'active-between-grid', a: [-16, 0], b: [16, 0] },
      { id: 'across-ag-grid-finger', a: [0, 1700], b: [0, 2300] },
    ],
  },
];

const requested = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);
const selected = requested ? CASES.filter((item) => item.id === requested) : CASES;
assert.ok(selected.length > 0, 'No matching literature visual evidence case');

const output = 'test-results/literature-figure-cuts';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = [];

try {
  for (const item of selected) {
    const context = await newLegacyUiContext(browser, {
      viewport: { width: 1560, height: 960 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = observePageErrors(page);
    try {
      await page.goto(baseUrl + '/app-legacy.html', {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await waitForAppReady(page);
      const source = JSON.parse(
        await readFile(new URL('../site/examples/' + item.file + '.wafercad', import.meta.url)),
      );
      const examples = [];
      for (const cut of item.cuts) {
        const project = { ...source, section: { a: cut.a, b: cut.b } };
        await loadProject(page, project, item.id + '-' + cut.id);
        await ensurePrimaryViewVisible(page, 'section');
        await waitForCanvasSizeSync(page, '#sectionCanvas');
        await waitForPaint(page);
        const sectionInk = await canvasInkFraction(page, '#sectionCanvas');
        assert.ok(sectionInk > 0.008, item.id + ' ' + cut.id + ': Section is blank');
        const prefix = item.id + '-' + cut.id;
        await page.locator('#sectionPanel').screenshot({
          path: join(output, prefix + '-section.png'),
          animations: 'disabled',
          timeout: 120000,
        });
        if (examples.length === 0) {
          for (const view of ['main', 'mask']) {
            await ensurePrimaryViewVisible(page, view);
            await waitForPaint(page);
            await page.locator('#' + view + 'Panel').screenshot({
              path: join(output, item.id + '-' + view + '.png'),
              animations: 'disabled',
              timeout: 120000,
            });
          }
          await ensurePrimaryViewVisible(page, 'three');
          await waitForThreeReady(page, 180000);
          await page.locator('#threePanel').screenshot({
            path: join(output, item.id + '-three.png'),
            animations: 'disabled',
            timeout: 120000,
          });
        }
        examples.push({
          id: cut.id,
          a: cut.a,
          b: cut.b,
          sectionInk,
          figureComparison: 'PENDING_REVIEW',
        });
      }
      assert.deepEqual(errors, [], item.id + ': browser errors');
      report.push({ example: item.id, source: item.source, cuts: examples });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(join(output, 'figure-cut-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ evidenceComplete: true, report }, null, 2));
