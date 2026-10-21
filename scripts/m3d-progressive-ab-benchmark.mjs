// Repeat real M3D cold Workstation opens on one Chromium host.
// Both arms use the same committed sources; the control suppresses only the
// optional Worker preview packet. This is a labeled, opt-in acceptance gate.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { gotoWelcome, launchBrowser, newUiContext, observePageErrors } from './test-helpers/ui.mjs';
import { selectScientificView } from './v2/desktop-view-selector.mjs';

const output = 'test-results/m3d/first-frame-ab';
const repeats = Number(process.env.WAFERCAD_AB_REPEATS || 3);
assert.ok(Number.isInteger(repeats) && repeats >= 2 && repeats <= 8);
await mkdir(output, { recursive: true });
const results = [];
const report = {
  source: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || 'local-unidentified',
  baselineReferenceMs: 25240,
  baselineReferenceNote: 'Historical #358 same-host 4-CPU measurement; not interchangeable with this host',
  host: { platform: process.platform, cpus: os.availableParallelism(), model: os.cpus()[0]?.model },
  control: 'Identical source except the surface-plan Worker preview request is false',
  repeats,
  results,
};
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

function processTreeRss(rootPid) {
  if (!rootPid || process.platform !== 'linux') return null;
  const ps = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  const children = new Map();
  const rss = new Map();
  for (const line of ps.split('\n')) {
    const [pid, ppid, resident] = line.trim().split(/\s+/).map(Number);
    if (!pid || !ppid || !Number.isFinite(resident)) continue;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
    rss.set(pid, resident * 1024);
  }
  const queue = [rootPid];
  const seen = new Set();
  let total = 0;
  while (queue.length) {
    const pid = queue.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += rss.get(pid) || 0;
    queue.push(...(children.get(pid) || []));
  }
  return total || null;
}

async function hashExactPlan(page) {
  return page.evaluate(async () => {
    const plan = globalThis.__wafercadABExactPlan;
    if (!plan?.caps || !plan?.sidewalls) throw new Error('Exact Worker plan was not captured');
    const encoder = new TextEncoder();
    const chunks = [];
    let block = '';
    const append = async (s) => {
      block += s;
      if (block.length < 256 * 1024) return;
      chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(block))));
      block = '';
    };
    for (const key of Object.keys(plan).sort()) {
      await append('field:' + key + '\n');
      const value = plan[key];
      if (Array.isArray(value)) {
        await append('length:' + value.length + '\n');
        for (const item of value) await append(JSON.stringify(item) + '\n');
      } else await append(JSON.stringify(value) + '\n');
    }
    if (block) chunks.push(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(block))));
    const combined = new Uint8Array(chunks.length * 32);
    chunks.forEach((chunk, i) => combined.set(chunk, i * 32));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    return {
      sha256: Array.from(digest, (x) => x.toString(16).padStart(2, '0')).join(''),
      caps: plan.caps.length,
      sidewalls: plan.sidewalls.length,
      chunks: chunks.length,
    };
  });
}

async function coldRun(mode, index) {
  const browser = await launchBrowser();
  let timer;
  let peakRssBytes = 0;
  let rssSamples = 0;
  let context;
  try {
    timer = setInterval(() => {
      try {
        const bytes = processTreeRss(browser.process()?.pid);
        if (bytes != null) {
          peakRssBytes = Math.max(peakRssBytes, bytes);
          rssSamples++;
        }
      } catch {}
    }, 200);
    context = await newUiContext(browser, { viewport: { width: 1440, height: 960 } });
    let intercepted = 0;
    await context.route('**/renderer-surface-plan-async.js*', async (route) => {
      const response = await route.fetch();
      let script = await response.text();
      const finish = 'else resolve(rememberRenderSurfacePlan(model, clip, plan));';
      assert.ok(script.includes(finish), 'Worker exact cache contract changed');
      script = script.replace(
        finish,
        'else { globalThis.__wafercadABExactPlan = plan; resolve(rememberRenderSurfacePlan(model, clip, plan)); }',
      );
      if (mode === 'control') {
        const preview = "preview: typeof onPreview === 'function',";
        assert.ok(script.includes(preview), 'Worker preview switch contract changed');
        script = script.replace(preview, 'preview: false,');
      }
      intercepted++;
      await route.fulfill({ response, body: script });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    const pageErrors = observePageErrors(page);
    await page.addInitScript(() => {
      if (!location.pathname.endsWith('/app.html')) return;
      const observeHost = () => {
        const insertion = new MutationObserver(() => bindHost());
        const bindHost = () => {
          const host = document.getElementById('threeHost');
          if (!host) return;
          insertion.disconnect();
          const check = () => {
            if (
              !window.__wafercadABFirstPreviewWallMs &&
              host.dataset.renderFidelity === 'approximate' &&
              host.dataset.rendererProgressiveFirstFrameMs
            ) {
              window.__wafercadABFirstPreviewWallMs = performance.timeOrigin + performance.now();
            }
          };
          new MutationObserver(check).observe(host, {
            attributes: true,
            attributeFilter: ['data-render-fidelity', 'data-renderer-progressive-first-frame-ms'],
          });
          check();
        };
        insertion.observe(document.documentElement, { childList: true, subtree: true });
        bindHost();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeHost, { once: true });
      } else observeHost();
    });
    await gotoWelcome(page);
    const card = page.locator(
      '.welcome-example-card[data-example-id="m3d-selfpowered-heterogeneous-ic"]',
    );
    const startedAt = Date.now();
    await card.locator('.welcome-example-title-link').click();
    await page.waitForURL(/\/app\.html(?:\?.*)?$/, { timeout: 180000 });
    await page.waitForFunction(
      () =>
        document.body.dataset.ready === 'true' &&
        window.WaferCadV2Workstation?.snapshot().source.endsWith(
          '/m3d-selfpowered-full-replay.wafercad',
        ),
      null,
      { timeout: 180000 },
    );
    await selectScientificView(page, 'three', 1440);
    await page.waitForFunction(
      () => {
        const d = document.getElementById('threeHost')?.dataset;
        return d?.renderFidelity === 'exact-surface-plan' && Boolean(d.rendererExactFirstFrameMs);
      },
      null,
      { timeout: 180000 },
    );
    const openToExactMs = Date.now() - startedAt;
    const timing = await page.evaluate(() => {
      const d = document.getElementById('threeHost').dataset;
      return {
        previewFirstFrameMs: Number(d.rendererProgressiveFirstFrameMs) || null,
        previewWallMs: globalThis.__wafercadABFirstPreviewWallMs || null,
        exactFirstFrameMs: Number(d.rendererExactFirstFrameMs) || null,
        previewBuildMs: Number(d.rendererProgressiveBuildMs) || null,
        exactSceneMs: Number(d.rendererExactSceneMs) || null,
        fidelity: d.renderFidelity,
        state: d.renderState,
        topology: JSON.parse(d.surfaceTopology || '{}'),
      };
    });
    assert.ok(intercepted > 0, 'Benchmark route failed to load instrumented production module');
    assert.equal(timing.fidelity, 'exact-surface-plan');
    if (mode === 'preview') {
      assert.ok(timing.previewFirstFrameMs > 0, 'No native approximate WebGL frame');
      assert.ok(timing.previewFirstFrameMs < timing.exactFirstFrameMs);
    } else assert.equal(timing.previewFirstFrameMs, null);
    // Stop sampling before CPU-intensive hash checks so memory covers only
    // startup/preview/exact assembly, not the acceptance instrumentation.
    clearInterval(timer);
    timer = null;
    const hash = await hashExactPlan(page);
    assert.ok(!pageErrors.length, 'Page errors: ' + pageErrors.join('; '));
    const openToPreviewMs =
      mode === 'preview' && timing.previewWallMs ? timing.previewWallMs - startedAt : null;
    if (mode === 'preview') assert.ok(openToPreviewMs > 0 && openToPreviewMs < openToExactMs);
    const result = {
      mode, index, openToExactMs, openToPreviewMs, ...timing, hash,
      peakBrowserTreeRssBytes: rssSamples ? peakRssBytes : null,
      rssSamples, errors: pageErrors,
    };
    console.log('M3D_AB_COLD_RUN', JSON.stringify(result));
    return result;
  } finally {
    if (timer) clearInterval(timer);
    await context?.close();
    await browser.close();
  }
}

try {
  // Alternate order to reduce shared host cache / thermal bias.
  for (let i = 0; i < repeats; i++) {
    const pair = i % 2 ? ['preview', 'control'] : ['control', 'preview'];
    for (const mode of pair) {
      results.push(await coldRun(mode, i + 1));
      await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
      await delay(100);
    }
  }
  const control = results.filter((x) => x.mode === 'control');
  const preview = results.filter((x) => x.mode === 'preview');
  const controlExact = median(control.map((x) => x.openToExactMs));
  const previewExact = median(preview.map((x) => x.openToExactMs));
  const previewFirst = median(preview.map((x) => x.openToPreviewMs));
  const memoryKnown = results.every((x) => x.peakBrowserTreeRssBytes != null);
  const memoryRatio = memoryKnown
    ? median(preview.map((x) => x.peakBrowserTreeRssBytes)) /
      median(control.map((x) => x.peakBrowserTreeRssBytes))
    : null;
  const hashes = new Set(results.map((x) => x.hash.sha256));
  report.summary = {
    controlOpenToExactMedianMs: controlExact,
    previewOpenToExactMedianMs: previewExact,
    previewOpenToFirstMedianMs: previewFirst,
    controlRendererExactMedianMs: median(control.map((x) => x.exactFirstFrameMs)),
    previewRendererExactMedianMs: median(preview.map((x) => x.exactFirstFrameMs)),
    previewRendererFirstMedianMs: median(preview.map((x) => x.previewFirstFrameMs)),
    previewUsableGainPct: (1 - previewFirst / controlExact) * 100,
    exactReadyRegressionPct: (previewExact / controlExact - 1) * 100,
    peakRssRatio: memoryRatio,
    allExactPlanHashesMatch: hashes.size === 1,
    exactPlanHash: results[0].hash.sha256,
    exactTopologyCountsMatch: results.every((x) =>
      x.hash.caps === results[0].hash.caps &&
      x.hash.sidewalls === results[0].hash.sidewalls),
  };
  console.log('M3D_AB_SUMMARY', JSON.stringify(report.summary));
  assert.ok(report.summary.previewUsableGainPct >= 20, 'Usable preview improved less than 20%');
  assert.ok(report.summary.exactReadyRegressionPct <= 5, 'Exact first frame regressed over 5%');
  assert.ok(memoryKnown, 'Cannot verify peak browser process-tree RSS');
  assert.ok(memoryRatio <= 1.1, 'Peak browser process-tree RSS regressed over 10%');
  assert.ok(report.summary.allExactPlanHashesMatch, 'Canonical exact plan hash changed');
  assert.ok(report.summary.exactTopologyCountsMatch, 'Exact topology counts changed');
} finally {
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
}
