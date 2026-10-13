import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildRendererR9FocusedDrawPlan } from '../../scripts/test-helpers/renderer-unified-hardware-plan.mjs';
import { rendererFreshContextEvidencePath } from '../../scripts/test-helpers/renderer-hardware-output-path.mjs';
import { checkRendererHardwareEvidenceInventory } from '../../scripts/test-helpers/renderer-hardware-inventory.mjs';
import { preserveRendererHardwareEvidence } from '../../scripts/test-helpers/renderer-hardware-evidence.mjs';
import { writeRendererHardwareZip } from '../../scripts/test-helpers/renderer-hardware-zip.mjs';

const labels = ['1-OFF', '2-OFF', '3-ON', '4-ON'];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);

function unzipWriterEntries(zip) {
  const entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const compression = zip.readUInt16LE(offset + 8);
    assert.equal(compression, 8);
    const compressed = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, inflateRawSync(zip.subarray(start, start + compressed)));
    offset = start + compressed;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  return entries;
}

test('R9-focus writer and collector resolve to exactly the same directory', async () => {
  const [focus] = buildRendererR9FocusedDrawPlan();
  const phase = { low: 128, high: 384 };
  assert.equal(
    focus.artifact,
    'test-results/renderer-hardware-fresh-context-ab-phase-window-128-384-focused-129-154',
  );
  assert.equal(
    rendererFreshContextEvidencePath({ phaseWindow: phase, focusWindowDiagnostic: true }),
    focus.artifact,
  );
  assert.equal(
    rendererFreshContextEvidencePath({ phaseWindow: phase }),
    focus.artifact.replace('-focused-129-154', ''),
  );
  const source = await readFile(
    new URL('../../scripts/renderer-electrical-fresh-context-ab.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /rendererFreshContextEvidencePath\(\{/);
  assert.match(source, /focusWindowDiagnostic,/);
  assert.throws(
    () => rendererFreshContextEvidencePath({ focusWindowDiagnostic: true }),
    /requires the 128:384 phase window/,
  );
});

test('GPU-free R9-focus smoke copies all nine artifacts into the ZIP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'renderer-focus-artifacts-'));
  try {
    const [step] = buildRendererR9FocusedDrawPlan();
    const worktree = join(directory, 'worktree');
    const source = join(worktree, step.artifact);
    const evidence = join(directory, 'evidence');
    const target = join(evidence, step.id);
    const report = { stage: 'completed', trials: labels.map((label) => ({ label })) };
    await mkdir(source, { recursive: true });
    await mkdir(evidence);
    await writeFile(join(source, 'report.json'), JSON.stringify(report));
    for (const label of labels) {
      await writeFile(join(source, label + '.png'), png);
      await writeFile(join(source, label + '-trace.json'), JSON.stringify({ label }));
    }
    await writeFile(join(evidence, 'v4-focused-draws.log'), 'offline synthetic log');
    const copied = await preserveRendererHardwareEvidence(source, target);
    assert.equal(copied.artifactsCopied, true);
    assert.deepEqual(copied.report, report);
    assert.deepEqual(copied.warnings, []);
    assert.deepEqual(await checkRendererHardwareEvidenceInventory(step.id, target, copied.report), {
      valid: true,
      missing: [],
    });
    const summary = {
      campaign: 'r9-focus',
      completed: [{ id: step.id, evidenceFolder: step.id, reportFile: step.id + '/report.json' }],
      diagnosticComplete: true,
    };
    await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary));
    const zip = join(directory, 'evidence.zip');
    const archived = await writeRendererHardwareZip(evidence, zip);
    assert.equal(archived.files, 11);
    const entries = unzipWriterEntries(await readFile(zip));
    const prefix = basename(evidence) + '/';
    assert.equal(entries.size, 11);
    assert.deepEqual(JSON.parse(entries.get(prefix + 'summary.json').toString()), summary);
    assert.deepEqual(JSON.parse(entries.get(prefix + step.id + '/report.json').toString()), report);
    for (const label of labels) {
      assert.deepEqual(entries.get(prefix + step.id + '/' + label + '.png'), png);
      assert.deepEqual(
        JSON.parse(entries.get(prefix + step.id + '/' + label + '-trace.json').toString()),
        { label },
      );
    }
    await unlink(join(target, '2-OFF-trace.json'));
    const incomplete = await checkRendererHardwareEvidenceInventory(step.id, target, copied.report);
    assert.equal(incomplete.valid, false);
    assert.ok(incomplete.missing.includes('2-OFF-trace.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing focused evidence cannot be declared complete by a valid-looking report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'renderer-focus-missing-'));
  try {
    const [step] = buildRendererR9FocusedDrawPlan();
    const source = join(directory, 'wrong-unfocused-directory');
    await mkdir(source);
    await writeFile(
      join(source, 'report.json'),
      JSON.stringify({ trials: labels.map((label) => ({ label })) }),
    );
    const actual = await preserveRendererHardwareEvidence(
      join(directory, step.artifact),
      join(directory, step.id),
    );
    const inventory = await checkRendererHardwareEvidenceInventory(
      step.id,
      join(directory, step.id),
      actual.report,
    );
    assert.equal(actual.artifactsCopied, false);
    assert.equal(inventory.valid, false);
    assert.ok(inventory.missing.includes('report.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
