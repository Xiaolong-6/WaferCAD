import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { BUNDLED_EXAMPLES } from '../bundled-examples.js';

const provenance = JSON.parse(
  await readFile(
    new URL('../../docs/evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json', import.meta.url),
    'utf8',
  ),
);
const classifications = new Set([
  'reported',
  'derived',
  'assumed',
  'display-only',
  'unsupported',
  'unreported',
]);
const acceptanceStatuses = new Set(['open-paper-match', 'accepted-paper-match', 'blocked-source']);

test('eight paper provenance records match the actual published example catalog', async () => {
  assert.equal(provenance.schema, 'wafercad-literature-figure-provenance-v1');
  assert.equal(provenance.issue, 241);
  const ids = provenance.entries.map((entry) => entry.id);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate provenance entry');
  assert.deepEqual(ids, BUNDLED_EXAMPLES.map((entry) => entry.id));
  for (const entry of provenance.entries) {
    const published = BUNDLED_EXAMPLES.find((example) => example.id === entry.id);
    assert.equal(entry.projectPath, published.path);
    assert.ok(
      published.sources.some((source) => source.href === entry.sourceURL),
      entry.id + ': source URL missing from published bibliography',
    );
    assert.ok(entry.paperPanel.length > 8);
    assert.ok(classifications.has(entry.classification));
    assert.ok(acceptanceStatuses.has(entry.acceptance.status));
    if (entry.browserEvidenceURL) {
      assert.match(entry.browserEvidenceURL, /^https:\/\/github\.com\//);
    } else {
      assert.match(entry.evidenceType, /figure cut still missing/);
      assert.notEqual(entry.acceptance.status, 'accepted-paper-match');
    }
    for (const supplementary of entry.secondarySources || []) {
      assert.ok(
        published.sources.some((source) => source.href === supplementary.url),
        entry.id + ': thesis/supplement source missing from published bibliography',
      );
    }
    await access(new URL('../' + entry.projectPath.replace(/^\.\//, ''), import.meta.url));
  }
});

test('no scientific paper-figure claim is accepted without real calibrated overlay', () => {
  for (const entry of provenance.entries) {
    const accepted = entry.acceptance.status === 'accepted-paper-match';
    if (accepted) {
      assert.equal(entry.acceptance.calibratedScale, true);
      assert.equal(entry.acceptance.quantitativeOverlay, true);
      assert.equal(
        entry.classification === 'display-only' || entry.classification === 'assumed',
        false,
        'Assumed geometry or render-only facets cannot certify a publication figure',
      );
    }
  }
});
