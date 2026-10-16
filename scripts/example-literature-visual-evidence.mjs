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
import {
  closeFunctionPanel,
  ensurePrimaryViewVisible,
  openFunctionPanel,
} from './test-helpers/product.mjs';
import { exportCurrentProject, loadProject } from './test-helpers/product-scientific.mjs';

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
        detailRois: [
          { id: 'ridge', x: 0.46, y: 0.07, width: 0.08, height: 0.23 },
          { id: 'valley', x: 0.46, y: 0.34, width: 0.08, height: 0.23 },
        ],
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
        detailRois: [
          { id: 'ridge', x: 0.46, y: 0.07, width: 0.08, height: 0.23 },
          { id: 'valley', x: 0.46, y: 0.34, width: 0.08, height: 0.23 },
        ],
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
  {
    id: 'three-tier-silicon-jlfets',
    file: 'three-tier-silicon-jlfets',
    source: 'Lam et al. 2026, Figs. 1–2 structure; Fig. 3 wafer-scale tier maps, not author GDS',
    cuts: [
      {
        id: 'three-tier-channel-to-pads',
        a: [-720, 0],
        b: [720, 0],
        zFocus: { top: 250.08, bottom: -249.99 },
        probes: [
          {
            id: 'three-tier-gate-center',
            xy: [0, 0],
            present: [
              'T1 Si membrane',
              'T2 Si membrane',
              'T3 Si membrane',
              'T1 HfO2 gate',
              'T2 HfO2 gate',
              'T3 HfO2 gate',
              'T1 Gate metal',
              'T2 Gate metal',
              'T3 Gate metal',
            ],
            absent: ['T1 S/D metal', 'T2 S/D metal', 'T3 S/D metal'],
          },
          {
            id: 'left-sd-pad',
            xy: [-575, 0],
            present: [
              'T1 Si membrane',
              'T2 Si membrane',
              'T3 Si membrane',
              'T1 S/D metal',
              'T2 S/D metal',
              'T3 S/D metal',
            ],
            absent: ['T1 HfO2 gate', 'T2 HfO2 gate', 'T3 HfO2 gate'],
          },
          {
            id: 'right-sd-pad',
            xy: [575, 0],
            present: [
              'T1 Si membrane',
              'T2 Si membrane',
              'T3 Si membrane',
              'T1 S/D metal',
              'T2 S/D metal',
              'T3 S/D metal',
            ],
            absent: ['T1 HfO2 gate', 'T2 HfO2 gate', 'T3 HfO2 gate'],
          },
        ],
      },
      {
        id: 'central-gate-detail',
        a: [-80, 0],
        b: [80, 0],
        zFocus: { top: 250.08, bottom: -249.99 },
        probes: [
          {
            id: 'center',
            xy: [0, 0],
            present: ['T1 Si membrane', 'T2 Si membrane', 'T3 Si membrane'],
          },
        ],
      },
      {
        id: 'conformal-gate-sidewall-detail',
        a: [-720, 0],
        b: [-670, 0],
        zFocus: { top: 250.08, bottom: -249.99 },
        probes: [
          {
            id: 'left-gate-sidewall',
            xy: [-700.005, 0],
            present: ['T1 HfO2 gate', 'T2 HfO2 gate', 'T3 HfO2 gate'],
            absent: ['T1 Si membrane', 'T2 Si membrane', 'T3 Si membrane'],
          },
        ],
      },
    ],
  },
  {
    id: 'm3d-selfpowered-heterogeneous-ic',
    file: 'm3d-selfpowered-full-replay',
    source: 'Ghosh M3D reconstructed power-via interfaces; publication panel not yet calibrated',
    cuts: [
      {
        id: 'power-via-both-tiers',
        a: [12, -5.3],
        b: [20, -5.3],
        probes: [
          {
            id: 'first-power-via',
            xy: [16, -5.3],
            present: ['M3D Ti power via 120nm', 'M3D via2 Ti 2nm', 'M3D via2 Au 30nm'],
          },
          {
            id: 'second-power-via',
            xy: [16, 5.3],
            present: ['M3D Ti power via 120nm', 'M3D via2 Ni 28nm'],
          },
        ],
      },
      {
        id: 'data-via-transfer',
        a: [12, 0],
        b: [20, 0],
        probes: [
          {
            id: 'data-via-contact',
            xy: [16, 0],
            present: ['M3D MoS2 bridge Au 10nm', 'M3D via2 Ti 2nm', 'M3D via2 Au 30nm'],
          },
        ],
      },
    ],
  },
  {
    id: 'magic-1000-mos2-beol',
    file: 'magic-1000-mos2-beol',
    source: 'Fan MAGIC-1000 Fig. 1 local BEOL/Gate proxy; 40×24 µm, not author GDS',
    cuts: [
      {
        id: 'beol-four-metal-levels',
        a: [-10, -4],
        b: [10, -4],
        probes: [
          {
            id: 'left-four-levels',
            xy: [-7, -4],
            present: ['M4 Al conductor', 'V34 W fill', 'V23 W fill', 'V12 W fill'],
          },
          {
            id: 'right-four-levels',
            xy: [7, 4],
            present: ['M1 Al conductor', 'Via (to W gate) W fill'],
          },
        ],
      },
      {
        id: 'mos2-gate-and-alox',
        a: [-10, 4],
        b: [10, 4],
        probes: [
          {
            id: 'enhancement-gate',
            xy: [7, 4],
            present: ['W bottom gate 400nm', 'ALD HfO2 10nm', 'Monolayer MoS2'],
            absent: ['D-mode AlOx coating'],
          },
          {
            id: 'depletion-surrogate',
            xy: [-7, 4],
            present: ['D-mode AlOx coating'],
          },
        ],
      },
    ],
  },
  {
    id: 'tio2-metalens-four-unit',
    file: 'tio2-metalens-four-unit-process',
    source:
      'Wang TiO2 metalens 2021 Figs. 2–3 illustrative four-meta-atom geometry; not optimized GDS',
    cuts: [
      {
        id: 'two-nanopillar-diameters',
        a: [-2.3, 1.1],
        b: [2.3, 1.1],
        probes: [
          { id: 'negative-x-annular-pillar', xy: [-1.2, 1.1], present: ['TiO2', 'ITO'] },
          { id: 'positive-x-pillar', xy: [1.1, 1.1], present: ['TiO2', 'ITO'] },
          { id: 'substrate-control', xy: [0, 0], present: ['ITO'], absent: ['TiO2'] },
        ],
      },
      { id: 'opposite-nanopillar-row', a: [-2.3, -1.1], b: [2.3, -1.1] },
    ],
  },
  // Branch evidence always selects a real History Variant in the browser. The
  // four models are never synthesized or replaced outside the History UI.
  {
    id: 'photodetector-black-si-final',
    file: 'photodetector-literature-examples',
    variant: 'black-si-fig1a-final',
    source: 'Setälä et al. 2023, Black-Si Fig. 1a; FINAL protected ALD variant',
    expected: { substrate: 'n- Si (111)', implants: 2, electrical: 0 },
    cuts: [
      {
        id: 'active-ald-protected',
        a: [-2600, 0],
        b: [-2100, 0],
        zFocus: { top: 174.0, bottom: -174.7 },
        probes: [
          {
            id: 'active-passivated',
            xy: [0, 0],
            present: ['ALD Al2O3'],
            absent: ['Front sputtered Al'],
          },
          { id: 'outer-passivated', xy: [-3200, 0], present: ['ALD Al2O3', 'Thermal SiO2 650 nm'] },
        ],
      },
      { id: 'whole-diameter', a: [-3400, 0], b: [3400, 0] },
    ],
  },
  {
    id: 'photodetector-black-si-qa',
    file: 'photodetector-literature-examples',
    variant: 'black-si-fig1a-qa',
    source: 'Setälä et al. 2023, Black-Si Fig. 1a; deliberately destructive QA overetch',
    expected: { substrate: 'n- Si (111)', implants: 2, electrical: 0 },
    cuts: [
      {
        id: 'active-ald-overetched',
        a: [-2600, 0],
        b: [-2100, 0],
        zFocus: { top: 174.0, bottom: -174.7 },
        probes: [
          { id: 'active-overetched', xy: [0, 0], absent: ['ALD Al2O3', 'Front sputtered Al'] },
          {
            id: 'outer-still-passivated',
            xy: [-3200, 0],
            present: ['ALD Al2O3', 'Thermal SiO2 650 nm'],
          },
        ],
      },
      { id: 'whole-diameter', a: [-3400, 0], b: [3400, 0] },
    ],
  },
  {
    id: 'photodetector-ge-a',
    file: 'photodetector-literature-examples',
    variant: 'ge-fig15-a',
    source: 'Hanchen Liu 2026 doctoral thesis Fig. 15a; full-area Al2O3 inversion interface',
    expected: { substrate: 'n-Ge Sb', implants: 2, electrical: 1 },
    cuts: [
      {
        id: 'oxide-free-inactive-control',
        a: [-3400, 0],
        b: [-2600, 0],
        zFocus: { top: 150.15, bottom: -150.8 },
        probes: [
          {
            id: 'ge-a-outside',
            xy: [-3200, 0],
            present: ['Passivation ALD Al2O3'],
            absent: ['SiO2 inactive'],
          },
          {
            id: 'ge-a-center',
            xy: [0, 0],
            present: ['Passivation ALD Al2O3'],
            absent: ['SiO2 inactive'],
          },
        ],
      },
      { id: 'whole-diameter', a: [-3400, 0], b: [3400, 0] },
    ],
  },
  {
    id: 'photodetector-ge-b',
    file: 'photodetector-literature-examples',
    variant: 'ge-fig15-b',
    source: 'Hanchen Liu 2026 doctoral thesis Fig. 15b; inactive SiO2/Al2O3 isolation',
    expected: { substrate: 'n-Ge Sb', implants: 2, electrical: 2 },
    cuts: [
      {
        id: 'inactive-oxide-contact',
        a: [-3400, 0],
        b: [-2600, 0],
        zFocus: { top: 150.15, bottom: -150.8 },
        probes: [
          {
            id: 'ge-b-outside',
            xy: [-3200, 0],
            present: ['SiO2 inactive', 'Passivation ALD Al2O3'],
          },
          {
            id: 'ge-b-active',
            xy: [0, 0],
            present: ['Passivation ALD Al2O3'],
            absent: ['SiO2 inactive'],
          },
        ],
      },
      { id: 'whole-diameter', a: [-3400, 0], b: [3400, 0] },
    ],
  },
];

// Expose the distinction between paper-visible faceting and the physical
// 2.5D material intervals. A procedural pyramid drawn in Section is not a
// polygonally faceted semiconductor interface for etch/deposit simulation.
function facetTopologyEvidence(project) {
  const substrate = project.model.layers.find((layer) => layer.id === 'base');
  assert.ok(substrate, 'Saved figure example has no physical base substrate');
  const intervals = project.model.regions.flatMap((region) =>
    region.stack.filter((segment) => segment.layerId === substrate.id),
  );
  assert.ok(intervals.length > 0, 'No saved physical silicon material');
  const topPlanes = [...new Set(intervals.map((segment) => segment.z1))].sort((a, b) => a - b);
  const hasDisplayPyramids = intervals.some(
    (segment) => segment.frontSurface?.morphology === 'pyramid',
  );
  return {
    substrate: substrate.name,
    canonicalSubstrateTopPlanesUm: topPlanes,
    displayPyramids: hasDisplayPyramids,
    status:
      hasDisplayPyramids && topPlanes.length === 1
        ? 'PROCEDURAL_PYRAMIDS_ONLY__PHYSICAL_FACETS_NOT_VERIFIED'
        : 'PAPER_FACET_TOPOLOGY_NOT_YET_COMPARED',
  };
}

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

// The Fig. 3 source uses lossless shared-assets-v3 polygon templates.
// Decode quantized XY deltas for scientific point probes instead of treating
// compressed [templateId, offsetX, offsetY] tuples as physical polygons.
function regionPhysicalPolygons(project, region) {
  const geometry = region.geom || project.sharedGeometries?.[region.geomRef] || [];
  if (!project.sharedPolygonTemplates || typeof geometry[0]?.[0] !== 'number') {
    return geometry;
  }
  // Older lossless shared-assets-v3 examples omit the explicit quantum.
  // The canonical project reader defines a 0.0001 µm default for this
  // encoding; never infer arbitrary XY scales for unknown formats.
  const encoding = project.storage?.encoding;
  const quantum =
    project.storage?.lengthQuantumUm ??
    (encoding === 'shared-assets-v3' && project.storage?.lossless === true ? 0.0001 : null);
  assert.ok(Number.isFinite(quantum) && quantum > 0, 'Missing shared geometry quantum');
  return geometry.map(([templateId, originX, originY]) => {
    const template = project.sharedPolygonTemplates[templateId];
    assert.ok(template, 'Unresolved geometry template ' + templateId);
    if (template.raw) {
      assert.ok(
        Array.isArray(template.raw) && originX === undefined && originY === undefined,
        'Invalid lossless raw polygon placement',
      );
      return template.raw;
    }
    assert.ok(
      template.rings?.length && Number.isSafeInteger(originX) && Number.isSafeInteger(originY),
      'Invalid packed polygon placement',
    );
    return template.rings.map((deltas) => {
      let x = originX;
      let y = originY;
      const ring = [];
      for (let i = 0; i < deltas.length; i += 2) {
        x += deltas[i];
        y += deltas[i + 1];
        ring.push([x * quantum, y * quantum]);
      }
      return ring;
    });
  });
}

function materialStackAt(project, point) {
  const owners = project.model.regions.filter((region) =>
    regionPhysicalPolygons(project, region).some(
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
    for (const name of probe.present || []) {
      assert.ok(
        stack.some((entry) => entry.material?.includes(name)),
        probe.id + ': missing expected material ' + name,
      );
    }
    for (const name of probe.absent || []) {
      assert.ok(
        !stack.some((entry) => entry.material?.includes(name)),
        probe.id + ': unexpectedly retained ' + name,
      );
    }
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

async function selectHistoryVariant(page, branchId) {
  await openFunctionPanel(page, 'snapshots', { timeout: 30000 });
  const variant = page.locator(`.history-variant[data-variant-id="${branchId}"]`);
  await variant.waitFor({ state: 'attached', timeout: 30000 });
  const parentIds = await variant.evaluate((element) => {
    const ids = [];
    let parent = element.parentElement?.closest('.history-variant');
    while (parent) {
      ids.unshift(parent.dataset.variantId);
      parent = parent.parentElement?.closest('.history-variant');
    }
    return ids;
  });
  for (const id of parentIds) {
    const parent = page.locator(`.history-variant[data-variant-id="${id}"]`);
    const body = parent.locator(':scope > .history-variant-body');
    if (await body.evaluate((element) => element.hidden)) {
      await parent.locator(':scope > .history-variant-head .history-variant-toggle').click();
    }
  }
  await variant.locator(':scope > .history-variant-head .history-variant-name').click();
  await page.waitForFunction(
    (id) =>
      document.querySelector(`.history-variant[data-variant-id="${id}"]`)?.dataset.active ===
      'true',
    branchId,
    { timeout: 30000 },
  );
  await closeFunctionPanel(page);
}

const requested = process.argv.find((arg) => arg.startsWith('--id='))?.slice(5);
const ids = requested?.split(',').filter(Boolean) || [];
assert.equal(new Set(ids).size, ids.length, 'Repeated literature figure case identifier');
const selected = ids.length ? ids.map((id) => CASES.find((item) => item.id === id)) : CASES;
assert.ok(selected.length > 0 && selected.every(Boolean), 'No matching literature visual evidence case');

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
      let source = JSON.parse(
        await readFile(new URL('../site/examples/' + item.file + '.wafercad', import.meta.url)),
      );
      if (item.variant) {
        await loadProject(page, source, item.id + '-original');
        await selectHistoryVariant(page, item.variant);
        source = await exportCurrentProject(page, 120000);
        assert.equal(
          source.snapshotBranches.activeBranchId,
          item.variant,
          item.id + ': browser export failed to restore the requested Variant',
        );
        assert.ok(
          source.model.layers.some((layer) => layer.name.startsWith(item.expected.substrate)),
          item.id + ': wrong substrate after History restore',
        );
        assert.equal(source.model.implants.length, item.expected.implants);
        assert.equal(source.model.electricalRegions.length, item.expected.electrical);
      }
      const examples = [];
      const largeSource = item.id === 'm3d-selfpowered-heterogeneous-ic';
      if (largeSource) {
        // Expanded mixed raw/delta polygons are significantly heavier than
        // the scalar examples, but still require an explicit bounded import.
        page.setDefaultTimeout(90000);
      }
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
        const loadStarted = Date.now();
        try {
          await loadProject(page, project, item.id + '-' + cut.id);
        } catch (error) {
          const status = await page
            .locator('#statusText')
            .textContent()
            .catch(() => 'unavailable');
          const diagnostic = join(output, item.id + '-' + cut.id + '-import-failure.png');
          await page.screenshot({ path: diagnostic }).catch(() => {});
          throw new Error(
            item.id + ': project import incomplete; status=' + status + '; ' + error.message,
          );
        }
        const loadMs = Date.now() - loadStarted;
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
        const detailEvidence = [];
        for (const roi of cut.detailRois || []) {
          // Production Section Detail renderer redraws the source model into
          // its own canvas, rather than scaling an already-rasterized screenshot.
          await loadProject(
            page,
            {
              ...project,
              display: { ...project.display, sectionDetailRoi: roi },
            },
            prefix + '-' + roi.id + '-detail',
          );
          const inset = page.locator('#sectionDetailInsetCanvas');
          await inset.waitFor({ state: 'visible' });
          await waitForPaint(page);
          const ink = await canvasInkFraction(page, '#sectionDetailInsetCanvas');
          assert.ok(ink > 0.008, prefix + '-' + roi.id + ': detail inset is blank');
          await inset.screenshot({
            path: join(output, prefix + '-' + roi.id + '-detail.png'),
            animations: 'disabled',
            timeout: 120000,
          });
          detailEvidence.push({ id: roi.id, roi, ink });
        }
        examples.push({
          id: cut.id,
          a: cut.a,
          b: cut.b,
          sectionInk,
          loadMs,
          zFocus: cut.zFocus || null,
          physicalProbes: probes,
          detailEvidence,
          figureComparison: 'PENDING_REVIEW',
        });
      }
      assert.deepEqual(errors, [], item.id + ': browser errors');
      report.push({
        example: item.id,
        variant: item.variant || null,
        source: item.source,
        canonicalFacetEvidence: facetTopologyEvidence(source),
        paperImageAcceptance: 'PENDING_INDEPENDENT_FIGURE_COMPARISON',
        cuts: examples,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(join(output, 'figure-cut-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      evidenceComplete: true,
      paperImageAcceptance: 'PENDING_INDEPENDENT_FIGURE_COMPARISON',
      report,
    },
    null,
    2,
  ),
);
