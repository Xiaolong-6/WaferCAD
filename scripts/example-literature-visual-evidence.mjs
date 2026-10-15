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
      {
        id: 'rear-contact-magnified',
        a: [-9120, -9000],
        b: [-8880, -9000],
        zFocus: { top: 139.45, bottom: -139.7 },
        probes: [
          { id: 'rear-silicon-contact', xy: [-9000, -9000], rearOxide: false },
          { id: 'insulated-neighbor', xy: [-8500, -8500], rearOxide: true },
        ],
      },
      {
        id: 'rear-oxide-control',
        a: [-8620, -8500],
        b: [-8380, -8500],
        zFocus: { top: 139.45, bottom: -139.7 },
        probes: [{ id: 'insulated-neighbor', xy: [-8500, -8500], rearOxide: true }],
      },
    ],
  },
  {
    id: 'fully-textured-perovskite-silicon-tandem',
    file: 'fully-textured-perovskite-silicon-tandem',
    source: 'Sahli et al. 2018 Supplementary Fig. S3a–e',
    cuts: [
      { id: 'active-between-grid', a: [-16, 0], b: [16, 0] },
      { id: 'across-ag-grid-finger', a: [0, 1700], b: [0, 2300] },
      {
        id: 'ag-finger-leading-edge-magnified',
        a: [0, 1870],
        b: [0, 1930],
        zFocus: { top: 125.46, bottom: -125.65 },
        probes: [
          { id: 'outside-grid', xy: [0, 1899], agGrid: false },
          { id: 'inside-grid', xy: [0, 1901], agGrid: true },
        ],
      },
      {
        id: 'ag-finger-center-magnified',
        a: [0, 1970],
        b: [0, 2030],
        zFocus: { top: 125.46, bottom: -125.65 },
        probes: [{ id: 'inside-grid', xy: [0, 2000], agGrid: true }],
      },
      {
        id: 'between-grid-control',
        a: [0, 1770],
        b: [0, 1830],
        zFocus: { top: 125.46, bottom: -125.65 },
        probes: [{ id: 'outside-grid', xy: [0, 1800], agGrid: false }],
      },
    ],
  },
];

// Scientific reference values are read from the saved physical XY/Z owner at
// each point. Screenshots alone cannot establish a 110 nm dielectric opening.
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function materialStackAt(project, point) {
  const owners = project.model.regions.filter((region) =>
    project.sharedGeometries[region.geomRef].some(
      (polygon) =>
        pointInRing(point, polygon[0]) &&
        !polygon.slice(1).some((hole) => pointInRing(point, hole)),
    ),
  );
  assert.equal(owners.length, 1, 'Exactly one physical owner expected at ' + point);
  return owners[0].stack.map((segment) => ({
    material: project.model.layers.find((layer) => layer.id === segment.layerId)?.name,
    z0Um: segment.z0,
    z1Um: segment.z1,
    role: segment.role || null,
  }));
}

function evaluateProbes(project, probes = []) {
  return probes.map((probe) => {
    const stack = materialStackAt(project, probe.xy);
    if (typeof probe.rearOxide === 'boolean') {
      const present = stack.some(
        (layer) => layer.material?.includes('passivation') && layer.z1Um < 0,
      );
      assert.equal(present, probe.rearOxide, probe.id + ': wrong rear oxide continuity');
      assert.ok(
        stack.some((layer) => layer.material?.includes('Al rear')),
        probe.id + ': missing rear Al',
      );
      assert.ok(
        stack.some((layer) => layer.material === 'Base'),
        probe.id + ': missing silicon',
      );
    }
    if (typeof probe.agGrid === 'boolean') {
      const metal = stack.find((layer) => layer.material?.startsWith('Ag grid SURROGATE'));
      assert.equal(Boolean(metal), probe.agGrid, probe.id + ': wrong local Ag finger mask');
      if (metal) {
        assert.ok(
          Math.abs(metal.z1Um - metal.z0Um - 0.12) < 1e-8,
          probe.id + ': Ag finger thickness changed',
        );
      }
      assert.ok(
        stack.some((layer) => layer.material?.startsWith('IZO active electrode')),
        probe.id + ': missing IZO under/away from grid',
      );
    }
    return { id: probe.id, xyUm: probe.xy, stack };
  });
}

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
        // Saved presentation preferences may open a Detail ROI overlay that
        // obscures the scientific cut. Keep the underlying geometry intact.
        const project = {
          ...source,
          display: {
            ...source.display,
            sectionDetailRoi: null,
            ...(cut.zFocus
              ? {
                  sectionCollapse: { ...cut.zFocus, enabled: true },
                  sectionScaleMode: 'auto',
                  sectionShowBorders: true,
                }
              : {}),
          },
          section: { a: cut.a, b: cut.b },
        };
        const probes = evaluateProbes(source, cut.probes);
        await loadProject(page, project, item.id + '-' + cut.id);
        // Section is a separate dock, not a primary view tab (Main/Mask/3D).
        const sectionPanel = page.locator('#sectionPanel');
        await sectionPanel.waitFor({ state: 'visible' });
        if (await sectionPanel.locator('.section-body').isHidden()) {
          await sectionPanel.locator('.workstation-section-collapse').click();
        }
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
          zFocus: cut.zFocus || null,
          physicalProbes: probes,
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
