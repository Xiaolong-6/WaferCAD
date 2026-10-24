import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { BUNDLED_EXAMPLES } from '../../bundled-examples.js';
import { PROCESS_GUIDE } from '../../process-guide.js';
import { parseProcessRecipeSource } from '../../process-recipe.js';

const manual = (page) =>
  readFile(new URL(`../../../docs/wiki/${page}.md`, import.meta.url), 'utf8');

test('Wiki examples cover exactly the published Welcome project families and their sources', async () => {
  const page = await manual('Examples-and-Modeling-Limits');
  const tableRows = page.split('\n').filter((line) => /^\| \[\*\*/.test(line));
  assert.equal(
    tableRows.length,
    BUNDLED_EXAMPLES.length,
    'add/update the Wiki catalog when Welcome families change',
  );
  const rows = page.split('\n');
  const catalog = rows.findIndex((line) => line.includes(`[**${BUNDLED_EXAMPLES[0].title}**]`));
  assert.ok(catalog >= 0, 'Welcome example table must contain actual project links');
  assert.ok(
    rows.slice(catalog, catalog + BUNDLED_EXAMPLES.length).every((line) => line.startsWith('| [')),
    'Welcome example entries must form one contiguous Markdown table',
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
        row.includes(source.doi || source.href),
        `${example.id}: Welcome source ${source.doi || source.href} missing from Wiki entry`,
      );
    }
  }
});

test('every shipped example section embeds a real corresponding preview asset', async () => {
  const page = await manual('Examples-and-Modeling-Limits');
  for (const example of BUNDLED_EXAMPLES) {
    const image = example.preview?.path?.replace(/^\.\//, '');
    assert.ok(image?.startsWith('examples/thumbnails/'), example.id + ': invalid preview path');
    assert.ok(page.includes('/site/' + image), example.id + ': missing preview');
    await access(new URL('../../' + image, import.meta.url));
    if (image.endsWith('.svg')) {
      const asset = await readFile(new URL('../../' + image, import.meta.url), 'utf8');
      assert.match(asset, /<svg[\s>]/);
      assert.match(asset, /SCHEMATIC ONLY|Illustrative/i);
    }
  }
});

test('Wiki navigation links to English Recipe and AI workflow tutorials', async () => {
  for (const page of ['Home', '_Sidebar', 'Process-and-Recipes', 'Getting-Started']) {
    const text = await manual(page);
    assert.ok(text.includes('(Recipe-Code-Tutorial)'), `${page}: missing English tutorial link`);
    assert.ok(text.includes('(AI-Assisted-Workflows)'), `${page}: missing AI workflow link`);
  }
});

test('the novice path is discoverable and names the current UI controls', async () => {
  const guide = await manual('First-10-Minutes');
  for (const entry of ['Home', '_Sidebar', 'Getting-Started', 'Troubleshooting']) {
    assert.ok(
      (await manual(entry)).includes('(First-10-Minutes)'),
      `${entry}: beginner path missing`,
    );
  }
  for (const step of [
    'Rebuild Base',
    'Whole face',
    'Selected mask',
    'Draw',
    'Direct',
    'SiO2',
    'Section A–B',
    'Also add to Recipe → No',
    'Undo',
    'Recovery',
    '.wafercad',
  ]) {
    assert.ok(guide.includes(step), `novice workflow missing ${step}`);
  }
  const welcome = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(welcome, /id="welcomeEmptyBtn"[^>]*href="\.\/app\.html\?start=empty"/);
  assert.match(guide, /click \*\*Start empty\*\*/);
  assert.match(guide, /Open \*\*Project\*\*[\s\S]*XYZ display unit/);
  assert.match(guide, /\*\*Base\*\* editor within Project/);
  assert.match(guide, /\*\*Base\*\* is the default layer name/);
  assert.match(guide, /Also add to Recipe → No/);

  const v2Project = await readFile(
    new URL('../../ui-v2/project-mask-panels.js', import.meta.url),
    'utf8',
  );
  assert.match(v2Project, /'XYZ display unit'/);
  assert.match(v2Project, /button\('Rebuild Base'/);
  assert.match(v2Project, /host\('panel.base'\)/);
  const v2Workflow = await readFile(
    new URL('../../ui-v2/workstation-workflow.js', import.meta.url),
    'utf8',
  );
  assert.match(v2Workflow, /\['step', 'Manual', 'manual'\]/);
  assert.match(v2Workflow, /'Also add to Recipe'[\s\S]*?'false'/);
  assert.match(v2Workflow, /fields.input\('Thickness \/ depth/);
  const v2Mask = await readFile(new URL('../../ui-v2/mask-view.js', import.meta.url), 'utf8');
  assert.match(v2Mask, /'mask-source'/);
  assert.match(v2Mask, /'draw-toggle'/);
});

test('Mask ROI documentation agrees with Whole face worker clipping', async () => {
  const masks = await manual('Masks-and-ROI');
  const gettingStarted = await manual('Getting-Started');
  const worker = await readFile(new URL('../../process-worker.js', import.meta.url), 'utf8');
  assert.match(masks, /even \*\*Whole face\*\*/);
  assert.match(gettingStarted, /including Whole face/);
  assert.match(worker, /return limiter \? vectorApi\.intersection\(area, limiter\) : area/);
  assert.match(
    worker,
    /deferredArrayMaskArea\([\s\S]*?boundary: model\.boundary,[\s\S]*?limiter,[\s\S]*?processGridUm:[\s\S]*?\},[\s\S]*?vectorApi/,
  );
  const selection = await readFile(new URL('../../selection-geometry.js', import.meta.url), 'utf8');
  assert.match(
    selection,
    /deferredArrayMaskArea\([\s\S]*?limiter,[\s\S]*?\{ intersection, isEmpty \}/,
  );
});

test('all JavaScript Recipe examples in the English Wiki parse as v1 recipes', async () => {
  for (const page of ['Recipe-Code-Tutorial', 'AI-Assisted-Workflows']) {
    const source = await manual(page);
    const snippets = [...source.matchAll(/^(?:~~~|```)javascript\n([\s\S]*?)\n(?:~~~|```)/gm)];
    assert.ok(
      snippets.length >= (page === 'Recipe-Code-Tutorial' ? 4 : 2),
      `${page}: expected copy-ready recipe snippets`,
    );
    for (const [index, snippet] of snippets.entries()) {
      const recipe = parseProcessRecipeSource(snippet[1]);
      assert.ok(recipe.steps.length > 0, `${page}: snippet ${index + 1} is empty`);
    }
  }
});

test('Wiki uses legible first-party visual evidence or task-specific diagrams, and the generated Process catalog', async () => {
  const home = await manual('Home');
  assert.ok(
    home.includes(`all ${PROCESS_GUIDE.length} before/after operation diagrams`),
    'Home must report the actual Process guide variant count',
  );
  const pages = [
    'Home',
    'First-10-Minutes',
    'Getting-Started',
    'Workspace-and-Views',
    'Masks-and-ROI',
    'Process-and-Recipes',
    'Recipe-Code-Tutorial',
    'AI-Assisted-Workflows',
    'Examples-and-Modeling-Limits',
    'History-Variants-and-Recovery',
    'Troubleshooting',
    'Process-Operations',
  ];
  const screenshotPrefix = 'docs/wiki/assets/screenshots/2026-10-24/';
  // Load screenshot provenance only when an actual checked-in screenshot is embedded.
  // Older Wiki pages remain valid without introducing unused screenshot assets.
  let screenshotManifest;
  let approvedScreenshots;
  const screenshotPages = {
    Home: ['desktop-overview.png'],
    'Getting-Started': ['mobile-view-navigation.png', 'mobile-project-base.png'],
    'Workspace-and-Views': ['section-zbreak.png', 'mobile-border-inspector.png'],
    'History-Variants-and-Recovery': ['history-metalens-steps.png'],
    'Examples-and-Modeling-Limits': ['metalens-array-mask.png'],
  };
  for (const page of pages) {
    const source = await manual(page);
    const images = [...source.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    const diagrams = [...source.matchAll(/```mermaid\n([\s\S]*?)```/g)];
    assert.ok(
      images.length >= 1 || diagrams.length >= 1,
      `${page}: include a relevant diagram or a directly useful scientific image`,
    );
    assert.doesNotMatch(
      source,
      /site\/example-previews\//,
      `${page}: blurred legacy JPEG previews are not instructional screenshots`,
    );
    for (const match of images) {
      const [, alt, url] = match;
      assert.ok(alt.length >= 14, `${page}: image must have descriptive alt text`);
      const prefix = 'https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/';
      assert.ok(
        url.startsWith(prefix),
        `${page}: no stock or unverified external imagery (${url})`,
      );
      const asset = url.slice(prefix.length).split('?')[0];
      assert.ok(
        /^(?:docs\/wiki\/assets\/(?:process|screenshots\/2026-10-24)|site\/examples\/thumbnails|tests\/visual-baselines\/windows-chromium)\//.test(
          asset,
        ),
        `${page}: image path must be from an approved reviewed asset family (${asset})`,
      );
      await access(new URL('../../../' + asset, import.meta.url));
      if (asset.startsWith(screenshotPrefix)) {
        if (!screenshotManifest) {
          screenshotManifest = JSON.parse(
            await readFile(
              new URL('../../../' + screenshotPrefix + 'manifest.json', import.meta.url),
              'utf8',
            ),
          );
          assert.match(screenshotManifest.source_sha, /^[a-f0-9]{40}$/);
          assert.ok(Number.isInteger(screenshotManifest.source_workflow_run));
          approvedScreenshots = new Map(
            screenshotManifest.files.map((item) => [item.filename, item]),
          );
        }
        const filename = asset.slice(screenshotPrefix.length);
        const record = approvedScreenshots.get(filename);
        assert.ok(record, `${page}: capture requires versioned source manifest (${filename})`);
        assert.ok(
          (screenshotPages[page] || []).includes(filename),
          `${page}: captured UI is unrelated to this page (${filename})`,
        );
        assert.equal(record.source_sha, screenshotManifest.source_sha);
        assert.ok(record.artifact_id > 0 && record.artifact_path);
        assert.ok(record.pixel_width >= 320 && record.pixel_height >= 400);
        const bytes = await readFile(new URL('../../../' + asset, import.meta.url));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
        const afterImage = source.slice(
          match.index + match[0].length,
          match.index + match[0].length + 700,
        );
        assert.ok(
          afterImage.includes(screenshotManifest.source_sha.slice(0, 12)),
          `${page}: screenshot caption needs exact source revision`,
        );
      }
      if (asset.startsWith('site/examples/thumbnails/')) {
        const allowed =
          page === 'Examples-and-Modeling-Limits' ||
          (page === 'Workspace-and-Views' && asset.endsWith('magic-1000-mos2-beol-section.webp')) ||
          (page === 'AI-Assisted-Workflows' &&
            asset.endsWith('tio2-metalens-four-unit-schematic.svg'));
        assert.ok(
          allowed,
          `${page}: example cover is irrelevant to this instructional step (${asset})`,
        );
      }
      if (page !== 'Process-Operations') {
        const after = source.slice(match.index + match[0].length).trimStart();
        assert.match(
          after.slice(0, 400),
          /^_[^\n]+_\s*\n/,
          `${page}: explain image provenance, purpose and schematic/actual status immediately below it`,
        );
      }
    }
  }
});
