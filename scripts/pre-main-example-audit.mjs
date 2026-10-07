import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadGeometryKernel } from './process-benchmarks.mjs';
await loadGeometryKernel();
const { expandProjectStorage } = await import('../site/project-io.js');
const { migrateProjectFile, validateProjectFile } = await import('../site/project-schema.js');
const baseline = process.argv[2] || 'origin/main';
const git = (...args) =>
  execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
const paths = git('diff', '--name-only', `${baseline}...HEAD`)
  .trim()
  .split(/\r?\n/)
  .filter((p) => p.endsWith('.wafercad') && !p.includes('/previews/'));
const canonical = (text) =>
  JSON.parse(JSON.stringify(migrateProjectFile(expandProjectStorage(JSON.parse(text)))));
const physical = (p) => ({
  model: p.model,
  layout: p.layout,
  snapshots: (p.snapshots || []).map((s) => ({
    id: s.id,
    model: s.state.model,
    layout: s.state.layout,
  })),
  nodes: (p.snapshotBranches?.nodes || []).map((n) => ({
    id: n.id,
    parentId: n.parentId,
    branchId: n.branchId,
    model: n.state?.model,
    layout: n.state?.layout,
  })),
  branches: (p.snapshotBranches?.branches || []).map((b) => ({
    id: b.id,
    rootNodeId: b.rootNodeId,
    headNodeId: b.headNodeId,
    model: b.headState?.model,
    layout: b.headState?.layout,
  })),
});
for (const path of paths) {
  const current = canonical(readFileSync(path, 'utf8'));
  validateProjectFile(current);
  if (path.endsWith('/three-tier-silicon-jlfets.wafercad')) {
    console.log(
      'NEW_NATIVE',
      path,
      current.snapshotBranches.nodes.length,
      current.snapshots.length,
    );
    continue;
  }
  const original = canonical(git('show', `${baseline}:${path}`));
  assert.deepEqual(
    physical(current),
    physical(original),
    path + ': full physical data and every History state must match main',
  );
  console.log(
    'PHYSICAL_HISTORY_IDENTICAL',
    path,
    current.snapshotBranches?.nodes?.length,
    current.snapshots?.length,
  );
}
