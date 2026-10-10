// Independently validate the source inventory against Chromium's HTML parser
// and the live legacy Recipe initializer. Requires the normal local UI server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  baseUrl,
  launchBrowser,
  newUiPage,
  observePageErrors,
  waitForAppReady,
} from './test-helpers/ui.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const contract = JSON.parse(await readFile(resolve(repo, 'docs/ui-v2/contract.json'), 'utf8'));
const html = await readFile(resolve(repo, 'site/app.html'), 'utf8');
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser);
  try {
    // Source-only DOM parsing is separate from the application's reparenting,
    // removed roles and generated controls. Never execute the boot script here.
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    const staticNodes = await page.locator('[id]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.id,
        tag: node.tagName.toLowerCase(),
        attributes: Object.fromEntries([...node.attributes].map((attr) => [attr.name, attr.value])),
      })),
    );
    assert.equal(staticNodes.length, contract.ids.length, 'Browser/source ID count');
    for (const actual of staticNodes) {
      const expected = contract.ids.find((entry) => entry.id === actual.id);
      assert.ok(expected, `Missing source ID: ${actual.id}`);
      assert.equal(actual.tag, expected.tag, actual.id);
      assert.deepEqual(actual.attributes, expected.attributes, actual.id);
    }

    const errors = observePageErrors(page);
    await page.goto(`${baseUrl}/app.html?start=empty`);
    await waitForAppReady(page);
    assert.equal(await page.locator('#recipeProcessPane').getAttribute('data-ready'), 'true');
    const liveIds = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(liveIds.length, new Set(liveIds).size, 'Runtime duplicate IDs');
    const generated = contract.dynamicIds.filter(
      (entry) => entry.file === 'site/controllers/process-recipe-controller.js' && entry.tag,
    );
    assert.ok(generated.length > 0, 'Recipe markup inventory must not be empty');
    for (const entry of generated) {
      const id = entry.patterns[0];
      assert.ok(id && !id.includes('${'), 'Initializer IDs must be concrete');
      assert.equal(await page.locator(`[id="${id}"]`).count(), 1, id);
    }
    assert.deepEqual(errors, [], 'Unexpected page exceptions');
    console.log(
      JSON.stringify({
        browser: browser.version(),
        staticIds: staticNodes.length,
        staticAttributes: 'exact browser match',
        runtimeIds: liveIds.length,
        recipeMarkupIdsVerified: generated.length,
      }),
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
