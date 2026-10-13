import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditSiteSymbols } from '../../scripts/audit-site-symbols.mjs';

const reviewed = [
  { file: 'site/process-boundary-index.js', symbol: 'prepareModelBoundaryIndexes' },
  { file: 'site/renderer-line-reduction.js', symbol: 'simplifyDisplayPolyline' },
  { file: 'site/report-history-captures.js', symbol: 'MAX_HISTORY_SVG_TOTAL_BYTES' },
  { file: 'site/ui-v2/main-runtime.js', symbol: 'formatMainPosition' },
  { file: 'site/workspace-persistence.js', symbol: 'clearWorkspaceState' },
  { file: 'site/workspace-snapshots.js', symbol: 'MAX_SNAPSHOT_BRANCHES' },
  { file: 'site/workspace-snapshots.js', symbol: 'MAX_PROCESS_HISTORY_NODES' },
  { file: 'site/workspace-snapshots.js', symbol: 'MAIN_SNAPSHOT_BRANCH_ID' },
];

test('known externally reviewable exports remain guarded, without removing public API', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const report = await auditSiteSymbols(root);
  assert.deepEqual(report.parseErrors, []);
  const candidates = new Set(
    report.namedExportCandidates.map(({ file, symbol }) => file + ':' + symbol),
  );
  for (const { file, symbol } of reviewed) {
    assert.ok(candidates.has(file + ':' + symbol), file + ':' + symbol);
  }
});

test('export candidates with active in-module consumers are not dead functions', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const locallyUsed = reviewed.filter(({ symbol }) =>
    [
      'simplifyDisplayPolyline',
      'MAX_HISTORY_SVG_TOTAL_BYTES',
      'MAX_SNAPSHOT_BRANCHES',
      'MAX_PROCESS_HISTORY_NODES',
      'MAIN_SNAPSHOT_BRANCH_ID',
    ].includes(symbol),
  );
  for (const { file, symbol } of locallyUsed) {
    const source = await readFile(new URL('../../' + file, import.meta.url), 'utf8');
    const occurrences = source.match(new RegExp('\\b' + symbol + '\\b', 'g')) || [];
    assert.ok(occurrences.length >= 2, file + ':' + symbol + ' is used internally');
  }
});
