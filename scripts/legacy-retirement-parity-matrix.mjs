// Conservative file-level ownership map for Issue #184.
// Candidate scripts prove individual slices; they NEVER certify full replacement.
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLegacyRetirementOwners } from './legacy-retirement-owner-audit.mjs';

export const CRITICAL_LEGACY_CONTRACTS = [
  {
    path: 'scripts/workstation-regression.mjs',
    domain: 'Startup, Welcome, writer isolation, desktop and mobile Workstation',
    native: [
      'scripts/v2/check-source-sunset-workstation.mjs',
      'scripts/v2/check-startup-shell.mjs',
      'scripts/v2/check-welcome-preview-isolation.mjs',
      'scripts/v2/check-desktop-docking.mjs',
      'scripts/v2/check-mobile-workstation.mjs',
    ],
    gaps: [
      'Original Legacy boot/transformation and all Welcome card visual assertions are archived',
      'Per-control UX equivalence requires independent native v2 review and screenshots',
    ],
  },
  {
    path: 'scripts/view-ux-v3-regression.mjs',
    domain: 'Four-view interaction, Mask process ROI, Section Z break and 3D controls',
    native: [
      'scripts/v2/check-source-sunset-view-ux.mjs',
      'scripts/v2/check-main-view.mjs',
      'scripts/v2/check-mask-view.mjs',
      'scripts/v2/check-mask-process-area.mjs',
      'scripts/v2/check-section-view.mjs',
      'scripts/v2/check-three-view.mjs',
      'scripts/v2/check-unit-roi-alignment-lifecycle.mjs',
      'scripts/v2/check-review-interactions.mjs',
    ],
    gaps: [
      'Original Legacy menu and responsive overflow action-by-action parity',
      'Independent Z-break/3D/GLB scientific geometry acceptance beyond basic gestures',
    ],
  },
  {
    path: 'scripts/process-recipe-safety-regression.mjs',
    domain: 'Recipe drafts, templates, prefix replay and Stop',
    native: [
      'scripts/v2/check-recipe-preflight-atomicity.mjs',
      'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    ],
    draftPrs: [268],
    gaps: [
      'template replacement/Recovery and Undo',
      'Code draft switching',
      'Recipe Stop across all start modes, History paths and retry variants',
    ],
  },
  {
    path: 'scripts/process-transaction-ui-regression.mjs',
    domain: 'Worker Abort, rejection and rollback',
    native: [
      'scripts/v2/check-recipe-preflight-atomicity.mjs',
      'scripts/v2/check-worker-fault-parity.mjs',
    ],
    draftPrs: [265],
    gaps: [
      'all delayed-result, lease-loss and worker-crash interleavings',
      'equivalence of every Legacy transactional fault matrix scenario',
    ],
  },
  {
    path: 'scripts/history-regression.mjs',
    domain: 'History replay and branching',
    native: [
      'scripts/v2/check-cross-ui-recovery.mjs',
      'scripts/v2/check-history-variant-parity.mjs',
      'scripts/v2/check-history-replay-rollback.mjs',
      'scripts/v2/check-history-pointer-parity.mjs',
      'scripts/v2/check-history-insert-recovery.mjs',
    ],
    gaps: [
      'bookmark editing and complete historical Step edit/insert action matrix',
      'History export and aborted replay/Recovery restore cross-session matrix',
    ],
  },
  {
    path: 'scripts/persistence-regression.mjs',
    domain: 'Storage and Recovery',
    native: [
      'scripts/v2/check-cross-ui-recovery.mjs',
      'scripts/v2/check-legacy-project-recovery.mjs',
      'scripts/v2/check-recovery-restore-parity.mjs',
      'scripts/v2/check-recovery-failure-atomicity.mjs',
      'scripts/v2/check-recovery-lease-loss.mjs',
      'scripts/v2/check-recovery-two-tab-takeover.mjs',
    ],
    gaps: [
      'IndexedDB corruption, secondary rollback failure and migration fault cases',
      'divergent-editor two-tab takeover reconciliation and unavailable-storage recovery',
    ],
  },
  {
    path: 'scripts/process-geometry-regression.mjs',
    domain: 'Process geometry, Section and GLB',
    native: ['scripts/v2/check-physical-process-units.mjs'],
    gaps: ['roughness/implant/conformal matrix', 'Section and GLB morphology oracle'],
  },
  {
    path: 'scripts/interaction-regression.mjs',
    domain: 'Mask, ROI and gestures',
    native: ['scripts/v2/check-mask-process-area.mjs'],
    gaps: ['shape editing and alignment units', 'slice, zoom and 3D interactions'],
  },
  {
    path: 'scripts/project-io-runtime-regression.mjs',
    domain: 'Project I/O and schema',
    native: ['scripts/v2/check-legacy-project-recovery.mjs'],
    gaps: ['all UI import/export failure cases', 'roundtrip and GDS/OAS export'],
  },
  {
    path: 'scripts/array-runtime-regression.mjs',
    domain: 'Array model science',
    native: ['scripts/v2/check-array-625-science.mjs'],
    gaps: [
      'Array conformal/etch and ROI/scoped Worker mutations at every site',
      '6400-site metalens, 3D instancing and GDS/OAS/GLB export equivalence',
    ],
  },
  {
    path: 'scripts/array-renderer-regression.mjs',
    domain: 'Large-array renderer',
    native: [],
    gaps: ['LOD, Variant rendering, memory and performance oracles'],
  },
  {
    path: 'scripts/renderer-product-regression.mjs',
    domain: 'Renderer product and exports',
    native: [],
    gaps: ['3D screenshots and GLB/PNG output acceptance'],
  },
  {
    path: 'scripts/klayout-ui-compat.mjs',
    domain: 'Pinned external KLayout corpus',
    native: ['scripts/v2/check-klayout-corpus-ui.mjs', 'scripts/v2/check-klayout-mask-process.mjs'],
    gaps: ['per-file verdict correspondence', 'all parser/export/roundtrip oracles'],
  },
  {
    path: 'scripts/example-recipe-runall-acceptance.mjs',
    domain: 'Example Recipe Run All',
    native: [],
    gaps: ['all published examples and every intermediate physical Step'],
  },
  {
    path: 'scripts/fig3-full-replay-acceptance.mjs',
    domain: 'Fig3 wafer replay',
    native: [],
    gaps: ['full replay geometry, Section/3D and export parity'],
  },
  {
    path: 'scripts/m3d-full-replay-acceptance.mjs',
    domain: 'M3D physical and visual acceptance',
    native: [],
    gaps: ['every M3D stage and Section/3D export oracle'],
  },
  {
    path: 'scripts/tio2-metalens-ui-regression.mjs',
    domain: '625-site metalens array',
    native: [],
    gaps: ['625-site ROI/History/geometry and render oracles'],
  },
];

async function exists(root, path) {
  try {
    await access(join(root, path));
    return true;
  } catch {
    return false;
  }
}

export async function auditLegacyRetirementParity(root = resolve('.')) {
  const inventory = await auditLegacyRetirementOwners(root);
  const indexed = new Map(
    inventory.owners
      .filter((owner) => owner.testOwner && (owner.helpers || owner.editor || owner.bridge))
      .map((owner) => [owner.path, owner]),
  );
  const critical = new Map(CRITICAL_LEGACY_CONTRACTS.map((owner) => [owner.path, owner]));
  const paths = [...new Set([...indexed.keys(), ...critical.keys()])].sort();
  const rows = [];
  for (const path of paths) {
    const spec = critical.get(path);
    const candidates = await Promise.all(
      (spec?.native || []).map(async (candidate) => ({
        path: candidate,
        existsOnBranch: await exists(root, candidate),
      })),
    );
    rows.push({
      path,
      domain: spec?.domain || 'Unclassified direct Legacy reference',
      critical: Boolean(spec),
      indexed: indexed.has(path),
      legacySourcePresent: await exists(root, path),
      status: spec
        ? candidates.some((candidate) => candidate.existsOnBranch)
          ? 'v2-invariant-owner'
          : 'long-term-science-debt'
        : 'unclassified',
      nativeCandidates: candidates,
      draftPrs: spec?.draftPrs || [],
      missingParity: spec?.gaps || ['Map every old assertion to a real v2/canonical owner'],
      sourceDeletionApproved: false,
    });
  }
  return {
    version: 1,
    sourceRetirementReady: true, // UI-only sunset; science debt belongs to #289.
    totals: {
      rows: rows.length,
      critical: CRITICAL_LEGACY_CONTRACTS.length,
      unclassified: rows.filter((row) => !row.critical).length,
      missingCriticalSources: rows.filter((row) => row.critical && !row.legacySourcePresent).length,
      missingNativeCandidates: rows.flatMap((row) =>
        row.nativeCandidates.filter((candidate) => !candidate.existsOnBranch),
      ).length,
      unindexedCritical: rows.filter((row) => row.critical && !row.indexed).length,
    },
    rows,
    warnings: [
      'Native candidate coverage is scoped; remaining scientific invariants are tracked in #289.',
      'Draft #265/#268 do not count as accepted replacement.',
      'Transitive or dynamic test ownership is not captured by a literal Legacy search.',
      'Preserve archived project/IndexedDB Recovery and the published bookmark redirect.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await auditLegacyRetirementParity(), null, 2));
}
