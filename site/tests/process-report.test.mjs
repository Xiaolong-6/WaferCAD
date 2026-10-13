import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProcessReportData, buildProcessReportArchive } from '../process-report.js';
import { buildReportZip } from '../report-zip.js';

async function entries(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const map = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const filename = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    map.set(filename, bytes.slice(start, start + size));
    offset = start + size;
  }
  const content = (name) => decoder.decode(map.get(name));
  return { map, content };
}

function sample(count = 1) {
  const steps = Array.from({ length: count }, (_, index) => ({
    id: `step-${index + 1}`,
    branchId: index > 499 ? 'branch-a' : 'main',
    parentId: index ? `step-${index}` : null,
    createdAt: '2026-10-13T00:00:00.000Z',
    processRevision: index + 1,
    displayLabel: index === 2 ? '<script>alert(1)</script> | Step' : `Deposit ${index + 1}`,
    areaLabel: 'Selected mask',
    restorable: true,
    replayable: index % 2 === 0,
    entityRefs: { resultLayerId: `layer-${index}` },
    operation: {
      kind: 'add',
      thickness: 0.00035,
      face: 'both',
      replay: {
        version: 1,
        params: { thickness: 0.00035, mask: { cell: 'CELL1' } },
      },
    },
  }));
  const project = {
    name: 'Fabrication project',
    model: {
      shape: 'rect',
      width: 100,
      height: 200,
      thickness: 10,
      processRevision: count,
      layers: [{ id: 'layer-1', name: 'SiO2', color: '#abcdef', processFace: 'front' }],
    },
    maskSourceMode: 'file',
    activeCell: 'CELL1',
    selectedLayerKeys: ['1|0'],
    processRecipe: {
      name: 'Test recipe',
      steps: [{ id: 'recipe-1', command: 'deposit', params: { thicknessUm: 0.00035 } }],
    },
  };
  return buildProcessReportData({
    project,
    history: steps,
    branches: [
      { id: 'main', name: 'Main', processStepCount: 500, headNodeId: 'step-500' },
      {
        id: 'branch-a',
        name: 'Branch A',
        processStepCount: count - 500,
        headNodeId: `step-${count}`,
      },
    ],
    bookmarks: [{ id: 'book-1', name: 'Before release', historyNodeId: 'step-50' }],
    position: { branchId: 'main', nodeId: 'step-500', atHead: true },
    date: '2026-10-13T00:00:00.000Z',
  });
}

test('1000-step report preserves every descriptor and paginates offline HTML', async () => {
  const data = sample(1000);
  const bundle = buildProcessReportArchive(data);
  const archive = await entries(bundle.blob);
  assert.equal(bundle.stepCount, 1000);
  assert.equal(bundle.imageCount, 0);
  assert.equal(bundle.fileCount, 45);
  assert.equal(archive.map.size, 45);
  assert.ok(archive.map.has('history/steps-0001.html'));
  assert.ok(archive.map.has('history/steps-0951.html'));
  assert.match(archive.content('history/steps-0001.html'), /href="steps-0051.html"/);
  assert.match(archive.content('history/steps-0051.html'), /href="steps-0001.html"/);
  assert.match(archive.content('history/steps-0051.html'), /href="steps-0101.html"/);
  assert.match(archive.content('history/steps-0951.html'), /href="steps-0901.html"/);
  assert.ok(!archive.map.has('assets/current-three.png'));
  const all = Array.from({ length: 20 }, (_, index) => {
    const name = `history/steps-${String(index * 50 + 1).padStart(4, '0')}.json`;
    return JSON.parse(archive.content(name));
  }).flat();
  assert.equal(all.length, 1000);
  assert.deepEqual(
    all.map((step) => step.number),
    Array.from({ length: 1000 }, (_, i) => i + 1),
  );
  assert.equal(all[999].parentId, 'step-999');
  assert.equal(all[0].operation.replay.params.thickness, 0.00035);
  assert.equal(all[2].label, '<script>alert(1)</script> | Step');
  assert.ok(!archive.content('history/steps-0001.html').includes('<script>alert(1)</script>'));
  assert.ok(archive.content('history/steps-0001.html').includes('&lt;script&gt;'));
  const manifest = JSON.parse(archive.content('manifest.json'));
  assert.equal(manifest.historyStepCount, 1000);
  assert.equal(manifest.branches.length, 2);
  assert.equal(manifest.bookmarks.length, 1);
  assert.equal(JSON.parse(archive.content('recipe.json')).steps[0].params.thicknessUm, 0.00035);
  assert.ok(archive.content('report.md').includes('Deposit 1000'));
});

test('reports include only supplied captured canvases and expose warnings', async () => {
  const data = sample(3);
  const bundle = buildProcessReportArchive(data, {
    captures: [{ view: 'main', bytes: Uint8Array.of(137, 80, 78, 71) }],
    warnings: ['3D view was not rendered.'],
  });
  const archive = await entries(bundle.blob);
  assert.equal(bundle.imageCount, 1);
  assert.ok(archive.map.has('assets/current-main.png'));
  assert.ok(!archive.map.has('assets/current-mask.png'));
  assert.match(archive.content('index.html'), /3D view was not rendered/);
  assert.match(archive.content('report.md'), /assets\/current-main.png/);
  assert.match(archive.content('index.html'), /captured visible canvas/);
});

test('Markdown labels cannot inject another report link', async () => {
  const data = sample(1);
  data.steps[0].label = '[untrusted](https://example.invalid)';
  const bundle = buildProcessReportArchive(data);
  const archive = await entries(bundle.blob);
  assert.ok(archive.content('report.md').includes(String.raw`\[untrusted\]`));
  assert.match(archive.content('history/steps-0001.html'), /\[untrusted\]/);
});

test('portable ZIP writes the expected CRC and rejects unsafe resource paths', async () => {
  const blob = buildReportZip([{ path: 'sample.txt', content: 'abc' }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x352441c2);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.throws(() => buildReportZip([{ path: '../secret', content: 'x' }]));
  assert.throws(() =>
    buildReportZip([
      { path: 'a.txt', content: '1' },
      { path: 'a.txt', content: '2' },
    ]),
  );
});
