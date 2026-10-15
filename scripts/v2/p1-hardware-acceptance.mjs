// One-command local Windows/Chrome acceptance. This intentionally uses a
// separate browser context and localhost server; it cannot access your regular
// Chrome profile, cookies, tabs, or pre-existing WaferCAD workspace.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { classifyHardwareWebGL } from './p1-gpu-identity.mjs';
import {
  hasVerifiedScientificModel,
  sameVerifiedScientificModel,
} from './p1-scientific-model-evidence.mjs';
import {
  summarizeHardwareInput,
  threeCameraGestureChanged,
  threeCameraZoomChanged,
} from './p1-input-latency.mjs';

const port = Number(process.env.WAFERCAD_HW_PORT || 4288);
const base = `http://127.0.0.1:${port}`;
const timeout = Number(process.env.WAFERCAD_HW_TIMEOUT_MS || 300000);
const profiling = process.argv.includes('--profile');
const RESPONSIVENESS_LONG_TASK_LIMIT_MS = 500;
const output = join('test-results', 'p1-hardware');
const HARNESS_VERSION = 'p1-hardware-cpu-profiler-v4';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  schema: 'wafercad-p1-hardware-v3',
  harnessVersion: HARNESS_VERSION,
  cwd: process.cwd(),
  startedAt: new Date().toISOString(),
  revision: 'unknown',
  platform: process.platform,
  nodeVersion: process.version,
  viewport: { width: 1600, height: 950 },
  cases: {},
  errors: [],
  validationFailures: [],
  cpuProfileCollected: false,
  cpuProfiles: {},
  profiling,
};
// A previous successful report must never be mistaken for evidence from a failed rerun.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  join(output, 'harness.json'),
  JSON.stringify({ version: HARNESS_VERSION, profilingRequested: profiling }, null, 2) + '\n',
);
try {
  report.revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {}
let server, browser, context, page, profiler, activeProfileName;
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const checkServer = async () => {
  try {
    const response = await fetch(base + '/app.html', {
      signal: globalThis.AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
};
const hostMetrics = () =>
  page.evaluate(async () => {
    // Freeze responsiveness evidence before snapshot/model hashing below.
    // Otherwise the acceptance harness can include its own expensive
    // instrumentation in the measured Long Task/input-delay window.
    const vitals = structuredClone(window.__waferHardwareVitals || null);
    const host = document.getElementById('threeHost');
    const canvas = host?.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const snapshot = window.WaferCadV2Workstation?.snapshot?.();
    const model = snapshot?.model;
    let modelHash = null;
    if (model) {
      const bytes = new TextEncoder().encode(JSON.stringify(model));
      const digest = await window.crypto.subtle.digest('SHA-256', bytes);
      modelHash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    return {
      startup: window.WaferCadV2Workstation?.startup?.(),
      fastSetting: snapshot?.threeDisplay?.fast,
      modelHash,
      modelLayerCount: model?.layers?.length || 0,
      gl: gl
        ? {
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
            unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
            unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
            version: gl.getParameter(gl.VERSION),
          }
        : null,
      rendering: host
        ? Object.fromEntries(
            [
              'renderQuality',
              'renderState',
              'rendererFrameSerial',
              'rendererDrawCalls',
              'rendererDrawTriangles',
              'sceneAssemblyYields',
              'rendererBuildFailure',
              'arrayInstances',
              'rendererFrameMs',
            ].map((key) => [key, host.dataset[key] ?? null]),
          )
        : null,
      vitals,
    };
  });
async function photograph(name) {
  const element = page.locator('#threeHost canvas').first();
  await element.waitFor({ state: 'visible', timeout });
  const bytes = await element.screenshot({ animations: 'disabled', timeout: 60000 });
  await writeFile(join(output, name), bytes);
  return sha256(bytes);
}
function responsiveness(vitals) {
  const tasks = vitals?.longTasksMs || [];
  const worst = Math.max(0, ...tasks);
  return {
    longestLongTaskMs: Math.round(worst),
    longTasksOver500ms: tasks.filter((duration) => duration > 500).length,
    longTasksOver1000ms: tasks.filter((duration) => duration > 1000).length,
    firstFrameReadyMs: Math.round(vitals?.marks?.firstFrameReady ?? -1),
    projectReadyMs: Math.round(vitals?.marks?.projectReady ?? -1),
    responsive: worst <= RESPONSIVENESS_LONG_TASK_LIMIT_MS,
  };
}
async function beginCpuProfile(name) {
  if (!profiling) return;
  activeProfileName = name;
  profiler = await context.newCDPSession(page);
  await profiler.send('Profiler.enable');
  await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
  await profiler.send('Profiler.start');
}
async function endCpuProfile() {
  if (!profiler) return;
  const { profile } = await profiler.send('Profiler.stop');
  await writeFile(join(output, `cpu-${activeProfileName}.cpuprofile`), JSON.stringify(profile));
  const counts = new Map();
  for (const sample of profile.samples || []) counts.set(sample, (counts.get(sample) || 0) + 1);
  report.cpuHotspots = (profile.nodes || [])
    .map((node) => ({
      samples: counts.get(node.id) || 0,
      function: node.callFrame?.functionName || '(anonymous)',
      url: node.callFrame?.url || '',
      line: (node.callFrame?.lineNumber ?? -1) + 1,
    }))
    .filter((node) => node.samples > 0)
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 25);
  report.cpuProfiles[activeProfileName] = {
    sampleCount: (profile.samples || []).length,
    hotspots: report.cpuHotspots,
  };
  report.cpuProfileSamples = (profile.samples || []).length;
  await profiler.detach();
  profiler = null;
  activeProfileName = null;
}
async function waitReady(stage = 'ready') {
  await page.waitForFunction(
    (stage) => window.WaferCadV2Workstation?.startup?.().views.three === stage,
    stage,
    { timeout },
  );
}
// CDP delivers trusted pointer events from outside the renderer main thread.
// The recorder runs in page.addInitScript so the events are observed even
// during the initial model/3D build, before the canvas becomes ready.
async function openAndSampleInput(url) {
  // Send input before navigation: expensive document startup and the first
  // scientific frame can occur before DOMContentLoaded. Supplying the CDP
  // input's original wall-clock timestamp avoids treating renderer delivery
  // time as the moment the user started the interaction.
  const session = await context.newCDPSession(page);
  let pending = null;
  let count = 0;
  let rejected = 0;
  let point = { x: report.viewport.width * 0.72, y: report.viewport.height * 0.68 };
  const dispatch = () => {
    if (pending) return;
    count++;
    const request = session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x + (count % 3),
      y: point.y,
      timestamp: Date.now() / 1000,
    });
    pending = request;
    void request
      .catch(() => {
        rejected++;
      })
      .finally(() => {
        if (pending === request) pending = null;
      });
  };
  const timer = globalThis.setInterval(dispatch, 350);
  try {
    dispatch();
    await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout });
    void page
      .locator('#threeHost canvas')
      .boundingBox()
      .then((box) => {
        if (box) point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      })
      .catch(() => {});
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout });
    await waitReady();
  } finally {
    globalThis.clearInterval(timer);
    await pending?.catch(() => {});
    await session.detach();
  }
  return { dispatched: count, rejected };
}

async function verifyThreeGestures() {
  const canvas = page.locator('#threeHost canvas').first();
  const box = await canvas.boundingBox();
  if (!box) return { passed: false, reason: '3D canvas is not visible' };
  const camera = () => page.evaluate(() => window.WaferCadV2Workstation?.snapshot?.().threeCamera);
  const before = await camera();
  const eventStart = await page.evaluate(
    () => window.__waferHardwareVitals?.inputEvents.length || 0,
  );
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 25, y + 18, { steps: 6 });
  await page.mouse.up();
  await sleep(200);
  const afterDrag = await camera();
  await page.mouse.wheel(0, -250);
  await sleep(400);
  const afterWheel = await camera();
  const delivered = await page.evaluate(
    (start) => (window.__waferHardwareVitals?.inputEvents || []).slice(start),
    eventStart,
  );
  const pointerObserved = delivered.some(
    (event) => event.threeCanvas && event.kind === 'pointermove',
  );
  const wheelObserved = delivered.some((event) => event.threeCanvas && event.kind === 'wheel');
  const orbitChanged = threeCameraGestureChanged(before, afterDrag);
  const zoomChanged = threeCameraZoomChanged(afterDrag, afterWheel);
  return {
    passed: orbitChanged && zoomChanged && pointerObserved && wheelObserved,
    orbitChanged,
    zoomChanged,
    pointerObserved,
    wheelObserved,
    cameraBefore: before,
    cameraAfterDrag: afterDrag,
    cameraAfterWheel: afterWheel,
  };
}
try {
  if (report.revision === 'unknown')
    throw new Error('Run from a WaferCAD Git checkout; revision could not be determined.');
  if (await checkServer())
    throw new Error(`Port ${port} is in use. Stop the existing server or set WAFERCAD_HW_PORT.`);
  server = spawn(process.execPath, ['scripts/v2/serve-v2.mjs'], {
    env: { ...process.env, WAFERCAD_V2_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverError = '';
  server.stderr.on('data', (chunk) => {
    serverError += String(chunk).slice(-500);
  });
  let listening = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await checkServer()) {
      listening = true;
      break;
    }
    if (server.exitCode !== null) break;
    await sleep(200);
  }
  if (!listening) throw new Error('Local test server did not start: ' + serverError);
  console.log('P1 hardware: opening local Chrome (headed) with ANGLE D3D11…');
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--use-angle=d3d11', '--enable-webgl'],
    timeout: 30000,
  });
  report.chromeVersion = browser.version();
  context = await browser.newContext({
    viewport: report.viewport,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.on('pageerror', (error) => report.errors.push('PAGE: ' + error.message));
  page.on('crash', () => report.errors.push('PAGE: renderer process crashed'));
  await page.addInitScript(() => {
    const vitals = {
      startedAt: performance.now(),
      marks: {},
      viewTransitions: [],
      eventLoopLagMs: [],
      longTasksMs: [],
      inputEvents: [],
    };
    window.__waferHardwareVitals = vitals;
    const recordInput = (event) => {
      if (!event.isTrusted || vitals.inputEvents.length >= 4096) return;
      const queueMs = performance.now() - event.timeStamp;
      if (!Number.isFinite(queueMs) || queueMs < 0) return;
      const view = document.getElementById('threePanel')?.dataset.viewLoad;
      vitals.inputEvents.push({
        trusted: true,
        kind: event.type,
        phase: ['coarse', 'refining', 'ready'].includes(view) ? view : 'loading',
        threeCanvas: Boolean(event.target?.matches?.('#threeHost canvas')),
        queueMs,
      });
    };
    document.addEventListener('pointermove', recordInput, { capture: true, passive: true });
    document.addEventListener('wheel', recordInput, { capture: true, passive: true });
    let previous = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      const delay = Math.max(0, now - previous - 50);
      previous = now;
      if (vitals.eventLoopLagMs.length < 15000) vitals.eventLoopLagMs.push(delay);
    }, 50);
    try {
      new window.PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          if (vitals.longTasksMs.length < 15000) vitals.longTasksMs.push(item.duration);
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch {}
    const record = () => {
      const now = performance.now() - vitals.startedAt;
      const shell = document.querySelector('.p-workbench');
      const phase = shell?.dataset.boot;
      const project = shell?.dataset.projectReady;
      const first = shell?.dataset.firstFrameReady;
      if (phase && !vitals.marks['boot:' + phase]) vitals.marks['boot:' + phase] = now;
      if (project === 'true' && !vitals.marks.projectReady) vitals.marks.projectReady = now;
      if (first === 'true' && !vitals.marks.firstFrameReady) vitals.marks.firstFrameReady = now;
      const view = document.getElementById('threePanel')?.dataset.viewLoad;
      if (view && vitals.viewTransitions.at(-1)?.state !== view) {
        vitals.viewTransitions.push({ state: view, timeMs: Math.round(now) });
      }
    };
    new window.MutationObserver(record).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-boot',
        'data-project-ready',
        'data-first-frame-ready',
        'data-view-load',
      ],
    });
  });

  console.log('P1 hardware: loading M3D example…');
  await beginCpuProfile('m3d-startup');
  report.inputProbeInitial = await openAndSampleInput('/app.html?start=example&example=m3d');
  await endCpuProfile();
  report.cases.initialM3D = await hostMetrics();
  report.cases.initialM3D.modelEvidenceValid = hasVerifiedScientificModel(report.cases.initialM3D);
  report.cases.initialM3D.responsiveness = responsiveness(report.cases.initialM3D.vitals);
  report.cases.initialM3D.input = summarizeHardwareInput(
    report.cases.initialM3D.vitals?.inputEvents,
  );
  report.cases.initialM3D.screenshotSha256 = await photograph('01-m3d-first-ready.png');
  report.hardware = classifyHardwareWebGL(report.cases.initialM3D.gl);
  report.hardwareVerified = report.hardware.verified;
  console.log(
    'P1 hardware GPU:',
    report.hardware.adapter || '(unmasked adapter not available)',
    report.hardware.manufacturer || 'unknown',
  );
  if (!report.hardwareVerified) {
    report.errors.push('Physical GPU identity could not be verified: ' + report.hardware.reason);
  }

  console.log('P1 hardware: storing Quality preference for M3D…');
  if (report.cases.initialM3D.fastSetting !== false) {
    await page.locator('[data-action="quality:three"]').click();
  }
  await page.waitForFunction(
    () => window.WaferCadV2Workstation?.snapshot?.().threeDisplay.fast === false,
    null,
    { timeout },
  );
  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(
    () =>
      /Saved .* locally/.test(document.querySelector('[data-slot="status.message"]')?.textContent),
    null,
    { timeout },
  );
  console.log('P1 hardware: reloading saved M3D project with Quality…');
  await beginCpuProfile('quality-reload');
  report.inputProbeReload = await openAndSampleInput('/app.html');
  await endCpuProfile();
  report.cases.qualityReload = await hostMetrics();
  report.cases.qualityReload.modelEvidenceValid = hasVerifiedScientificModel(
    report.cases.qualityReload,
  );
  report.cases.qualityReload.responsiveness = responsiveness(report.cases.qualityReload.vitals);
  report.cases.qualityReload.input = summarizeHardwareInput(
    report.cases.qualityReload.vitals?.inputEvents,
  );
  report.cases.qualityReload.screenshotSha256 = await photograph('02-quality-final.png');
  await sleep(400);
  report.cases.qualityReload.repeatSha256 = await photograph('03-quality-repeat.png');
  report.cases.qualityReload.sameFramePixels =
    report.cases.qualityReload.screenshotSha256 === report.cases.qualityReload.repeatSha256;
  report.cases.qualityReload.modelUnchanged = sameVerifiedScientificModel(
    report.cases.initialM3D,
    report.cases.qualityReload,
  );
  if (
    !report.cases.initialM3D.modelEvidenceValid ||
    !report.cases.qualityReload.modelEvidenceValid
  ) {
    report.validationFailures.push('Scientific model evidence missing or invalid.');
  }
  const stages = report.cases.qualityReload.vitals?.viewTransitions?.map((x) => x.state) || [];
  report.cases.qualityReload.stageSequencePassed =
    stages.indexOf('coarse') >= 0 &&
    stages.indexOf('refining') > stages.indexOf('coarse') &&
    stages.lastIndexOf('ready') > stages.indexOf('refining');
  if (!report.cases.qualityReload.sameFramePixels) {
    report.validationFailures.push('Quality repeat screenshots have different pixels.');
  }
  // Run gesture checks after the pixel-stability capture; the gestures may
  // change the inspection camera but never the scientific model.
  report.threeGestures = await verifyThreeGestures();
  report.threeGestures.modelUnchanged = sameVerifiedScientificModel(
    report.cases.qualityReload,
    await hostMetrics(),
  );
  if (!report.threeGestures.passed) {
    report.validationFailures.push(
      '3D canvas Orbit/Zoom must independently change camera with trusted pointer/wheel delivery.',
    );
  }
  if (!report.threeGestures.modelUnchanged) {
    report.validationFailures.push('3D gestures unexpectedly changed scientific model.');
  }
  for (const [label, sample] of Object.entries(report.cases)) {
    if (sample.input && !sample.input.responsive) {
      report.validationFailures.push(
        `${label}: input queue samples missing or over 500 ms (${sample.input.worstQueueMs}ms)`,
      );
    }
  }
  for (const [label, sample] of Object.entries(report.cases)) {
    if (sample.responsiveness && !sample.responsiveness.responsive) {
      report.validationFailures.push(
        `${label}: ${sample.responsiveness.longestLongTaskMs}ms main-thread Long Task (limit ${RESPONSIVENESS_LONG_TASK_LIMIT_MS}ms)`,
      );
    }
  }
  report.passed =
    report.hardwareVerified &&
    report.cases.qualityReload.fastSetting === false &&
    report.cases.qualityReload.stageSequencePassed &&
    report.cases.initialM3D.modelEvidenceValid &&
    report.cases.qualityReload.modelEvidenceValid &&
    report.cases.qualityReload.modelUnchanged &&
    report.cases.qualityReload.sameFramePixels &&
    report.cases.initialM3D.input.responsive &&
    report.cases.qualityReload.input.responsive &&
    report.threeGestures.passed &&
    report.threeGestures.modelUnchanged &&
    report.cases.initialM3D.responsiveness.responsive &&
    report.cases.qualityReload.responsiveness.responsive &&
    report.errors.length === 0 &&
    report.validationFailures.length === 0;
} catch (error) {
  report.errors.push(String(error?.stack || error));
  report.passed = false;
  console.error('P1 hardware acceptance:', error.message);
  if (page && !page.isClosed()) {
    try {
      report.partial = await hostMetrics();
      await page.screenshot({
        path: join(output, 'failure-full-page.png'),
        fullPage: true,
        timeout: 15000,
      });
    } catch (captureError) {
      report.errors.push('Evidence capture: ' + captureError.message);
    }
  }
} finally {
  report.finishedAt = new Date().toISOString();
  if (profiler)
    await endCpuProfile().catch((error) => {
      report.errors.push('CPU profiler cleanup: ' + error.message);
    });
  if (profiling) {
    report.cpuProfileBytes = {};
    for (const name of ['m3d-startup', 'quality-reload']) {
      let size = 0;
      try {
        size = (await stat(join(output, `cpu-${name}.cpuprofile`))).size;
      } catch {}
      report.cpuProfileBytes[name] = size;
      if (size < 1000 || !report.cpuProfiles[name]?.sampleCount) {
        report.errors.push(`The Chrome CPU profile for ${name} is missing or empty.`);
        report.passed = false;
      }
    }
    report.cpuProfileCollected = report.errors.every(
      (error) => !error.includes('Chrome CPU profile'),
    );
  }
  await save();
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
  console.log(
    'P1_HARDWARE_RESULT',
    JSON.stringify({
      passed: report.passed,
      worstInitialLongTaskMs: report.cases.initialM3D?.responsiveness?.longestLongTaskMs ?? null,
      worstReloadLongTaskMs: report.cases.qualityReload?.responsiveness?.longestLongTaskMs ?? null,
      cpuProfileCollected: report.cpuProfileCollected,
      harnessVersion: HARNESS_VERSION,
      cpuProfileBytes: report.cpuProfileBytes ?? null,
      revision: report.revision,
      gpu: report.cases.initialM3D?.gl?.unmaskedRenderer || null,
      gpuManufacturer: report.hardware?.manufacturer || null,
      inputInitial: report.cases.initialM3D?.input || null,
      inputReload: report.cases.qualityReload?.input || null,
      threeGesturesPassed: report.threeGestures?.passed ?? null,
      hardwareVerified: report.hardwareVerified || false,
      modelUnchanged: report.cases.qualityReload?.modelUnchanged ?? null,
      stages: report.cases.qualityReload?.vitals?.viewTransitions?.map((x) => x.state) || [],
      folder: output,
      errors: report.errors.slice(0, 3).map((x) => x.slice(0, 180)),
      validationFailures: report.validationFailures,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
