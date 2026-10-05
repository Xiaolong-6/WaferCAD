import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { runProductLayoutCases } from './product-layout-cases.mjs';
import { runRendererProductCases } from './renderer-product-cases.mjs';
import {
  captureProductReview,
  openProductPage,
} from './test-helpers/product.mjs';
import { createProductLayoutChecks } from './test-helpers/product-layout.mjs';

await loadGeometryKernel();

const productScope = process.env.WAFERCAD_PRODUCT_SCOPE || 'all';
assert.ok(
  ['all', 'layout', 'renderer'].includes(productScope),
  `Unknown WAFERCAD_PRODUCT_SCOPE: ${productScope}`,
);

const runLayout = productScope === 'all' || productScope === 'layout';
const runRenderer = productScope === 'all' || productScope === 'renderer';
const output = resolve(process.env.WAFERCAD_REVIEW_DIR || 'test-results/product-review');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM
    ? { executablePath: process.env.WAFERCAD_CHROMIUM }
    : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const cases = [];
const errors = [];
const open = (viewport, touch = false) =>
  openProductPage(browser, viewport, touch, errors);
const capture = (page, name) =>
  captureProductReview(page, name, output, cases);
const layoutChecks = createProductLayoutChecks({ capture });

try {
  if (runLayout) {
    await runProductLayoutCases({
      open,
      capture,
      output,
      checks: layoutChecks,
    });
  }

  if (runRenderer) {
    const { page, context } = await open({ width: 1440, height: 900 });
    await runRendererProductCases({ page, capture });
    await context.close();
  }

  assert.deepEqual(errors, []);

  await writeFile(
    join(output, 'report.json'),
    JSON.stringify({ scope: productScope, cases, errors }, null, 2),
  );

  const cards = cases
    .map(
      (name) =>
        `<figure><a href="${name}.png"><img src="${name}.png" loading="lazy"></a><figcaption>${name}</figcaption></figure>`,
    )
    .join('');

  const scopeDescription =
    productScope === 'layout'
      ? 'responsive layout/product review · 1440 / 1000 / 390 px plus breakpoint edges'
      : productScope === 'renderer'
        ? 'wide-screen renderer acceptance · Chromium/WebGL'
        : 'responsive layout plus wide-screen renderer acceptance';

  await writeFile(
    join(output, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>WaferCAD product review</title><style>body{font:14px system-ui;margin:24px;background:#f4f6f8}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0;background:white;padding:10px}img{width:100%;height:280px;object-fit:contain}figcaption{margin-top:8px}</style><h1>WaferCAD product review</h1><p>${cases.length} captures · ${scopeDescription}. Open each image to inspect full resolution.</p><main>${cards}</main>`,
  );

  console.log(
    `WaferCAD product ${productScope} regression: OK (${cases.length} captures)`,
  );
} finally {
  await browser.close();
}
