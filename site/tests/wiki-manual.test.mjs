import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { BUNDLED_EXAMPLES } from '../bundled-examples.js';
import { parseProcessRecipeSource } from '../process-recipe.js';

const manual = (page) => readFile(new URL(`../../docs/wiki/${page}.md`, import.meta.url), 'utf8');

test('Wiki examples cover exactly the published Welcome project families and their sources', async () => {
  const page = await manual('Examples-and-Modeling-Limits');
  const tableRows = page.split('\n').filter((line) => /^\| \[\*\*/.test(line));
  assert.equal(
    tableRows.length,
    BUNDLED_EXAMPLES.length,
    'add/update the Wiki catalog when Welcome families change',
  );
  for (const example of BUNDLED_EXAMPLES) {
    const row = tableRows.find((line) => line.includes(`[**${example.title}**]`));
    assert.ok(row, `Welcome example missing from Wiki: ${example.title}`);
    assert.ok(
      row.includes(`example=${example.id}`),
      `${example.id}: Wiki link must open the actual bundled example`,
    );
    for (const source of example.sources || []) {
      assert.ok(
        row.includes(source.doi),
        `${example.id}: Welcome DOI ${source.doi} missing from Wiki entry`,
      );
    }
  }
});

test('every shipped example section embeds a real corresponding preview asset', async () => {
  const page = await manual('Examples-and-Modeling-Limits');
  for (const example of BUNDLED_EXAMPLES) {
    const image = example.id + '-three.webp';
    assert.ok(
      page.includes('/site/examples/thumbnails/' + image),
      example.id + ': missing preview',
    );
    await access(new URL('../examples/thumbnails/' + image, import.meta.url));
  }
});

test('Wiki navigation links to both Recipe tutorials', async () => {
  for (const page of ['Home', '_Sidebar', 'Process-and-Recipes', 'Getting-Started']) {
    const text = await manual(page);
    assert.ok(text.includes('(Recipe-Code-Tutorial)'), `${page}: missing English tutorial link`);
    assert.ok(
      text.includes('(Recipe-Code-Tutorial-zh-CN)'),
      `${page}: missing Chinese tutorial link`,
    );
  }
});

test('the novice path is discoverable and names the current UI controls', async () => {
  const guide = await manual('First-10-Minutes');
  for (const entry of ['Home', '_Sidebar', 'Getting-Started', 'Troubleshooting']) {
    assert.ok((await manual(entry)).includes('(First-10-Minutes)'), `${entry}: beginner path missing`);
  }
  for (const step of [
    'Apply base',
    'Whole face',
    'Selected mask',
    'Draw',
    'Directional',
    'SiO2',
    'Section A–B',
    'Undo',
    'Recovery',
    '.wafercad',
  ]) {
    assert.ok(guide.includes(step), `novice workflow missing ${step}`);
  }
  const welcome = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(welcome, /id="welcomeEmptyBtn"[^>]*href="\.\/app\.html\?start=empty"/);
  assert.match(guide, /click \*\*Start empty\*\*/);
  assert.match(guide, /\*\*Project\*\* tab[\s\S]*\*\*XYZ unit/);
  assert.match(guide, /separate \*\*Base\*\* tab/);
  assert.match(guide, /default layer name[\s\S]*\*\*Base\*\*/);
  assert.match(guide, /uncheck Also add to Recipe/);

  const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
  const basePanel = html.slice(html.indexOf('id="baseTools"'), html.indexOf('id="maskTools"'));
  const projectPanel = html.slice(html.indexOf('id="settingsTools"'), html.indexOf('id="sectionPanel"'));
  assert.ok(basePanel.includes('id="applyBaseBtn"'), 'Apply base must belong to Base, not Project');
  assert.ok(!projectPanel.includes('id="applyBaseBtn"'), 'Project should not claim Base controls');
  for (const id of ['newProjectBtn', 'saveProjectBtn', 'exportProjectBtn', 'xyUnitSelect']) {
    assert.ok(projectPanel.includes(`id="${id}"`), `Project control missing: ${id}`);
  }
  for (const id of [
    'baseWidth',
    'baseHeight',
    'baseThickness',
    'maskSourceToggleBtn',
    'operationType',
    'operationArea',
    'growthMode',
    'etchTargetLayer',
    'operationThickness',
    'applyOperationBtn',
    'xyUnitSelect',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `documented beginner control missing in UI: ${id}`);
  }
});

test('all code blocks labeled JavaScript in the Recipe tutorials parse as v1 recipes', async () => {
  for (const page of ['Recipe-Code-Tutorial', 'Recipe-Code-Tutorial-zh-CN']) {
    const source = await manual(page);
    const snippets = [...source.matchAll(/^(?:~~~|```)javascript\n([\s\S]*?)\n(?:~~~|```)/gm)];
    assert.ok(snippets.length >= 4, `${page}: expected copy-ready recipe snippets`);
    for (const [index, snippet] of snippets.entries()) {
      const recipe = parseProcessRecipeSource(snippet[1]);
      assert.ok(recipe.steps.length > 0, `${page}: snippet ${index + 1} is empty`);
    }
  }
});
