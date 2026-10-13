import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  baseUrl,
  chooseConfirmation,
  closeFunctionPanel,
  launchBrowser,
  newLegacyUiContext,
  observePageErrors,
  waitForAppReady,
  waitForThreeReady,
} from './test-helpers/ui.mjs';

const result = { passed: false, stage: 'boot' };
const output = new URL('../test-results/foreground-rendering-p0/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  const context = await newLegacyUiContext(browser, { viewport: { width: 1440, height: 960 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const errors = observePageErrors(page);
    const host = page.locator('#threeHost');
    const snapshot = () => host.evaluate((element) => ({ ...element.dataset }));
    await page.goto(baseUrl + '/app-legacy.html');
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
      () => document.getElementById('statusText')?.textContent?.startsWith('Opened '),
      null,
      { timeout: 180000 },
    );
    await closeFunctionPanel(page);
    await waitForThreeReady(page, 180000);
    const initial = await snapshot();
    assert.equal(initial.arrayInstances, '1885');
    assert.equal(initial.sceneVariant, 'opaque');
    const panel = page.locator('#threePanel .three-opacity-control');
    const more = page.locator('#threePanel .view-more-control');
    if (await panel.evaluate((node) => Boolean(node.closest('.view-overflow-secondary')))) {
      if (!(await more.evaluate((node) => node.open)))
        await more.locator(':scope > summary').click();
    }
    await panel.locator(':scope > summary').click();
    const slider = page.locator('#threeOpacityRange');
    result.stage = 'supersede-cold-transparent';
    await slider.fill('0.5');
    await page.waitForFunction(
      () => {
        const d = document.getElementById('threeHost')?.dataset;
        return (
          d?.rendererUpdateKind === 'variant-build' &&
          d?.renderState === 'building' &&
          d?.rendererRetainedCompleteVisible === 'true'
        );
      },
      null,
      { timeout: 180000 },
    );
    const during = await snapshot();
    assert.equal(during.rendererRetainedCompleteVisible, 'true');
    // A real UI opacity request supersedes the in-flight hidden candidate.
    await slider.fill('1');
    await page.waitForFunction(
      () => {
        const d = document.getElementById('threeHost')?.dataset;
        return (
          Number(d?.rendererSupersededBuilds || 0) >= 1 &&
          d?.renderState === 'ready' &&
          d?.sceneVariant === 'opaque'
        );
      },
      null,
      { timeout: 180000 },
    );
    const restored = await snapshot();
    assert.ok(Number(restored.rendererVariantRollbacks || 0) >= 1);
    assert.equal(restored.rendererRetainedCompleteVisible, 'false');
    assert.equal(restored.rendererBuildFailure, undefined);
    result.stage = 'commit-next-transparent';
    await slider.fill('0.5');
    await page.waitForFunction(
      () => {
        const d = document.getElementById('threeHost')?.dataset;
        return (
          d?.renderState === 'ready' &&
          d?.sceneVariant === 'transparent' &&
          Number(d?.rendererCommittedVariantSwaps || 0) >= 1
        );
      },
      null,
      { timeout: 180000 },
    );
    const committed = await snapshot();
    assert.equal(committed.rendererRetainedCompleteVisible, 'false');
    assert.equal(committed.rendererBuildFailure, undefined);
    assert.ok(Number(committed.rendererFrameSerial || 0) > 0);
    assert.deepEqual(errors, []);
    result.steps = {
      initialFrame: Number(initial.rendererFrameSerial),
      superseded: Number(restored.rendererSupersededBuilds),
      rollbacks: Number(restored.rendererVariantRollbacks),
      committed: Number(committed.rendererCommittedVariantSwaps),
      finalFrame: Number(committed.rendererFrameSerial),
    };
    result.stage = 'passed';
    result.passed = true;
  } finally {
    await context.close();
  }
} catch (error) {
  result.error = String(error);
  throw error;
} finally {
  console.log('FOREGROUND_RENDERING_P0', JSON.stringify(result));
  await writeFile(new URL('report.json', output), JSON.stringify(result, null, 2) + '\n');
  await browser.close();
}
