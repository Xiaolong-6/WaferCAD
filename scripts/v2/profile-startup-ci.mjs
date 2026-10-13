// CI diagnostic only: collect CPU samples on software WebGL to identify which
// JavaScript functions block project restore and first 3D paint.
// GPU performance conclusions still require separate physical-device evidence.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { installPinnedThreeRoute } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const folder = 'test-results/p1-startup-cpu';
const limit = Number(process.env.WAFERCAD_CPU_TIMEOUT_MS || 210000);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await installPinnedThreeRoute(context);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.setDefaultTimeout(limit);
await page.addInitScript(() => {
  const start = performance.now();
  const summary = { marks: {}, longTasksMs: [], transitions: [] };
  window.__cpuStartupTiming = summary;
  const sample = () => {
    const elapsed = Math.round(performance.now() - start);
    const shell = document.querySelector('.p-workbench');
    const phase = shell?.dataset.boot;
    const view = document.getElementById('threePanel')?.dataset.viewLoad;
    if (phase && !summary.marks['boot:' + phase]) summary.marks['boot:' + phase] = elapsed;
    if (shell?.dataset.firstFrameReady === 'true' && !summary.marks.firstFrameReady) {
      summary.marks.firstFrameReady = elapsed;
    }
    if (view && view !== summary.transitions.at(-1)?.state) {
      summary.transitions.push({ state: view, ms: elapsed });
    }
  };
  new window.MutationObserver(sample).observe(document, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['data-boot', 'data-view-load', 'data-first-frame-ready'],
  });
  try {
    new window.PerformanceObserver((items) => {
      for (const task of items.getEntries()) summary.longTasksMs.push(Math.round(task.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
});

function hotFunctions(profile) {
  const samples = new Map();
  for (const id of profile.samples || []) samples.set(id, (samples.get(id) || 0) + 1);
  const functions = new Map();
  for (const node of profile.nodes || []) {
    const frame = node.callFrame || {};
    const url = frame.url || '';
    const key = [frame.functionName || '(anonymous)', url, frame.lineNumber ?? -1].join('|');
    const entry = functions.get(key) || {
      function: frame.functionName || '(anonymous)',
      file: url.split('/').at(-1) || '',
      line: (frame.lineNumber ?? -1) + 1,
      samples: 0,
    };
    entry.samples += samples.get(node.id) || 0;
    functions.set(key, entry);
  }
  return [...functions.values()].sort((a, b) => b.samples - a.samples).slice(0, 45);
}

async function profilePhase(name, action) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  let error = null;
  try {
    await action();
  } catch (problem) {
    error = String(problem?.stack || problem);
  }
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  await writeFile(`${folder}/${name}.cpuprofile`, JSON.stringify(profile));
  const info = {
    scenario: name,
    browser: browser.version(),
    sampleCount: profile.samples?.length || 0,
    hot: hotFunctions(profile),
    timings: await page.evaluate(() => window.__cpuStartupTiming || null).catch(() => null),
    pageErrors: [...pageErrors],
    error,
  };
  await writeFile(`${folder}/${name}.json`, JSON.stringify(info, null, 2) + '\n');
  console.log('P1_CPU_PROFILE', name, 'samples', info.sampleCount, 'error', error || 'none');
  console.log('P1_CPU_TIMING', name, JSON.stringify(info.timings));
  for (const item of info.hot.slice(0, 35)) {
    console.log('P1_CPU_HOT', name, item.samples, item.function, item.file, item.line);
  }
  if (error) process.exitCode = 1;
}

try {
  await profilePhase('m3d-first', async () => {
    await page.goto(`${base}/app.html?start=example&example=m3d`, {
      waitUntil: 'commit',
      timeout: limit,
    });
    await page.waitForFunction(
      () => window.WaferCadV2Workstation?.startup?.().views.three === 'ready',
      null,
      { timeout: limit },
    );
  });
  if (process.exitCode) {
    console.log('P1 CPU profiling stopped: initial startup failed.');
  } else {
    const fast = await page.evaluate(() => window.WaferCadV2Workstation.snapshot().threeDisplay.fast);
    if (fast) await page.locator('[data-action="quality:three"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () =>
        /Saved .* locally/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent,
        ),
      null,
      { timeout: limit },
    );
    await profilePhase('quality-restore', async () => {
      await page.goto(`${base}/app.html`, { waitUntil: 'commit', timeout: limit });
      await page.waitForFunction(
        () => window.WaferCadV2Workstation?.startup?.().views.three === 'ready',
        null,
        { timeout: limit },
      );
    });
  }
} finally {
  await context.close();
  await browser.close();
}
