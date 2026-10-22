// Current native-v2 literature review after the Legacy application was retired.
// Reads the published nine-family provenance register; photographs the actual
// Workstation Section for every family, and selected production 3D renderers.
// Does not certify the original publication SEM or infer unavailable author masks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/literature-figure-cuts/native-v2-nine-family');
const cuts = Object.freeze({
  'photodetector-literature': { a: [-3400, 0], b: [3400, 0] },
  'perc-point-contact-solar-cell': { a: [-9300, -9000], b: [-8700, -9000] },
  'fully-textured-perovskite-silicon-tandem': { a: [-16, 0], b: [16, 0] },
  'suspended-silica-microdisk': { a: [-170, 0], b: [170, 0] },
  'm3d-selfpowered-heterogeneous-ic': { a: [12, -5.3], b: [20, -5.3] },
  'magic-1000-mos2-beol': { a: [-10, -4], b: [10, -4] },
  'three-tier-silicon-jlfets': { a: [-720, 0], b: [720, 0] },
  'tio2-metalens-four-unit': { a: [-2.3, 0.1875], b: [2.3, 0.1875] },
  'tcmos-ternary-inverter-130nm': { a: [-6, -1.2], b: [6, -1.2] },
});
const threeSamples = new Set(['suspended-silica-microdisk', 'm3d-selfpowered-heterogeneous-ic']);
const hash = (data) => createHash('sha256').update(data).digest('hex');

export function validateNativeLiteratureCases(register) {
  assert.equal(register.schema, 'wafercad-literature-figure-provenance-v1');
  assert.equal(register.entries.length, 9, 'Expected nine literature source families');
  assert.deepEqual(
    new Set(register.entries.map((entry) => entry.id)),
    new Set(Object.keys(cuts)),
    'Unexpected provenance family (must review the cut coordinates)',
  );
  return register.entries.map((entry) => {
    assert.match(entry.projectPath, /^\.\/examples\/[a-z0-9-]+\.wafercad$/);
    assert.ok(entry.sourceURL?.startsWith('https://'));
    assert.ok(entry.paperPanel);
    assert.notEqual(entry.acceptance.status, 'accepted-paper-match');
    return { ...entry, ...cuts[entry.id] };
  });
}

async function run() {
  const register = JSON.parse(
    await readFile(
      new URL('../../docs/evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json', import.meta.url),
    ),
  );
  const selected = validateNativeLiteratureCases(register);
  const report = {
    schema: 'wafercad-native-v2-literature-cuts-v1',
    runtime: 'real-workstation-native-v2',
    paperMatchVerified: false,
    originalAuthorMaskVerified: false,
    geometryScope: 'published project current model, one source Section per family',
    variantSpecificHistoryReconstructionVerified: false,
    result: 'running',
    cases: [],
  };
  await mkdir(output, { recursive: true });
  const { launchBrowser, newUiPage, waitForPaint, canvasInkFraction } =
    await import('../test-helpers/ui.mjs');
  const { selectScientificView } = await import('./desktop-view-selector.mjs');
  const browser = await launchBrowser();
  try {
    for (const item of selected) {
      // Separate contexts isolate IndexedDB/Recovery and prevent leaking one
      // project's History into another. This never overwrites source files.
      const { page, context } = await newUiPage(browser, {
        viewport: { width: 1560, height: 960 },
        acceptDownloads: false,
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(base + '/app.html?start=empty', {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        });
        await page.waitForFunction(
          () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
          null,
          { timeout: 180000 },
        );
        const source = await page.evaluate(
          async ({ path, a, b }) => {
            const response = await fetch('/' + path.replace(/^\.\//, ''));
            if (!response.ok) throw Error('Published literature project unavailable: ' + path);
            const text = await response.text();
            const project = JSON.parse(text);
            project.section = { a, b };
            project.display = { ...project.display, sectionDetailRoi: null };
            const { stageStartupFile } = await import('/startup-file.js');
            await stageStartupFile(
              new File([JSON.stringify(project)], path.split('/').at(-1), {
                type: 'application/json',
              }),
              'project',
            );
            const digest = await globalThis.crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(text),
            );
            return [...new Uint8Array(digest)]
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join('');
          },
          { path: item.projectPath, a: item.a, b: item.b },
        );
        await page.goto(base + '/app.html?start=staged', {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        });
        await page.waitForFunction(
          () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
          null,
          { timeout: 180000 },
        );
        assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
        const model = await page.evaluate(
          async ({ a, b }) => {
            const state = window.WaferCadV2Workstation.snapshot();
            // Continuous Etch uses an analytic physical material owner, not the
            // protected pre-release 2.5D region stack. Query that same owner
            // used by native Section; never sample a flat compatibility surrogate.
            const { validateContinuousEtchModel } = await import('/continuous-etch-model.js');
            const continuousOwner = validateContinuousEtchModel(state.model);
            let physical, physicalSampler;
            if (continuousOwner) {
              const { sampleContinuousOwnerSection } =
                await import('/continuous-material-owner.js');
              const sites = sampleContinuousOwnerSection(continuousOwner, a, b, 32);
              physical = sites.flatMap(({ column }) => column);
              physicalSampler = 'continuous-analytic-column-samples';
            } else {
              const { sectionSlices } = await import('/model-view-geometry.js');
              physical = sectionSlices(state.model, a, b);
              physicalSampler = 'canonical-section-slices';
            }
            return {
              physicalSampler,
              layers: state.model.layers.length,
              regions: state.model.regions.length,
              arrayBacked: Boolean(state.model.array),
              section: state.section,
              sectionSlices: physical.length,
              materialIds: [...new Set(physical.map((slice) => slice.layerId))].sort(),
              materialNames: [
                ...new Set(
                  physical.map(
                    (slice) => state.model.layers.find((layer) => layer.id === slice.layerId)?.name,
                  ),
                ),
              ].sort(),
            };
          },
          { a: item.a, b: item.b },
        );
        assert.deepEqual(model.section, { a: item.a, b: item.b });
        assert.ok(
          model.layers > 0 && (model.regions > 0 || model.arrayBacked),
          item.id + ' missing material owners',
        );
        assert.ok(model.sectionSlices > 0, item.id + ' has no physical Section material');
        if (item.id === 'tio2-metalens-four-unit') {
          const titaniumOxide = model.materialNames.includes('TiO2');
          assert.ok(titaniumOxide, 'Metalens cut contains no TiO2 nanopillar');
        }
        await selectScientificView(page, 'section', 1560);
        await page.locator('#sectionCanvas').waitFor({ state: 'visible', timeout: 120000 });
        await waitForPaint(page);
        const ink = await canvasInkFraction(page, '#sectionCanvas');
        assert.ok(ink > 0.002, item.id + ' native v2 Section is blank');
        const prefix = item.id;
        const shot = prefix + '-native-v2-section.png';
        await page.locator('#sectionPanel').screenshot({
          path: resolve(output, shot),
          timeout: 120000,
          animations: 'disabled',
        });
        const record = {
          family: item.id,
          projectPath: item.projectPath,
          originalProjectSha256: source,
          paperPanel: item.paperPanel,
          paperAcceptance: item.acceptance.status,
          cut: { a: item.a, b: item.b },
          physical: model,
          sectionInkFraction: ink,
          sectionScreenshot: shot,
          sectionScreenshotSha256: hash(await readFile(resolve(output, shot))),
          threeStatus: 'not-in-this-targeted-capture',
        };
        if (threeSamples.has(item.id)) {
          await selectScientificView(page, 'three', 1560);
          await page.waitForFunction(
            () =>
              document.querySelector('#threeHost canvas')?.width > 100 &&
              document.querySelector('#threeHost')?.dataset.renderState === 'ready',
            null,
            { timeout: 180000 },
          );
          const threeShot = prefix + '-native-v2-three.png';
          await page.locator('#threePanel').screenshot({
            path: resolve(output, threeShot),
            timeout: 120000,
            animations: 'disabled',
          });
          record.threeStatus = 'native-threejs-captured-unreviewed';
          record.threeScreenshot = threeShot;
          record.threeScreenshotSha256 = hash(await readFile(resolve(output, threeShot)));
        }
        assert.deepEqual(errors, [], item.id + ' raised browser errors');
        report.cases.push(record);
        console.log('NATIVE_V2_LITERATURE', item.id, 'slices', model.sectionSlices, 'ink', ink);
      } catch (error) {
        await page.screenshot({ path: resolve(output, item.id + '-failure.png') }).catch(() => {});
        throw new Error(item.id + ': ' + String(error.stack || error));
      } finally {
        await context.close();
      }
    }
    assert.equal(report.cases.length, selected.length, 'Not all source families rendered');
    report.result = 'captured-unreviewed';
  } catch (error) {
    report.result = 'failed';
    report.error = error.stack || String(error);
    throw error;
  } finally {
    await writeFile(resolve(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('/capture-literature-native-v2.mjs')) await run();
