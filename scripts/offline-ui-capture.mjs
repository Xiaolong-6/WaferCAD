#!/usr/bin/env node
// Real v2 shell-components-only capture, without app startup or navigation.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineSourceRevision } from './offline-source-revision.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '../site');
const components = {
  navigation: '.p-nav',
  topbar: '.p-topbar',
  viewbar: '.p-viewbar',
};
const bootScripts = [
  'ui-v2/view-state.js',
  'ui-v2/view-icons.js',
  'ui-v2/native-components.js',
  'ui-v2/view-panel.js',
  'ui-v2/shell-registry.js',
  'ui-v2/domain-adapters.js',
  'ui-v2/overlay-manager.js',
  'ui-v2/workstation-v2.js',
];
function parse(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw Error('Expected --option value pairs.');
    opts[argv[i]] = argv[i + 1];
  }
  for (const option of Object.keys(opts))
    if (
      !['--component', '--width', '--height', '--output', '--domain', '--mobile'].includes(option)
    )
      throw Error(`Unknown option ${option}`);
  return opts;
}
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
export async function captureShell(options = {}) {
  const component = options['--component'] || 'navigation';
  if (!Object.hasOwn(components, component))
    throw Error(`Unsupported Shell component: ${component}`);
  const width = Number(options['--width'] || 390);
  const height = Number(options['--height'] || 844);
  if (
    !Number.isInteger(width) ||
    width < 320 ||
    width > 4096 ||
    !Number.isInteger(height) ||
    height < 320 ||
    height > 4096
  )
    throw Error('Invalid viewport.');
  const domain = options['--domain'] || 'project';
  if (!['project', 'mask', 'process', 'history'].includes(domain))
    throw Error('Unknown workspace domain.');
  const mobile = options['--mobile'] || 'edit';
  if (!['edit', 'view'].includes(mobile)) throw Error('Mobile must be edit or view.');
  const html = await readFile(join(site, 'app.html'), 'utf8');
  const cssNames = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(
    (match) => match[1].split('?')[0],
  );
  const sources = [];
  for (const name of [...cssNames, ...bootScripts]) {
    if (!/^[a-z0-9/_-]+\.(css|js)$/i.test(name)) throw Error(`Invalid source path: ${name}`);
    sources.push({ name, code: await readFile(join(site, name), 'utf8') });
  }
  const css = sources
    .slice(0, cssNames.length)
    .map((item) => `/* ${item.name} */\n${item.code}`)
    .join('\n');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.WAFERCAD_CHROMIUM || undefined,
    args: ['--no-sandbox'],
  });
  const out = resolve(options['--output'] || 'test-results/offline-ui');
  const screenshot = join(out, `${component}-${width}.png`);
  const metadataPath = join(out, `${component}-${width}.evidence.json`);
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent(
      `<!doctype html><html lang="en" data-ui="v2" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body data-workstation><main id="app-root"></main></body></html>`,
    );
    for (const item of sources.slice(cssNames.length))
      await page.addScriptTag({ content: item.code });
    // Instantiate the production shell, native icons and real panel chrome.
    // Empty adapters deliberately supply no scientific data or fabricated business state.
    await page.evaluate(
      ({ domain, mobile }) => {
        window.WaferCadV2Icons.installSprite();
        const registry = window.WaferCadV2ShellRegistry.defaults;
        const { el } = window.WaferCadV2Components;
        const panels = window.createWaferCadV2ViewPanels();
        const adapters = window.WaferCadV2DomainAdapters.create();
        const empty = { mount: (host) => host, onShow() {}, onHide() {}, destroy() {} };
        for (const name of registry.panels) adapters.register(`panel.${name}`, empty);
        for (const name of registry.processModes) adapters.register(`panel.process.${name}`, empty);
        for (const { key, label } of registry.views) {
          adapters.register(`view.${key}`, {
            mount(host) {
              const panel = panels.update(
                key,
                { class: 'p-view', 'data-view': key },
                el('header', {}, el('strong', {}, label)),
                el('div', {
                  class: 'p-science',
                  'data-v2-stage-host': '',
                  'aria-label': `${label} not loaded`,
                }),
                el('div'),
              );
              host.append(panel);
              return panel;
            },
            onShow() {},
            onHide() {},
            destroy() {},
          });
        }
        const state = {
          layout: 'a',
          font: 'inter',
          domain,
          mode: 'single',
          view: 'main',
          splitViews: ['main', 'three'],
          section: false,
          maximize: null,
          mobile,
        };
        const shell = window.createWaferCadV2Workstation({
          root: document.getElementById('app-root'),
          state,
          adapters,
          registry,
          getProjectName: () => 'WaferCAD',
          presentation: () => ({
            selectedNavigation: domain,
            selectedPanel: domain,
            message: 'Shell inspection only',
            save: 'No persistence',
          }),
        });
        shell.render();
      },
      { domain, mobile },
    );
    const locator = page.locator(components[component]);
    await locator.waitFor({ state: 'visible' });
    const box = await locator.boundingBox();
    if (!box?.width || !box?.height) throw Error('Native UI component has no visible bounds.');
    await mkdir(out, { recursive: true });
    await locator.screenshot({ path: screenshot, animations: 'disabled' });
    if (errors.length) throw Error(`Native Shell generated errors: ${errors.join('; ')}`);
    const sourceRevision = offlineSourceRevision(resolve(site, '..'));
    const evidence = {
      schema: 'wafercad-offline-ui-shell-p0',
      ...sourceRevision,
      component,
      domain,
      mobile,
      viewport: { width, height },
      bounds: box,
      sourceSha256: Object.fromEntries(sources.map((item) => [item.name, sha256(item.code)])),
      method: 'native-v2-shell-inline-scripts-css-about-blank',
      limitations: [
        'Shell-only: no domain adapters, real Example, scientific views, persistence or application interactions. Not full-browser visual acceptance.',
      ],
    };
    await writeFile(metadataPath, `${JSON.stringify(evidence, null, 2)}\n`);
    return { screenshot, metadataPath, evidence };
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureShell(parse(process.argv.slice(2)))
    .then(({ screenshot, metadataPath }) =>
      console.log(JSON.stringify({ screenshot, metadataPath })),
    )
    .catch((error) => {
      console.error(error.stack || String(error));
      process.exitCode = 1;
    });
}
