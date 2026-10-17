import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSEMBLY_EDITOR_STARTUP_URL,
  STANDARD_WORKSTATION_STARTUP_URL,
  projectStartupTarget,
  welcomeProjectStartupTarget,
  openStagedAssemblyProject,
  handoffAssemblyProjectFile,
} from '../assembly-startup-routing.js';

test('Welcome routes complete Workspace and bonded v15 to the source-aware editor', async () => {
  for (const project of [
    { format: 'WaferCAD-assembly-workspace', version: 1, variantGraph: {} },
    { version: 15, waferAssembly: { sources: [], bonds: [] } },
    { version: 15, waferAssembly: { forged: true } },
  ]) {
    assert.equal(projectStartupTarget(project), ASSEMBLY_EDITOR_STARTUP_URL);
    assert.equal(
      await welcomeProjectStartupTarget({
        name: 'open.wafercad',
        text: async () => JSON.stringify(project),
      }),
      ASSEMBLY_EDITOR_STARTUP_URL,
    );
  }
});

test('ordinary projects, layouts, invalid JSON and null Assembly stay with ordinary importer', async () => {
  for (const document of [
    { version: 14, model: {} },
    { version: 15, waferAssembly: null },
    { snapshots: [] },
    [],
    null,
  ]) {
    assert.equal(projectStartupTarget(document), STANDARD_WORKSTATION_STARTUP_URL);
  }
  assert.equal(
    await welcomeProjectStartupTarget({
      name: 'corrupt.wafercad',
      text: async () => '{bad-json',
    }),
    STANDARD_WORKSTATION_STARTUP_URL,
  );
  assert.equal(
    await welcomeProjectStartupTarget({
      name: 'layout.gds',
      text: async () => JSON.stringify({ format: 'WaferCAD-assembly-workspace' }),
    }),
    STANDARD_WORKSTATION_STARTUP_URL,
  );
});

test('staged Assembly loader preserves file ownership until validation and editor boot', async () => {
  const file = { name: 'source-aware.wafercad', size: 4 };
  let consumed = false;
  const readStaged = async () => ({ kind: 'project', file });
  const readAssembly = async (received, ordinaryReader, options) => {
    assert.equal(received, file);
    assert.equal(ordinaryReader, undefined);
    assert.deepEqual(options, { allowStandalone: true });
    return { data: { model: { layers: [] } }, variantGraph: { branches: [] } };
  };
  const opened = await openStagedAssemblyProject(readStaged, readAssembly);
  assert.ok(opened.variantGraph);
  assert.equal(consumed, false);
  await assert.rejects(
    () =>
      openStagedAssemblyProject(readStaged, async () => {
        throw new Error('Corrupted Recipe checksum');
      }),
    /Corrupted Recipe checksum/,
  );
  assert.equal(consumed, false, 'failed import cannot remove staged input');
  await assert.rejects(
    () => openStagedAssemblyProject(async () => ({ kind: 'layout', file }), readAssembly),
    /staged Assembly file is unavailable/,
  );
});

test('in-workstation handoff validates, checkpoints, stages and only then navigates', async () => {
  const file = { name: 'bonded.wafercad' };
  const order = [];
  const hooks = {
    validate: async (candidate) => {
      assert.equal(candidate, file);
      order.push('validate');
    },
    checkpoint: async () => {
      order.push('checkpoint');
    },
    stage: async (candidate, kind) => {
      assert.equal(candidate, file);
      assert.equal(kind, 'project');
      order.push('stage');
    },
    navigate: (url) => {
      assert.equal(url, ASSEMBLY_EDITOR_STARTUP_URL);
      order.push('navigate');
    },
  };
  assert.equal(await handoffAssemblyProjectFile(file, hooks), true);
  assert.deepEqual(order, ['validate', 'checkpoint', 'stage', 'navigate']);
});

test('invalid provenance or failed Recovery never replaces an ordinary workspace', async () => {
  for (const failure of ['validate', 'checkpoint', 'stage']) {
    const trace = [];
    const hooks = Object.fromEntries(
      ['validate', 'checkpoint', 'stage'].map((key) => [
        key,
        async () => {
          trace.push(key);
          if (key === failure) throw new Error(`blocked-${key}`);
        },
      ]),
    );
    hooks.navigate = () => trace.push('navigate');
    await assert.rejects(
      () => handoffAssemblyProjectFile({ name: 'unsafe.wafercad' }, hooks),
      new RegExp(`blocked-${failure}`),
    );
    assert.equal(trace.includes('navigate'), false);
    assert.equal(trace.includes('stage'), failure === 'stage');
  }
});
