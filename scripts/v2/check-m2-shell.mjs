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
  console.log('PASS', name);
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
    `(() => {const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getClientRects().length);if(!el)throw Error('Missing button');el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
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
  // M2.5 regression: DOM replaceChildren must receive spread registry entries,
  // not an array coerced into "[object HTMLButtonElement]" text.
  const mockEntry = url;
  const productionEntryUrl = new URL('ui-v2/app.html', url).href;
  for (const [entry, readyExpression] of [
    [mockEntry, 'Boolean(window.WaferCadV2Shell?.ready)'],
    [productionEntryUrl, 'Boolean(window.WaferCadV2ProductionShell)'],
  ]) {
    await call('Page.navigate', { url: entry });
    await waitFor(async () => evaluate(readyExpression), `M2.5 navigation entry ${entry}`);
    for (const width of [1440, 1024, 768, 390]) {
      await viewport(width);
      const nav = await evaluate(`(() => {
        const registry = window.WaferCadV2ShellRegistry.defaults;
        const host = document.querySelector('[data-slot="navigation.primary"]');
        const keys = registry.primaryNav.map((item) => item.key);
        return {
          actual: keys.filter((key) =>
            host?.querySelector('button[data-action="domain:' + key + '"]')?.getClientRects().length),
          expected: keys,
          rawText: host?.textContent || '',
          rows: [...host.querySelectorAll('button')].map((node) =>
            node.getBoundingClientRect().top),
        };
      })()`);
      assert.deepEqual(nav.actual, nav.expected, `navigation buttons at ${width}px in ${entry}`);
      assert.ok(!nav.rawText.includes('[object HTMLButtonElement]'));
      assert.ok(
        Math.max(...nav.rows) - Math.min(...nav.rows) <= 1,
        `primary navigation stays on one row at ${width}px in ${entry}`,
      );
      record(
        `M2.5: ${entry.endsWith('/ui-v2/app.html') ? 'production' : 'mock'} navigation at ${width}px`,
      );
    }
  }
  await viewport(1440);
  await call('Page.navigate', { url: mockEntry });
  await waitFor(
    async () =>
      evaluate("document.body?.dataset.ready==='true' && Boolean(window.WaferCadV2Shell?.ready)"),
    'return to mock shell after M2.5 navigation audit',
  );
  assert.equal((await snapshot()).sourceFrozen, true);
  record('v2 entry / Inter font / frozen real-source mocks');
  const iconTools = await evaluate(`([...document.querySelectorAll('.p-view .p-tool-group button')]
    .filter(button => /^(fit:|tool:pan:|tool:zoom:)/.test(button.dataset.action))
    .map(button => ({text:button.textContent.trim(), label:button.getAttribute('aria-label'),
      title:button.title, icon:Boolean(button.querySelector('svg'))})))`);
  assert.equal(iconTools.length, 12);
  assert.ok(
    iconTools.every(
      ({ text, label, title, icon }) =>
        text === '' && ['Fit', 'Pan', 'Zoom'].includes(label) && title === label && icon,
    ),
  );
  assert.equal(await evaluate("document.querySelector('.v2-legend-note') === null"), true);
  record('four view toolbars use named icon-only Fit/Pan/Zoom; Legend has no developer footer');
  // M2.5: shell must be entirely presentation-only and production entry fixture-free.
  const shellSource = await readFile('site/ui-v2/workstation-v2.js', 'utf8');
  assert.doesNotMatch(shellSource, /task|history|placement|dirty/i);
  const productionEntry = await readFile('site/ui-v2/app.html', 'utf8');
  assert.doesNotMatch(productionEntry, /mock-data\.js|mock-workspace\.js|mock-domain-panels\.js/);
  assert.match(productionEntry, /<html[^>]+lang="zh-CN"/);
  record('shell excludes domain knowledge; production-safe entry loads no mocks');
  const identity = await evaluate(`(() => {
    window.__m25Mounts = Object.fromEntries(['main','mask','three','section'].map((id) =>
      [id,document.querySelector('[data-slot="view.'+id+'.stage"]')]));
    window.__m25Panels = Object.fromEntries(['project','base','mask','process','history'].map((id) =>
      [id,window.WaferCadV2Shell.getSlot('panel.'+id)]));
    return Object.values(window.__m25Mounts).every(Boolean) &&
      Object.values(window.__m25Panels).every(Boolean) &&
      ['step','recipe','code','diagnostics'].every((id) =>
        Boolean(window.WaferCadV2Shell.getSlot('panel.process.'+id))) &&
      ['portal.popover','portal.dialog','portal.toast','status.message','status.save','status.version']
        .every((id)=>Boolean(window.WaferCadV2Shell.getSlot(id)));
  })()`);
  assert.equal(identity, true);
  for (const target of ['project', 'mask', 'process', 'history', 'project']) {
    await click(`[data-action="domain:${target}"]`);
    assert.equal(
      await evaluate(`(() => {
        const selected=document.querySelector('.p-nav [aria-pressed="true"]');
        return selected?.dataset.action==='domain:${target}' &&
          Number(getComputedStyle(selected).fontWeight)>=600 &&
          document.querySelector('.p-inspector > .p-panel-head')===null;
      })()`),
      true,
      'selected navigation emphasizes the active editor without a duplicate title',
    );
    if (target === 'project' || target === 'process') {
      assert.ok(
        await evaluate(
          "parseFloat(getComputedStyle(document.querySelector('.p-panel-content')).paddingLeft)>=12",
        ),
        'hidden History must not remove active editor padding',
      );
    }
    assert.equal(
      await evaluate(`(() => ['main','mask','three','section'].every((id)=>
      window.__m25Mounts[id]===document.querySelector('[data-slot="view.'+id+'.stage"]')) &&
      ['project','base','mask','process','history'].every((id)=>
      window.__m25Panels[id]===window.WaferCadV2Shell.getSlot('panel.'+id)))()`),
      true,
    );
  }
  record('all four science hosts and five domain hosts preserve node identity through navigation');
  record('editor omits duplicate workspace title and emphasizes selected navigation');
  await click('[data-action="domain:project"]');
  const baseWidth = await evaluate(
    'Number(document.querySelector(\'[data-key="base:width"]\').value)',
  );
  await evaluate(`(() => {const input=document.querySelector('[data-key="base:width"]');
    input.value=${baseWidth + 5};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('[data-action="base-rebuild"]');
  await click('[data-action="base-keep"]');
  assert.equal((await snapshot()).state.baseApplied.width, baseWidth + 5);
  assert.equal((await snapshot()).sourceFrozen, true);
  await evaluate(`(() => {const input=document.querySelector('[data-key="base:thickness"]');
    input.value=0;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(
    await evaluate("document.querySelector('[data-action=base-rebuild]').disabled"),
    true,
  );
  await evaluate(`(() => {const input=document.querySelector('[data-key="base:thickness"]');
    input.value=2;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  record('Base named adapter edits and confirms only a positive physical-unit draft');
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="baseShape"]');input.value='circle';input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  assert.equal((await snapshot()).state.baseDraft.height, (await snapshot()).state.baseDraft.width);
  assert.equal(await evaluate('document.querySelector(\'[data-key="base:height"]\')===null'), true);
  await click('[data-action="base-revert"]');
  assert.equal((await snapshot()).state.baseDraft.width, baseWidth);
  assert.equal((await snapshot()).state.baseShape, 'rect');
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="base:width"]');input.value=${baseWidth + 5};input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  record(
    'Base Circle uses a single diameter; Revert restores source dimensions without a model transaction',
  );
  await evaluate(
    "(() => {const unit=document.querySelector('.p-panel-content [data-key=displayUnit]');unit.value='nm';unit.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  assert.equal(await evaluate("!document.querySelector('.p-topbar [data-key=displayUnit]')"), true);
  await click('[data-action="domain:process"]');
  await click('[data-action="domain:project"]');
  assert.equal(
    await evaluate('Number(document.querySelector(\'[data-key="base:width"]\').value)'),
    (baseWidth + 5) * 1000,
  );
  await click('[data-action="domain:process"]');
  assert.ok(
    await evaluate(`(() => {
    const tops=[...document.querySelectorAll('[aria-label="Process modes"] button')]
      .filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect().top);
    return tops.length===4 && Math.max(...tops)-Math.min(...tops)<=1;
  })()`),
    'Process modes stay on one row',
  );
  assert.equal(await evaluate("document.querySelector('[data-key=thickness]').value"), '70');
  assert.equal(
    await evaluate(
      "(() => {const apply=document.querySelector('[data-action=apply]'),undo=document.querySelector('[data-action=draft-undo]'),redo=document.querySelector('[data-action=draft-redo]');return Boolean(apply.compareDocumentPosition(undo)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(redo)})()",
    ),
    true,
  );
  await click('[data-action="draft-undo"]');
  assert.equal((await snapshot()).state.displayUnit, 'um');
  assert.equal(
    await evaluate(`(() => {
    const group=document.querySelector('.p-apply-actions');
    const apply=group.querySelector('[data-action=apply]').getBoundingClientRect();
    return ['undo','redo'].every(kind=>{
      const button=group.querySelector('[data-action="draft-'+kind+'"]');
      const href=button.querySelector('use').getAttribute('href');
      return button.getAttribute('aria-label')===kind[0].toUpperCase()+kind.slice(1)+' form edit'
        && Boolean(document.querySelector(href+' path'))
        && Math.abs(button.getBoundingClientRect().top-apply.top)<=1;
    });
  })()`),
    true,
  );
  record(
    'Project owns XYZ display units; Manual groups Apply with named form Undo/Redo and rendered icons',
  );
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
      const key=(model.layers.includes(item)?'layer:':'annotation:')+item.id;const sample=document.createElement('span');sample.style.backgroundColor=snap.state.legendColors?.[key]||item.color;
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
  await click('#layerLegend .v2-legend-palette-trigger');
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#layerLegend .v2-legend-swatch-choice').length===20&&document.querySelector('#layerLegend [data-action^=legend-random]')!==null",
    ),
    true,
  );
  const paletteColor = await evaluate(
    "document.querySelector('#layerLegend .v2-legend-swatch-choice').dataset.color",
  );
  await evaluate(`document.querySelector('#layerLegend .v2-legend-swatch-choice').click()`);
  assert.equal(
    await evaluate(
      `(() => {const sample=document.createElement('span');sample.style.backgroundColor=${JSON.stringify(paletteColor)};return document.querySelector('#layerLegend .v2-legend-swatch').style.backgroundColor===sample.style.backgroundColor})()`,
    ),
    true,
  );
  await click('#layerLegend .v2-legend-palette-trigger');
  await click('#layerLegend [data-action^="legend-random:"]');
  assert.equal(
    await evaluate(
      "window.WaferCadV2LegendPalette.includes(window.WaferCadV2Shell.snapshot().state.legendColors['layer:'+document.querySelector('#layerLegend [data-layer-id]').dataset.layerId])",
    ),
    true,
  );
  record(
    'Legend preset palette and Random color controls update only the local presentation draft',
  );
  await evaluate(
    "window.__m2MainHost=document.querySelector('[data-science=\"main\"]');window.__m2Workbench=document.querySelector('.p-workbench')",
  );
  await click('[data-action="domain:mask"]');
  assert.equal((await snapshot()).state.maximize, 'mask');
  assert.equal(
    await evaluate(
      "!document.querySelector('[data-file-cells]') && !document.querySelector('[data-key^=\"file-layer-visible:\"]') && document.querySelector('.p-panel-content').textContent.includes('drawn shapes')",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "Boolean(document.querySelector('[data-science=mask] .p-mask-tools')) && !document.querySelector('.p-panel-content [data-key=roiX]')",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.p-mask-tools [data-action=roi]')!==null&&document.querySelector('.p-mask-tools [data-action^=draw-tool]')!==null&&document.querySelector('.p-mask-tools [data-action=mask-roi-settings]')!==null",
    ),
    true,
  );
  await evaluate(
    "(() => {const el=document.querySelector('[data-key=maskMode]');el.value='file';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.p-mask-tools [data-action^=draw-tool]')===null&&document.querySelector('.p-mask-tools [data-action=roi]')!==null&&document.querySelector('.p-mask-tools [data-action=mask-roi-settings]')!==null",
    ),
    true,
  );
  await evaluate(
    "(() => {const el=document.querySelector('[data-key=maskMode]');el.value='draw';el.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  assert.equal(
    await evaluate(
      "new Set([...document.querySelectorAll('.p-mask-tools [data-action^=draw-tool] use')].map(icon=>icon.getAttribute('href'))).size===6",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "(() => {const icon=document.querySelector('.p-mask-tools [data-action^=draw-tool] .wc-icon'),button=icon.closest('button');const r=button.getBoundingClientRect(),i=icon.getBoundingClientRect();return !document.querySelector('.p-panel-content [data-key=roiX]')&&i.width<=16.5&&i.height<=16.5&&r.width===28&&r.height===28})()",
    ),
    true,
    'Desktop Mask tools use compact 28px buttons with 16px icons',
  );
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  assert.equal(
    await evaluate(`(() => {
    const r=document.querySelector('.p-mask-tools [data-action^=draw-tool]').getBoundingClientRect();
    return matchMedia('(pointer:coarse)').matches && r.width>=40 && r.height>=40;
  })()`),
    true,
  );
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  record('Draw tools use compact desktop buttons and retain 40px coarse-pointer targets');
  const drawCount = (await snapshot()).state.drawDraft.length;
  await click('[data-action="draw-tool:ring-sector"]');
  await click('[data-action="draw-add"]');
  assert.equal(
    (await snapshot()).state.drawDraft.length,
    drawCount + 1,
    JSON.stringify(
      await evaluate(
        "({disabled:document.querySelector('[data-action=draw-add]')?.disabled,tool:document.querySelector('[data-action^=draw-tool][aria-pressed=true]')?.dataset.action})",
      ),
    ),
  );
  await click('[data-action="draw-delete"]');
  assert.equal((await snapshot()).state.drawDraft.length, drawCount);
  await click('[data-action="mask-roi-settings"]');
  assert.equal(
    await evaluate("Boolean(document.querySelector('.p-mask-settings[role=dialog]'))"),
    true,
  );
  await evaluate(
    `(() => {const el=document.querySelector('.p-mask-settings [data-key="alignX"]');el.value='42';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await click('[data-action="mask-roi-close"]');
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
  const materialLegend = await evaluate("document.querySelector('#layerLegend').innerHTML");
  const layoutLayer = '[data-key="file-layer-visible:1/0"]';
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.p-inspector [data-key^="file-layer-visible:"]').length`,
    ),
    1,
  );
  assert.equal(
    await evaluate(`document.querySelector('.p-inspector [data-action^="layer:"]')===null &&
      document.querySelector('.p-inspector [data-action^="mask-layer:"]')===null`),
    true,
  );
  await click(layoutLayer);
  assert.equal((await snapshot()).state.fileLayersVisible['1/0'], false);
  await click(layoutLayer);
  assert.equal((await snapshot()).state.fileLayersVisible['1/0'], true);
  assert.equal(await evaluate("document.querySelector('#layerLegend').innerHTML"), materialLegend);
  const maskDrawCount = (await snapshot()).state.drawDraft.length;
  await evaluate(`(() => {const el=document.querySelector('[data-key="maskMode"]');
    el.value='draw';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(
    await evaluate(`document.querySelector('[data-file-cells]')===null &&
      document.querySelector('[data-key^="file-layer-visible:"]')===null`),
    true,
  );
  assert.equal((await snapshot()).state.drawDraft.length, maskDrawCount);
  assert.match(
    await evaluate("document.querySelector('#maskPanel .p-readout').textContent"),
    /^\d+ drawn shapes ·/,
  );
  await evaluate(`(() => {const el=document.querySelector('[data-key="maskMode"]');
    el.value='file';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal((await snapshot()).sourceFrozen, true);
  assert.match(
    await evaluate("document.querySelector('#maskPanel .p-readout').textContent"),
    /^File · TOP · layer\/datatype /,
  );
  const maskInventoryLayout = await evaluate(`(() => {
    const checkbox=document.querySelector('${layoutLayer}').getBoundingClientRect();
    const layer=document.querySelector('.p-mask-file-layer > .p-list-row').getBoundingClientRect();
    const cells=[...document.querySelectorAll('.p-cell-node > .p-list-row')];
    return Math.abs((checkbox.top+checkbox.height/2)-(layer.top+layer.height/2))<1 &&
      getComputedStyle(document.querySelector('[data-file-cells]')).listStyleType==='none' &&
      cells.every(row=>row.getBoundingClientRect().height>=32 && row.getBoundingClientRect().height<=34);
  })()`);
  assert.equal(
    maskInventoryLayout,
    true,
    'layout checkbox aligns with its row; Cells use compact unbulleted rows',
  );
  record(
    'Mask layout layers stay separate from Section materials; Draw hides file inventory; compact aligned rows',
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
    'directional,isotropic,planarize,undercut',
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
    false,
  );
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="operation"]');input.value='deposit';input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="processCoverage"]');input.value='transfer';input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  assert.equal(
    await evaluate('Boolean(document.querySelector(\'[data-key="processPlacement"]\'))'),
    true,
  );
  assert.equal(
    await evaluate(
      '[...document.querySelector(\'[data-key="area"]\').options].map(item=>item.value).join(",")',
    ),
    'mask,invert,full',
  );
  assert.equal(
    await evaluate(
      '[...document.querySelector(\'[data-key="face"]\').options].map(item=>item.value).join(",")',
    ),
    'front,back',
  );
  record(
    'Manual profiles include CMP/Undercut; Transfer placement belongs to Deposit; canonical face/area values',
  );
  await click('[data-action="hide-editor"]');
  assert.equal(
    await evaluate(
      "document.querySelector('.p-nav').hidden && document.querySelector('.p-empty-strip').hidden",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(\'.p-viewbar [data-action="expand-empty"]\').parentElement===document.querySelector(\'[data-action="mode:single"]\').parentElement',
    ),
    true,
  );
  await click('.p-viewbar [data-action="expand-empty"]');
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
  assert.ok(
    await evaluate(`(() => {const select=document.querySelector('[data-key="recipeAddKind"]');
    const add=document.querySelector('[data-action="add-step"]');
    return Math.abs(select.getBoundingClientRect().bottom-add.getBoundingClientRect().bottom)<=1;
  })()`),
    'Recipe operation and Add button share one aligned row',
  );
  const recipeBeforeEdit = (await snapshot()).recipeSteps;
  const originalStepId = await evaluate(
    "document.querySelector('[data-step-editor]').dataset.stepEditor",
  );
  await click('[data-action="copy-step"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit + 1);
  const copiedStepId = await evaluate(
    "document.querySelector('[data-step-editor]').dataset.stepEditor",
  );
  assert.notEqual(copiedStepId, originalStepId);
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="stepCommand"]');input.value='etch';input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  assert.equal(
    await evaluate("document.querySelector('[data-step-editor]').dataset.stepEditor"),
    copiedStepId,
  );
  await click('[data-action="recipe-undo"]');
  await click('[data-action="recipe-undo"]');
  assert.equal((await snapshot()).recipeSteps, recipeBeforeEdit);
  assert.equal((await snapshot()).sourceFrozen, true);
  record(
    'Recipe Copy creates a new stable ID; operation change retains ID; both edits undo independently',
  );
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
  // Shared Dialog lifecycle: Escape closes and returns focus to its owning button.
  await click('[data-action="template-preview"]');
  assert.equal(await evaluate("Boolean(document.querySelector('dialog[open]'))"), true);
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
  await waitFor(
    async () => evaluate("document.querySelector('dialog[open]')===null"),
    'dialog Escape',
  );
  assert.equal(await evaluate("document.activeElement?.dataset.action==='template-preview'"), true);
  const toast = await evaluate(`(() => {
    const overlay=window.WaferCadV2ActiveOverlays;
    const node=document.createElement('span');
    node.textContent='M2.5 status';
    overlay.mount('toast',{content:node,id:'m25-test-toast'});
    const mounted=document.querySelector('[data-slot="portal.toast"] #m25-test-toast');
    overlay.close('toast');
    return Boolean(mounted && !mounted.isConnected);
  })()`);
  assert.equal(toast, true);
  record('shared Dialog Escape/focus restoration and Toast mount/close');
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
    "(() => {const list=document.querySelector('[data-history-scroll]'),row=document.querySelector('[data-history-list] li:nth-child(3) button');row.scrollIntoView({block:'center'});return {top:list.scrollTop,actions:document.querySelector('.p-history-fixed').getBoundingClientRect().top}})()",
  );
  await click('[data-history-list] li:nth-child(3) button');
  assert.ok(
    Math.abs(
      (await evaluate("document.querySelector('[data-history-scroll]').scrollTop")) - before.top,
    ) <= 1,
  );
  assert.equal(
    await evaluate(
      `Math.abs(document.querySelector('.p-history-fixed').getBoundingClientRect().top-${before.actions})<=1&&document.querySelector('.p-history-fixed button')===null`,
    ),
    true,
  );
  await click('[data-history-list] li:nth-child(3) .p-history-more');
  assert.equal(
    await evaluate(
      "(() => {const menu=document.querySelector('[data-history-list] li:nth-child(3) [role=menu]');return menu?.querySelector('[data-action^=\"history-bookmark-add:\"]')&&menu.closest('[data-step-id]')?.querySelector('.p-history-more')?.getAttribute('aria-expanded')==='true'})()",
    ),
    true,
  );
  await click('[data-history-list] li:nth-child(3) [data-action^="history-select:"]');
  assert.equal(await evaluate("document.querySelector('.p-history-menu')===null"), true);
  record('History context has no duplicate actions; inner tree selection retains scroll position');
  assert.equal(
    await evaluate(
      "(() => {const list=document.querySelector('.p-history-roots'),row=document.querySelector('.p-history-row');return getComputedStyle(list).listStyleType==='none'&&getComputedStyle(row).borderLeftWidth==='0px'&&document.querySelector('.p-panel-content').scrollWidth<=document.querySelector('.p-panel-content').clientWidth})()",
    ),
    true,
  );
  record('History tree uses compact unbulleted rows without horizontal overflow');
  await click('[data-action="history-branch-menu:main"]');
  assert.equal(
    await evaluate(
      'document.querySelector(\'[data-action="history-delete-branch:main"]\').disabled',
    ),
    true,
  );
  await click('[data-action="history-rename:main"]');
  assert.equal(
    await evaluate(`(() => {
    const input=document.querySelector('[data-key="historyRenameName"]').getBoundingClientRect();
    const save=document.querySelector('[data-action="history-rename-confirm"]').getBoundingClientRect();
    return !document.querySelector('[popover]:popover-open') && save.top-input.bottom>=8;
  })()`),
    true,
  );
  record('History rename dismisses its menu and separates the input from dialog actions');
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="historyRenameName"]');input.value='  ';input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await click('[data-action="history-rename-confirm"]');
  assert.equal(await evaluate("Boolean(document.querySelector('dialog[open]'))"), true);
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="historyRenameName"]');input.value='Renamed Main';input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  assert.equal((await snapshot()).state.historyNames.main, 'Renamed Main');
  assert.equal(await evaluate("document.querySelector('dialog[open]')===null"), true);
  await click('[data-action="history-collapse:main"]');
  assert.equal(await evaluate("document.querySelector('[data-history-list]')===null"), true);
  await click('[data-action="history-collapse:main"]');
  assert.equal(await evaluate("Boolean(document.querySelector('[data-history-list]'))"), true);
  record(
    'History Variant rename validates whitespace, saves with Enter, preserves ID; Main deletion protected; collapse/expand',
  );
  const historyNode = await evaluate(
    "document.querySelector('[data-history-list] [data-step-id]').dataset.stepId",
  );
  await click(`[data-action="history-menu:${historyNode}"]`);
  await click(`[data-action="history-bookmark-add:${historyNode}"]`);
  const addedBookmark = (await snapshot()).state.historyBookmarks.at(-1);
  assert.equal(addedBookmark.historyNodeId, historyNode);
  await click(`[data-step-id="${historyNode}"] .p-bookmarks summary`);
  await click(`[data-action="history-bookmark-rename:${addedBookmark.id}"]`);
  await evaluate(
    `(() => {const input=document.querySelector('[data-key="historyRenameName"]');input.value='Review checkpoint';input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await click('[data-action="history-rename-confirm"]');
  assert.equal(
    (await snapshot()).state.historyBookmarks.find((item) => item.id === addedBookmark.id).name,
    'Review checkpoint',
  );
  await click(`[data-step-id="${historyNode}"] .p-bookmarks summary`);
  await click(`[data-action="history-bookmark-delete:${addedBookmark.id}"]`);
  await click('[data-action="history-bookmark-delete-confirm"]');
  assert.equal(
    (await snapshot()).state.historyBookmarks.some((item) => item.id === addedBookmark.id),
    false,
  );
  record('History bookmarks add/rename/delete are Step-local drafts and leave the source frozen');
  await click(`[data-action="history-menu:${historyNode}"]`);
  await click(`[data-action="history-variant:${historyNode}"]`);
  const draftVariant = await evaluate(
    "[...document.querySelectorAll('[data-branch-id]')].find(item=>item.dataset.branchId.startsWith('prototype-variant-')).dataset.branchId",
  );
  await click(`[data-action="history-branch-menu:${draftVariant}"]`);
  await click(`[data-action="history-delete-branch:${draftVariant}"]`);
  await click('dialog [data-action="dialog-cancel"]');
  assert.equal((await snapshot()).prototypeVariants, 1);
  assert.equal(
    await evaluate(
      `document.activeElement?.dataset.action===${JSON.stringify(`history-branch-menu:${draftVariant}`)}`,
    ),
    true,
  );
  await click(`[data-action="history-branch-menu:${draftVariant}"]`);
  await click(`[data-action="history-delete-branch:${draftVariant}"]`);
  await click('[data-action="history-delete-branch-confirm"]');
  assert.equal((await snapshot()).prototypeVariants, 0);
  assert.equal((await snapshot()).branch, 'main');
  assert.equal((await snapshot()).sourceFrozen, true);
  record(
    'History Variant deletion requires confirmation; cancellation retains draft, active deletion returns to parent',
  );
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
    await click('[data-action="domain:history"]');
    const history = await evaluate(`(() => {
      const node=document.querySelector('[data-history-scroll]'),rect=node.getBoundingClientRect();
      return {height:node.clientHeight,total:node.scrollHeight,x:rect.x+rect.width/2,
        y:Math.min(innerHeight-40,rect.y+80),top:rect.top,
        plot:document.querySelector('[data-science="section"]').getBoundingClientRect().height};
    })()`);
    assert.ok(history.height >= 250 && history.total > history.height && history.top < 1000);
    assert.ok(history.plot >= 240);
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: history.x,
      y: history.y,
      deltaX: 0,
      deltaY: 10000,
    });
    await waitFor(
      async () =>
        evaluate(`(() => {const node=document.querySelector('[data-history-scroll]');
      return node.scrollTop>0 && node.scrollTop+node.clientHeight>=node.scrollHeight-2;})()`),
      `${width} History wheel bottom`,
    );
    record(
      `${width}: History has visible bounded content and wheel reaches the last Step; plot retains 240px height`,
    );
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
  assert.equal(await evaluate("document.querySelector('.p-inspector').hidden"), true);
  record('Photodetector real Variants / empty History reclaims inspector');
  await evaluate(
    "window.WaferCadV2Shell.debug({example:'photodetector',domain:'process',empty:false})",
  );
  legend = await checkLegend();
  assert.equal(legend.annotations, 2);
  assert.equal(legend.matches && legend.visible, true);
  assert.equal((await snapshot()).sourceFrozen, true);
  record('Photodetector legend includes two real Implant annotations; source remains frozen');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 650,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const mode of ['process', 'recipe', 'history']) {
    await click(`[data-action="domain:${mode}"]`);
    const scrollSelector = mode === 'history' ? '[data-history-scroll]' : '.p-panel-content';
    const scroll = await evaluate(`(() => {const node=document.querySelector('${scrollSelector}');
      const rect=node.getBoundingClientRect();return {height:node.clientHeight,total:node.scrollHeight,
      x:rect.x+rect.width/2,y:rect.y+Math.min(rect.height/2,100)};})()`);
    assert.ok(scroll.total > scroll.height, `${mode} content must create real scroll range`);
    await call('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: scroll.x,
      y: scroll.y,
      deltaX: 0,
      deltaY: 10000,
    });
    await waitFor(
      async () =>
        evaluate(`(() => {const node=document.querySelector('${scrollSelector}');
      return node.scrollTop>0 && node.scrollTop+node.clientHeight>=node.scrollHeight-2;})()`),
      `${mode} wheel reaches content bottom`,
    );
  }
  record('Manual, Recipe and History wheel scroll reaches the bottom in a short desktop viewport');
  await click('[data-action="domain:process"]');
  const guideCases = [
    ['deposit', { processCoverage: 'direct' }, 'deposit-directional'],
    ['deposit', { processCoverage: 'conformal' }, 'deposit-conformal'],
    [
      'deposit',
      { processCoverage: 'transfer', processPlacement: 'follow' },
      'deposit-transfer-follow',
    ],
    ['deposit', { processCoverage: 'transfer', processPlacement: 'flat' }, 'deposit-transfer-flat'],
    ['extend', { processCoverage: 'direct' }, 'extend-directional'],
    ['extend', { processCoverage: 'conformal' }, 'extend-conformal'],
    ['etch', { processProfile: 'directional', processSurface: 'smooth' }, 'etch-selective'],
    ['etch', { processProfile: 'isotropic' }, 'etch-isotropic'],
    ['etch', { processProfile: 'undercut' }, 'etch-undercut'],
    ['etch', { processProfile: 'planarize' }, 'etch-planarize'],
    [
      'etch',
      { processProfile: 'directional', processSurface: 'rough', processPolarity: 'normal' },
      'etch-rough-normal',
    ],
    ['etch', { processSurface: 'rough', processPolarity: 'inverted' }, 'etch-rough-inverted'],
    ['etch', { processSurface: 'pyramid', processPolarity: 'normal' }, 'etch-pyramid-normal'],
    ['etch', { processSurface: 'pyramid', processPolarity: 'inverted' }, 'etch-pyramid-inverted'],
    ['liftoff', {}, 'liftoff'],
    ['implant', {}, 'implant'],
    ['electrical', {}, 'electrical'],
    ['record', {}, 'record'],
  ];
  for (const [operation, fields, id] of guideCases) {
    for (const [key, value] of Object.entries({ operation, ...fields }))
      await evaluate(`(() => {const input=document.querySelector('[data-key="${key}"]');
        input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(
      await evaluate(`(() => {
      const guide=document.querySelector('[data-process-guide]');
      const entry=window.WaferCadProcessGuide.processGuideEntry(${JSON.stringify(id)});
      return guide.dataset.processGuide===entry.id && guide.textContent.includes(entry.summary)
        && guide.querySelectorAll('.p-process-guide-drawing').length===2
        && [...guide.querySelectorAll('.p-process-guide-drawing')].every((node,index)=>{
          const expected=document.createElement('div');
          expected.innerHTML=window.WaferCadProcessGuide.processGuideSvg(entry.id,Boolean(index));
          return node.firstElementChild.isEqualNode(expected.firstElementChild);
        })
        && guide.querySelector('a').hash==='#'+entry.id;
    })()`),
      true,
      id,
    );
  }
  await click('.p-process-guide > summary');
  await waitFor(
    async () => evaluate('window.WaferCadV2Shell.snapshot().state.processGuideOpen===false'),
    'guide collapse',
  );
  await evaluate(`(() => {const input=document.querySelector('[data-key="operation"]');
    input.value='deposit';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate("document.querySelector('[data-process-guide]').open"), false);
  await click('.p-process-guide > summary');
  assert.equal((await snapshot()).sourceFrozen, true);
  record(
    'Manual guide matches canonical diagrams for all 18 available selector variants; collapse survives operation changes',
  );
  await click('[data-action="domain:code"]');
  assert.equal(
    await evaluate(`(() => {
    const panel=document.querySelector('.p-panel-content');
    const editor=document.querySelector('.p-code-editor').getBoundingClientRect();
    return panel.scrollHeight<=panel.clientHeight+1 && editor.height>=250
      && [...document.querySelectorAll('.p-code-workspace .p-actions button')].every(button=>
        button.getBoundingClientRect().bottom<=panel.getBoundingClientRect().bottom);
  })()`),
    true,
  );
  record('Code owns a bounded editor; actions remain visible without a second panel scrollbar');
  await click('[data-action="mode:overview"]');
  await viewport(1024);
  assert.equal(
    await evaluate(`(() => {
    const containers=[...document.querySelectorAll('.p-view-head,.p-mask-tools')]
      .filter(node=>node.getClientRects().length);
    return containers.every(node=>{
      const parent=node.getBoundingClientRect();
      return node.scrollWidth<=node.clientWidth+1 && [...node.querySelectorAll('button')]
        .filter(button=>button.getClientRects().length).every(button=>{
          const rect=button.getBoundingClientRect();
          return rect.left>=parent.left-1 && rect.right<=parent.right+1;
        });
    }) && [...document.querySelectorAll('.p-mask-tools [data-action^="draw-tool"]')]
      .every(button=>button.getBoundingClientRect().width===28 && button.getBoundingClientRect().height===28);
  })()`),
    true,
  );
  record(
    '1024 Overview: all header and compact Draw actions fit their views without horizontal scrolling',
  );
  await viewport(390);
  await click('[data-action="mobile-section"]');
  assert.equal(
    await evaluate(`(() => {
    const header=document.querySelector('#sectionPanel .p-view-head');
    const parent=header.getBoundingClientRect();
    return header.scrollWidth<=header.clientWidth+1 && [...header.querySelectorAll('button')]
      .filter(button=>button.getClientRects().length).every(button=>{
        const rect=button.getBoundingClientRect();
        return rect.left>=parent.left-1 && rect.right<=parent.right+1;
      });
  })()`),
    true,
  );
  record('390 Section: More and Max wrap within the header and remain directly visible');
  await call('Page.navigate', { url: pathToFileURL(resolve('site/app-v2.html')).href });
  await waitFor(
    async () =>
      evaluate("document.body?.dataset.ready==='true' && Boolean(window.WaferCadV2Shell)"),
    'direct file boot',
  );
  record('double-click file:// boot, no server or fetch required');
  assert.equal(await evaluate("document.querySelector('[data-process-guide] svg')!==null"), true);
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
