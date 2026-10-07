import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import {
  baseUrl,
  gotoWelcome,
  launchBrowser,
  newUiPage,
  observePageErrors,
} from './test-helpers/ui.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../site/project-io.js');
const text = await readFile(
  new URL('../site/examples/three-tier-silicon-jlfets.wafercad', import.meta.url),
  'utf8',
);
const source = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
const stable = (_key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]]),
      )
    : value;
const expected = createHash('sha256').update(JSON.stringify(source, stable)).digest('hex');
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser);
  const errors = observePageErrors(page);
  await gotoWelcome(page);
  const result = await page.evaluate(async (text) => {
    const io = await import('./project-io.js'),
      api = await import('./workspace-persistence.js');
    const project = await io.readProjectFile(new globalThis.File([text], 'native.wafercad'));
    const pristine = structuredClone(project);
    const stable = (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value;
    const digest = async (project) =>
      Array.from(
        new Uint8Array(
          await globalThis.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(JSON.stringify(project, stable)),
          ),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    let frames = 0,
      running = true;
    const tick = () => {
      if (running) {
        frames++;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    const pending = api.prepareWorkspaceStorage(project);
    project.model.width = -1;
    const packed = await pending;
    running = false;
    io.expandProjectStorage(packed);
    const packedDigest = await digest(packed);

    const saving = api.saveWorkspaceState(pristine);
    pristine.name = 'Edited after worker handoff';
    const saved = await saving;
    const current = await api.loadWorkspaceState();
    const savedDigest = await digest(current);
    const bad = structuredClone(current);
    bad.model.width = -1;
    let rejection;
    try {
      await api.saveWorkspaceState(bad);
    } catch (error) {
      rejection = error.message;
    }
    const afterRejection = await digest(await api.loadWorkspaceState());

    let ownsLease = true;
    const leaseCandidate = structuredClone(current);
    leaseCandidate.name = 'Must not commit after lease loss';
    const losingSave = api.saveWorkspaceState(leaseCandidate, {}, { canCommit: () => ownsLease });
    ownsLease = false;
    const lostLeaseCommitted = await losingSave;
    const afterLeaseLoss = await digest(await api.loadWorkspaceState());
    const retry = await api.saveWorkspaceState(current);
    const key = await api.createWorkspaceRecoveryCheckpoint(current, {
      reason: 'worker-roundtrip',
    });
    const recovery = await api.loadWorkspaceRecoveryPoint(key);
    return {
      frames,
      packedDigest,
      saved,
      savedDigest,
      rejection,
      afterRejection,
      lostLeaseCommitted,
      afterLeaseLoss,
      retry,
      recoveryDigest: await digest(recovery),
      steps: recovery.snapshotBranches.nodes.length,
      bookmarks: recovery.snapshots.length,
    };
  }, text);
  assert.ok(result.frames > 10, 'Strict packing must leave rendering frames responsive.');
  for (const key of [
    'packedDigest',
    'savedDigest',
    'afterRejection',
    'afterLeaseLoss',
    'recoveryDigest',
  ]) {
    assert.equal(
      result[key],
      expected,
      `${key}: complete geometry, History and display must be exact.`,
    );
  }
  assert.equal(result.saved, true);
  assert.match(result.rejection, /Invalid project/);
  assert.equal(result.lostLeaseCommitted, false);
  assert.equal(result.retry, true);
  assert.equal(result.steps, 40);
  assert.equal(result.bookmarks, 5);
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/native-fig3/workspace-storage-worker.json',
    JSON.stringify({ baseUrl, browser: browser.version(), expected, ...result, errors }, null, 2),
  );
  console.log('WaferCAD workspace storage worker regression: OK', JSON.stringify(result));
  await context.close();
} finally {
  await browser.close();
}
