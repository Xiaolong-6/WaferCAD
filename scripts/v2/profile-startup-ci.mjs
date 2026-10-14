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
const repetitions = Number(process.env.WAFERCAD_CPU_REPETITIONS || 3);
const campaignSamples = [];
async function runCampaign(iteration) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await installPinnedThreeRoute(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(limit);
  await page.addInitScript(() => {
    const start = performance.now();
    const summary = { marks: {}, longTasksMs: [], longTasks: [], transitions: [], measures: [] };
    window.__cpuStartupTiming = summary;
    const sample = () => {
      const elapsed = Math.round(performance.now() - start);
      const shell = document.querySelector('.p-workbench');
      const phase = shell?.dataset.boot;
      const view = document.getElementById('threePanel')?.dataset.viewLoad;
      if (phase && !summary.marks['boot:' + phase]) summary.marks['boot:' + phase] = elapsed;
      if (shell?.dataset.projectReady === 'true' && !summary.marks.projectReady) {
        summary.marks.projectReady = elapsed;
      }
      if (shell?.dataset.firstFrameReady === 'true' && !summary.marks.firstFrameReady) {
        summary.marks.firstFrameReady = elapsed;
      }
      for (const key of ['main', 'mask', 'section', 'three']) {
        if (summary.marks['view:' + key]) continue;
        const panel = document.querySelector(`.p-view[data-view="${key}"]`);
        if (panel?.dataset.viewLoad === 'ready') summary.marks['view:' + key] = elapsed;
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
        for (const task of items.getEntries()) {
          const durationMs = Math.round(task.duration);
          summary.longTasksMs.push(durationMs);
          summary.longTasks.push({
            startEpochMs: Math.round(performance.timeOrigin + task.startTime),
            durationMs,
          });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch {}
    try {
      new window.PerformanceObserver((items) => {
        for (const entry of items.getEntries()) {
          if (!entry.name.startsWith('wafercad:')) continue;
          summary.measures.push({
            name: entry.name,
            durationMs: Math.round(entry.duration * 100) / 100,
            detail: entry.detail || null,
          });
        }
      }).observe({ entryTypes: ['measure',] });
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

  // Align CPU samples with Long Task PerformanceObserver records by wall time.
  // This is approximate (CDP start-command latency), so treat top frames as
  // attribution clues, never as an exact per-task execution trace.
  function longTaskSampleAttribution(profile, startEpochMs, tasks = []) {
    const nodes = new Map((profile.nodes || []).map((node) => [node.id, node.callFrame]));
    const selected = tasks
      .filter((task) => task.durationMs >= 500)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 12)
      .map((task) => ({ ...task, counts: new Map(), sampleCount: 0 }));
    let atEpochMs = startEpochMs;
    const samples = profile.samples || [];
    const deltas = profile.timeDeltas || [];
    for (let index = 0; index < samples.length; index++) {
      atEpochMs += Number(deltas[index] || 0) / 1000;
      for (const task of selected) {
        if (atEpochMs < task.startEpochMs || atEpochMs > task.startEpochMs + task.durationMs) {
          continue;
        }
        const id = samples[index];
        task.counts.set(id, (task.counts.get(id) || 0) + 1);
        task.sampleCount++;
      }
    }
    return selected.map(({ counts, sampleCount, ...task }) => ({
      ...task,
      sampleCount,
      hottest: [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([id, count]) => ({
          samples: count,
          function: nodes.get(id)?.functionName || '(unknown)',
          file: (nodes.get(id)?.url || '').split('/').at(-1) || '',
          line: (nodes.get(id)?.lineNumber ?? -1) + 1,
        })),
    }));
  }

  async function profilePhase(name, action) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    const profileClockBefore = Date.now();
    await cdp.send('Profiler.start');
    const profileStartEpochMs = (profileClockBefore + Date.now()) / 2;
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
    info.longTaskAttribution = longTaskSampleAttribution(
      profile,
      profileStartEpochMs,
      info.timings?.longTasks,
    );
    campaignSamples.push({
      iteration,
      scenario: name.replace(/-r\d+$/, ''),
      maxLongTaskMs: Math.max(0, ...(info.timings?.longTasksMs || [])),
      projectReadyMs: info.timings?.marks?.projectReady ?? null,
      firstFrameReadyMs: info.timings?.marks?.firstFrameReady ?? null,
      threeReadyMs: info.timings?.marks?.['view:three'] ?? null,
      measures: info.timings?.measures || [],
      error,
    });
    await writeFile(`${folder}/${name}.json`, JSON.stringify(info, null, 2) + '\n');
    console.log('P1_CPU_PROFILE', name, 'samples', info.sampleCount, 'error', error || 'none');
    console.log('P1_CPU_TIMING', name, JSON.stringify(info.timings));
    for (const task of info.longTaskAttribution.slice(0, 8)) {
      console.log('P1_CPU_LONG_TASK', name, JSON.stringify(task));
    }
    for (const item of info.hot.slice(0, 35)) {
      console.log('P1_CPU_HOT', name, item.samples, item.function, item.file, item.line);
    }
    if (error) process.exitCode = 1;
  }

  try {
    await profilePhase(iteration === 1 ? 'm3d-first' : `m3d-first-r${iteration}`, async () => {
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
      const fast = await page.evaluate(
        () => window.WaferCadV2Workstation.snapshot().threeDisplay.fast,
      );
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
      await profilePhase(iteration === 1 ? 'quality-restore' : `quality-restore-r${iteration}`, async () => {
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
}
for (let iteration = 1; iteration <= repetitions && !process.exitCode; iteration++) {
  await runCampaign(iteration);
}
await browser.close();
const metrics = ['maxLongTaskMs', 'projectReadyMs', 'firstFrameReadyMs', 'threeReadyMs'];
const aggregate = Object.fromEntries(
  ['m3d-first', 'quality-restore'].map((scenario) => {
    const runs = campaignSamples.filter((sample) => sample.scenario === scenario);
    const summary = Object.fromEntries(
      metrics.map((key) => {
        const sorted = runs.map((run) => run[key]).filter(Number.isFinite).sort((a, b) => a - b);
        return [key, {
          samples: sorted,
          median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
          min: sorted[0] ?? null,
          max: sorted.at(-1) ?? null,
        }];
      }),
    );
    return [scenario, { repetitions: runs.length, ...summary }];
  }),
);
await writeFile(`${folder}/aggregate.json`, JSON.stringify({ campaignSamples, aggregate }, null, 2) + '\n');
console.log('P1_CPU_AGGREGATE', JSON.stringify(aggregate));
