// Native Chrome/CDP shell checks. No Playwright, screenshots, baselines, or core execution.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const url = process.env.WAFERCAD_V2_URL || 'http://127.0.0.1:4182/app-v2.html';
assert.equal(
  new URL(url).pathname.endsWith('/app-v2.html'),
  true,
  'Never run this suite on legacy/prototype',
);
const html = await readFile('site/app-v2.html', 'utf8');
for (const [, resource] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  if (!resource.startsWith('data:')) await access(resolve('site', resource));
}
const chrome =
  process.env.WAFERCAD_REVIEW_CHROME ||
  'C:/Users/liux16/AppData/Local/Google/Chrome/Application/chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'wafercad-m2-'));
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let socket;
const pending = new Map();
let serial = 0;
const errors = [];
const checks = [];
const roi = [];
function record(name) {
  checks.push(name);
}
async function waitFor(probe, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await probe()) return;
    await delay(80);
  }
  throw new Error(`Timeout: ${label}`);
}
function call(method, params = {}) {
  return new Promise((accept, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout ${method}`));
    }, 8000);
    pending.set(id, { accept, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) {
  const rect = await evaluate(
    `(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing button');el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...rect,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...rect,
    button: 'left',
    clickCount: 1,
  });
}
async function viewport(width) {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  );
}
const snapshot = () => evaluate('window.WaferCadV2Shell.snapshot()');
try {
  let port;
  await waitFor(async () => {
    try {
      port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      return Boolean(port);
    } catch {
      return false;
    }
  }, 'Chrome endpoint');
  const endpoint = `http://127.0.0.1:${port}`;
  const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.addEventListener('open', accept, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(message.error.message));
      else item.accept(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')
      errors.push(message.params.entry.text);
  });
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Log.enable');
  await viewport(1440);
  await call('Page.navigate', { url });
  await waitFor(
    async () =>
      evaluate(
        "document.documentElement.dataset.ui==='v2' && document.body.dataset.ready==='true'",
      ),
    'v2 shell boot',
  );
  assert.equal(
    await evaluate(
      "new URL(location.href).pathname.endsWith('/app-v2.html') && document.documentElement.dataset.ui==='v2'",
    ),
    true,
  );
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate('document.fonts.check(\'12px "Inter Review"\')'), true);
  assert.equal((await snapshot()).sourceFrozen, true);
  record('v2 entry / Inter font / frozen real-source mocks');
  const checkLegend = () =>
    evaluate(`(() => {
    const snap=window.WaferCadV2Shell.snapshot();
    const example=window.WaferCadV2MockData.fixtures.find(item=>item.id===snap.state.example);
    const model=example.models[example.history.find(item=>item.id===snap.cursor)?.modelRef] || example.models.project;
    const legend=document.querySelector('#layerLegend');
    const rows=[...model.layers,...model.annotations];
    const actual=legend.querySelectorAll('[data-layer-id],[data-annotation-id]');
    return {visible:!legend.hidden,count:actual.length,expected:rows.length,annotations:model.annotations.length,
      matches:rows.every(item=>{const row=[...actual].find(node=>(node.dataset.layerId||node.dataset.annotationId)===item.id);
      const sample=document.createElement('span');sample.style.backgroundColor=item.color;
      return row?.textContent.includes(item.name)&&row.querySelector('.v2-legend-swatch').style.backgroundColor===sample.style.backgroundColor;})};
  })()`);
  let legend = await checkLegend();
  assert.equal(legend.visible && legend.matches, true);
  assert.equal(legend.count, legend.expected);
  await evaluate(
    "window.__m2Legend=document.querySelector('#layerLegend');window.__m2SectionHost=document.querySelector('[data-science=\"section\"]')",
  );
  await click('[data-view="section"] [data-action="legend"]');
  assert.equal(
    await evaluate(
      "document.querySelector('#layerLegend').hidden && document.querySelector('[data-action=legend]').getAttribute('aria-expanded')==='false'",
    ),
    true,
  );
  await click('[data-view="section"] [data-action="legend"]');
  assert.equal(
    await evaluate(
      "window.__m2Legend===document.querySelector('#layerLegend') && window.__m2SectionHost===document.querySelector('[data-science=\"section\"]')",
    ),
    true,
  );
  record('Section legend: source names/colors/IDs, collapse/restore, stable plot and legend hosts');
  await evaluate(
    "window.__m2MainHost=document.querySelector('[data-science=\"main\"]');window.__m2Workbench=document.querySelector('.p-workbench')",
  );
  await click('[data-action="domain:mask"]');
  assert.equal((await snapshot()).state.maximize, 'mask');
  assert.equal(
    await evaluate(
      "Boolean(document.querySelector('[data-file-cells]') || document.querySelector('.p-empty-state')) || document.querySelector('.p-panel-content').textContent.includes('Cells')",
    ),
    true,
  );
  const drawCount = (await snapshot()).state.drawDraft.length;
  await click('[data-action="draw-tool:ring-sector"]');
  await click('[data-action="draw-add"]');
  assert.equal((await snapshot()).state.drawDraft.length, drawCount + 1);
  await click('[data-action="draft-undo"]');
  assert.equal((await snapshot()).state.drawDraft.length, drawCount);
  await click('[data-view="mask"] [popovertarget]');
  await click('[data-action="settings:mask"]');
  await evaluate(
    `(() => {const el=document.querySelector('dialog [data-key="alignX"]');el.value='42';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await click('dialog[open] [data-action="apply-settings"]');
  assert.equal((await snapshot()).state.maskTransform.x, 42);
  assert.match(
    await evaluate(
      `document.querySelector('[data-science="mask"] svg g').getAttribute('transform')`,
    ),
    /translate\(42/,
  );
  await click('[data-action="file-import"]');
  await click('dialog[open] [data-action="confirm-file-import"]');
  assert.ok(
    await evaluate(`document.querySelector('[data-cell-id="TOP"] .p-cell-children li') !== null`),
  );
  record('Mask navigation -> max, Cells + Layers');
  await click('[data-action="domain:process"]');
  await evaluate(
    `(() => {const el=document.querySelector('[data-key="operation"]');el.value='etch';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  assert.equal(
    await evaluate(
      `[...document.querySelector('[data-key="processProfile"]').options].map(option=>option.value).join(',')`,
    ),
    'directional,isotropic',
  );
  assert.equal(
    await evaluate(
      `[...document.querySelector('[data-key="processSurface"]').options].map(option=>option.value).join(',')`,
    ),
    'smooth,rough,pyramid',
  );
  await evaluate(
    `(() => {const el=document.querySelector('[data-key="operation"]');el.value='implant';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await evaluate(
    `(() => {const el=document.querySelector('[data-key="processTilt"]');el.value='-1';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await click('[data-action="decrement:processTilt"]');
  assert.equal((await snapshot()).state.processTilt, -2);
  await evaluate(
    `(() => {const el=document.querySelector('[data-key="operation"]');el.value='extend';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  assert.equal(
    await evaluate(`Boolean(document.querySelector('[data-key="processPlacement"]'))`),
    true,
  );
  record('Manual Extend, distinct Etch profile/surface, negative Implant tilt bounds');
  await click('[data-action="hide-editor"]');
  assert.equal(
    await evaluate(
      "document.querySelector('.p-nav')===null && document.querySelector('.p-empty-strip')===null",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(\'[data-action="expand-empty"]\').parentElement===document.querySelector(\'[data-action="mode:single"]\').parentElement',
    ),
    true,
  );
  await click('[data-action="expand-empty"]');
  assert.equal(
    await evaluate(
      "window.__m2MainHost===document.querySelector('[data-science=\"main\"]') && window.__m2Workbench===document.querySelector('.p-workbench')",
    ),
    true,
  );
  record('stable workstation / view content slots across navigation and hide/restore');
  record('Hide both navigation/editor; Restore inline before Single');
  await click('[data-action="apply"]');
  assert.equal((await snapshot()).state.task.total, 1);
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.p-panel-content input')].every(input=>input.disabled)",
    ),
    true,
  );
  await click('[data-action="complete"]');
  assert.match((await snapshot()).state.message, /Manual simulation complete/);
  await click('[data-action="domain:recipe"]');
  const recipeBeforeEdit = (await snapshot()).recipeSteps;
  await click('[data-action="add-step"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit + 1);
  await click('[data-action="recipe-undo"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit);
  await click('[data-action="recipe-redo"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit + 1);
  await click(`[data-action="delete-step:${recipeBeforeEdit}"]`);
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit);
  await click('[data-action="template-preview"]');
  assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`), true);
  await click('dialog[open] [data-action="dialog-cancel"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit);
  record(
    'Recipe add/delete and independent undo/redo; template replacement requires explicit confirmation',
  );
  await click('[data-action="run-all"]');
  assert.equal((await snapshot()).state.task.total, 35);
  await click('[data-action="fail"]');
  assert.equal((await snapshot()).state.failedStep, 2);
  await click('[data-action="run-all"]');
  await click('[data-action="complete"]');
  assert.match((await snapshot()).state.message, /Recipe simulation complete/);
  record('distinct Manual / Recipe feedback, busy locks, failed Step locator');
  await click('[data-action="domain:code"]');
  assert.equal(
    await evaluate("document.querySelector('.p-code-editor').value.includes('deposit(')"),
    true,
  );
  record('Process Manual / Recipe / Code');
  await click('[data-action="domain:history"]');
  const before = await evaluate(
    "(() => {const node=document.querySelector('[data-history-list] button:last-child');node.scrollIntoView({block:'nearest'});return document.querySelector('.p-panel-content').scrollTop})()",
  );
  await click('[data-history-list] button:last-child');
  assert.ok(
    Math.abs((await evaluate("document.querySelector('.p-panel-content').scrollTop")) - before) <=
      1,
  );
  record('History selection retains scroll');
  await click('[data-action="domain:process"]');
  for (const width of [1440, 1024]) {
    await viewport(width);
    await click('[data-action="mode:split"]');
    if (!(await snapshot()).state.roi) await click('[data-view="main"] [data-action="roi"]');
    const metrics = await evaluate(
      `(() => {const rect=name=>{const r=document.querySelector('[data-view="'+name+'"] [data-roi-mark]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};const main=rect('main'),three=rect('three');const panel=document.querySelector('.p-inspector').getBoundingClientRect(),stage=document.querySelector('.p-stage').getBoundingClientRect();return {main,three,overlap:panel.right>stage.left}})()`,
    );
    assert.ok(
      Math.abs(metrics.main.top - metrics.three.top) <= 0.25,
      `ROI top alignment at ${width}`,
    );
    assert.ok(
      Math.abs(metrics.main.bottom - metrics.three.bottom) <= 0.25,
      `ROI bottom alignment at ${width}`,
    );
    assert.equal(metrics.overlap, false);
    roi.push({
      width,
      topDelta: metrics.main.top - metrics.three.top,
      bottomDelta: metrics.main.bottom - metrics.three.bottom,
    });
    await evaluate(
      "(() => {const select=document.querySelector('[data-key=\"split-left\"]');select.value='three';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    assert.deepEqual((await snapshot()).state.splitViews, ['three', 'main']);
    await evaluate(
      "(() => {const select=document.querySelector('[data-key=\"split-left\"]');select.value='main';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    record(`${width}: dock no overlap, strict ROI alignment, Split swap`);
  }
  await click('[data-view="main"] [popovertarget]');
  await waitFor(
    async () => evaluate("Boolean(document.querySelector('.p-overflow:popover-open')?.style.top)"),
    'More menu positioned',
  );
  const menu = await evaluate(
    "(() => {const p=document.querySelector('.p-overflow:popover-open'),b=document.querySelector('[popovertarget=\"'+p.id+'\"]');const r=p.getBoundingClientRect(),t=b.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,buttonTop:t.top,buttonBottom:t.bottom,viewport:innerWidth}})()",
  );
  assert.ok(menu.left >= 0 && menu.left + menu.width <= menu.viewport);
  assert.ok(
    Math.abs(menu.top - menu.buttonBottom - 4) < 1 ||
      Math.abs(menu.top + menu.height - menu.buttonTop + 4) < 1,
    JSON.stringify(menu),
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  assert.equal(await evaluate("document.querySelector('.p-overflow:popover-open')===null"), true);
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.p-view-head [data-action^=\"export:\"]')].every(button=>Boolean(button.closest('[popover]')))",
    ),
    true,
  );
  record('More anchored menu / Esc / Export inside menu only');
  await evaluate(
    "(() => {const select=document.querySelector('[data-key=\"split-right\"]');select.value='mask';select.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await call('Page.reload');
  await waitFor(
    async () =>
      evaluate("document.body?.dataset.ready==='true' && Boolean(window.WaferCadV2Shell)"),
    'reload',
  );
  assert.equal((await snapshot()).state.mode, 'split');
  assert.deepEqual((await snapshot()).state.splitViews, ['main', 'mask']);
  record('sessionStorage view mode survives reload');
  for (const width of [768, 390]) {
    await viewport(width);
    assert.equal(await evaluate("document.querySelector('.p-stage').dataset.viewMode"), 'single');
    const flow = await evaluate(
      "(() => {const editor=document.querySelector('.p-inspector').getBoundingClientRect(),stage=document.querySelector('.p-stage').getBoundingClientRect();return {editorTop:editor.top,stageBottom:stage.bottom,position:getComputedStyle(document.querySelector('.p-inspector')).position}})()",
    );
    assert.ok(flow.editorTop >= flow.stageBottom - 1);
    assert.ok(!['absolute', 'fixed'].includes(flow.position));
    record(`${width}: Single, normal-flow editor, no overlay/flyout`);
    await click('[data-action="mobile-section"]');
    const legendFlow = await evaluate(
      "(() => {const plot=document.querySelector('[data-science=\"section\"]').getBoundingClientRect(),legend=document.querySelector('#layerLegend').getBoundingClientRect();return {top:legend.top,bottom:plot.bottom,right:legend.right,width:innerWidth}})()",
    );
    assert.ok(legendFlow.top >= legendFlow.bottom - 1);
    assert.ok(legendFlow.right <= legendFlow.width);
    assert.equal((await checkLegend()).matches, true);
    record(`${width}: Section legend below plot, no overlay`);
  }
  await viewport(1440);
  assert.equal((await snapshot()).state.mode, 'split');
  await evaluate(
    "window.WaferCadV2Shell.debug({example:'photodetector',domain:'history',empty:true})",
  );
  assert.equal((await snapshot()).sourceBranches, 7);
  await evaluate('window.WaferCadV2Shell.debug({empty:false})');
  assert.ok(
    await evaluate(`document.querySelectorAll('.p-history-tree [data-depth="1"]').length > 0`),
  );
  record('Photodetector History tree nests Variants under their actual origin Steps');
  await evaluate('window.WaferCadV2Shell.debug({empty:true})');
  assert.equal(await evaluate("document.querySelector('.p-inspector')===null"), true);
  record('Photodetector real Variants / empty History reclaims inspector');
  await evaluate(
    "window.WaferCadV2Shell.debug({example:'photodetector',domain:'process',empty:false})",
  );
  legend = await checkLegend();
  assert.equal(legend.annotations, 2);
  assert.equal(legend.matches && legend.visible, true);
  assert.equal((await snapshot()).sourceFrozen, true);
  record('Photodetector legend includes two real Implant annotations; source remains frozen');
  await call('Page.navigate', { url: pathToFileURL(resolve('site/app-v2.html')).href });
  await waitFor(
    async () =>
      evaluate("document.body?.dataset.ready==='true' && Boolean(window.WaferCadV2Shell)"),
    'direct file boot',
  );
  record('double-click file:// boot, no server or fetch required');
  assert.deepEqual(errors, [], 'No browser console/page errors');
  const version = await (await fetch(`${endpoint}/json/version`)).json();
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        results: checks,
        roi,
        browser: version.Browser,
        errors,
        playwright: false,
        screenshots: false,
        profile,
      },
      null,
      2,
    ),
  );
} finally {
  socket?.close();
  browser.kill();
  for (const item of pending.values()) clearTimeout(item.timeout);
}
