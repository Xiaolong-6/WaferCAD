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

// A label or screenshot alone cannot certify scientific correspondence with
// a published micrograph. A future positive acceptance must carry the
// source-panel identity, a real comparison artifact and quantitative geometry.
// These are *metadata integrity* gates; an independent reviewer must still
// inspect the actual original and overlay before changing the status.
function assertPaperMatchEvidence(entry) {
  if (entry.acceptance.status !== 'accepted-paper-match') return;
  assert.ok(
    entry.classification === 'reported' || entry.classification === 'derived',
    'Assumed, unreported and display-only geometry cannot certify a paper figure',
  );
  assert.equal(entry.acceptance.calibratedScale, true);
  assert.equal(entry.acceptance.quantitativeOverlay, true);
  assert.equal(entry.captureEvidence?.originalPaperOverlay, true);

  const evidence = entry.acceptance.paperMatchEvidence;
  assert.ok(evidence && typeof evidence === 'object' && !Array.isArray(evidence));
  assert.ok(
    typeof evidence.sourcePanel === 'string' &&
      evidence.sourcePanel.length >= 5 &&
      entry.paperPanel.includes(evidence.sourcePanel),
    'The paper overlay must identify a specific cited figure panel',
  );
  assert.match(evidence.sourcePanelURL || '', /^https:\/\/[^\s]+$/);
  assert.match(
    evidence.comparisonArtifactURL || '',
    /^https:\/\/github\.com\/Xiaolong-6\/WaferCAD\/actions\/runs\/\d+\/artifacts\/\d+$/,
  );
  assert.match(evidence.measurementReportMember || '', /^[\w./-]+\.json$/);
  const cut = evidence.modelCutUm;
  assert.ok(
    Array.isArray(cut?.a) &&
      Array.isArray(cut?.b) &&
      cut.a.length === 2 &&
      cut.b.length === 2 &&
      [...cut.a, ...cut.b].every(Number.isFinite) &&
      Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]) > 0,
    'Accepted overlay needs a finite nonzero physical A-B cut',
  );
  const m = evidence.measurement;
  assert.ok(
    m &&
      Number.isFinite(m.umPerPixel) &&
      m.umPerPixel > 0 &&
      Number.isInteger(m.matchedFeatures) &&
      m.matchedFeatures >= 3,
    'Accepted overlay needs a positive image scale and at least three matched features',
  );
  assert.ok(
    Number.isFinite(m.maxRegistrationErrorUm) &&
      m.maxRegistrationErrorUm > 0 &&
      Number.isFinite(m.registrationErrorUm) &&
      m.registrationErrorUm >= 0 &&
      m.registrationErrorUm <= m.maxRegistrationErrorUm,
    'Paper-model image registration exceeds its declared acceptance bound',
  );
  assert.ok(
    Number.isFinite(m.maxShapeMismatchUm) &&
      m.maxShapeMismatchUm > 0 &&
      Number.isFinite(m.shapeMismatchUm) &&
      m.shapeMismatchUm >= 0 &&
      m.shapeMismatchUm <= m.maxShapeMismatchUm,
    'Paper-model physical shape mismatch exceeds its declared acceptance bound',
  );
}

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
      assert.equal(typeof entry.captureEvidence.originalPaperOverlay, 'boolean');
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
      assert.equal(
        audit.onSectionProbes,
        audit.onSectionControls.length,
        'Every on-section material probe needs auditable XY and A-B endpoints',
      );
      const identifiers = new Set();
      for (const control of audit.onSectionControls) {
        const key = control.cutId + ':' + control.probeId;
        assert.equal(identifiers.has(key), false, 'Duplicate figure-cut probe ' + key);
        identifiers.add(key);
        const [ax, ay] = control.a;
        const [bx, by] = control.b;
        const [px, py] = control.xy;
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSquared = dx * dx + dy * dy;
        assert.ok(lengthSquared > 0, key + ': degenerate Section A-B');
        const projection = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
        const perpendicular = Math.abs(dx * (py - ay) - dy * (px - ax));
        assert.ok(
          perpendicular <= 1e-9 * Math.sqrt(lengthSquared),
          key + ': material probe does not lie on the pictured A-B Section',
        );
        assert.ok(
          projection >= -1e-9 && projection <= 1 + 1e-9,
          key + ': probe lies beyond the actual A-B segment',
        );
      }
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
    assertPaperMatchEvidence(entry);
  }
});

// Synthetically validated metadata is never counted as a real accepted figure:
// these mutations only prove that unsupported acceptance status fails closed.
test('paper-match status rejects uncalibrated and scientifically unsupported claims', () => {
  const unverified = structuredClone(provenance.entries[0]);
  unverified.acceptance.status = 'accepted-paper-match';
  unverified.acceptance.calibratedScale = true;
  unverified.acceptance.quantitativeOverlay = true;
  assert.throws(() => assertPaperMatchEvidence(unverified), /equal|paperMatchEvidence|object/);

  const validSchema = structuredClone(unverified);
  validSchema.captureEvidence.originalPaperOverlay = true;
  validSchema.acceptance.paperMatchEvidence = {
    sourcePanel: 'Fig. 1a',
    sourcePanelURL: validSchema.sourceURL,
    comparisonArtifactURL: validSchema.captureEvidence.artifactURL,
    measurementReportMember: 'paper-fig1a-measurement.json',
    modelCutUm: { a: [-1, 0], b: [1, 0] },
    measurement: {
      umPerPixel: 0.01,
      matchedFeatures: 3,
      registrationErrorUm: 0.01,
      maxRegistrationErrorUm: 0.02,
      shapeMismatchUm: 0.03,
      maxShapeMismatchUm: 0.05,
    },
  };
  assert.doesNotThrow(() => assertPaperMatchEvidence(validSchema));

  for (const change of [
    (entry) => {
      entry.classification = 'assumed';
    },
    (entry) => {
      entry.captureEvidence.originalPaperOverlay = false;
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.sourcePanel = 'Fig. 99z';
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.modelCutUm.b = [-1, 0];
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.measurement.umPerPixel = 0;
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.measurement.matchedFeatures = 2;
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.measurement.registrationErrorUm = 0.03;
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.measurement.shapeMismatchUm = 0.06;
    },
    (entry) => {
      entry.acceptance.paperMatchEvidence.comparisonArtifactURL = 'https://example.com/mock.png';
    },
  ]) {
    const entry = structuredClone(validSchema);
    change(entry);
    assert.throws(() => assertPaperMatchEvidence(entry));
  }
});
