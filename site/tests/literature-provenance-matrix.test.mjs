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
  // Three new family-specific Chromium cuts are real saved artifacts,
  // but remain deliberately unaccepted as paper-SEM quantitative overlays.
  const newFamilies = [
    'm3d-selfpowered-heterogeneous-ic',
    'magic-1000-mos2-beol',
    'tio2-metalens-four-unit',
  ];
  for (const id of newFamilies) {
    const entry = provenance.entries.find((item) => item.id === id);
    assert.equal(entry.captureEvidence.capturedMembers.length, 2);
    assert.equal(entry.acceptance.status, 'open-paper-match');
    assert.equal(entry.captureEvidence.originalPaperOverlay, false);
  }
  const ids = provenance.entries.map((entry) => entry.id);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate provenance entry');
  assert.deepEqual(
    ids,
    BUNDLED_EXAMPLES.map((entry) => entry.id),
  );
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
      assert.equal(entry.captureEvidence.kind, 'actual-chromium-project-capture');
      assert.equal(entry.captureEvidence.runURL, entry.browserEvidenceURL);
      assert.match(entry.captureEvidence.artifactURL, /\/artifacts\/\d+$/);
      assert.equal(entry.captureEvidence.manifestMember, 'figure-cut-manifest.json');
      assert.ok(entry.captureEvidence.capturedMembers.length > 0);
      assert.equal(entry.captureEvidence.originalPaperOverlay, false);
      for (const member of entry.captureEvidence.capturedMembers) {
        assert.match(member, /\.png$/);
      }
    } else {
      assert.equal(entry.captureEvidence, null);
      assert.match(entry.evidenceType, /figure cut still missing/);
      assert.notEqual(entry.acceptance.status, 'accepted-paper-match');
    }
    if (entry.captureEvidence?.probePlacementAudit) {
      const audit = entry.captureEvidence.probePlacementAudit;
      assert.equal(
        audit.physicalProbes,
        audit.onSectionProbes + audit.offSectionControlProbes.length,
      );
      for (const control of audit.offSectionControlProbes) {
        const [ax, ay] = control.a;
        const [bx, by] = control.b;
        const [px, py] = control.xy;
        const dx = bx - ax;
        const dy = by - ay;
        const distance = Math.abs(dx * (py - ay) - dy * (px - ax)) / Math.hypot(dx, dy);
        assert.ok(distance > 1e-6, control.probeId + ': falsely tagged off-section');
        assert.ok(Math.abs(distance - control.offSectionDistanceUm) < 1e-9);
        assert.equal(entry.captureEvidence.originalPaperOverlay, false);
      }
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
