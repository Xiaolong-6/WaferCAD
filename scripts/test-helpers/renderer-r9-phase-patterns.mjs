// Offline classification of native framebuffer-hash partitions.
// Equal hashes are observations, not evidence of equal rendering inputs.
const ARM_LABELS = ['1-OFF', '2-OFF', '3-ON', '4-ON'];

function classifyGroups(groups) {
  const signature = groups.map((members) => members.join(',')).join('|');
  if (signature === '1-OFF,2-OFF,3-ON,4-ON') return 'all-identical';
  if (signature === '1-OFF,3-ON|2-OFF,4-ON') return 'replicate-index-grouped';
  if (signature === '1-OFF,2-OFF|3-ON,4-ON') return 'policy-grouped';
  if (groups.length === 4) return 'all-distinct';
  return 'mixed';
}

export function summarizeRendererR9PhasePatterns(trials) {
  if (!Array.isArray(trials) || trials.length !== 4) {
    throw new Error('R9 pattern analysis requires four complete trials');
  }
  if (trials.some((trial, i) => trial?.label !== ARM_LABELS[i])) {
    throw new Error('R9 pattern analysis requires ordered OFF/OFF/ON/ON labels');
  }
  const reference = trials[0].phaseCheckpoints;
  if (!Array.isArray(reference) || reference.length < 2 || reference.length > 12) {
    throw new Error('R9 pattern analysis requires bounded native checkpoints');
  }
  const rows = [];
  for (let i = 0; i < reference.length; i++) {
    const entries = trials.map((trial) => trial.phaseCheckpoints?.[i]);
    const draw = entries[0]?.afterDraw;
    if (
      !Number.isSafeInteger(draw) ||
      draw <= (i ? reference[i - 1].afterDraw : 0) ||
      entries.some(
        (entry) =>
          entry?.afterDraw !== draw ||
          entry.status !== 'valid' ||
          !/^[a-f0-9]{64}$/.test(entry.hash || '') ||
          entry.width !== entries[0].width ||
          entry.height !== entries[0].height,
      )
    ) {
      throw new Error('R9 pattern analysis rejects malformed or unaligned checkpoints');
    }
    const groupsByHash = new Map();
    entries.forEach((entry, arm) => {
      if (!groupsByHash.has(entry.hash)) groupsByHash.set(entry.hash, []);
      groupsByHash.get(entry.hash).push(ARM_LABELS[arm]);
    });
    const groups = [...groupsByHash.values()];
    rows.push({
      afterDraw: draw,
      kind: entries[0].kind,
      pattern: classifyGroups(groups),
      groups,
    });
  }
  const first = (pattern) => rows.find((row) => row.pattern === pattern)?.afterDraw ?? null;
  const firstSamePolicyDrift = rows.find(
    (row) =>
      !row.groups.some((group) => group.includes('1-OFF') && group.includes('2-OFF')) ||
      !row.groups.some((group) => group.includes('3-ON') && group.includes('4-ON')),
  );
  return {
    source: 'native-framebuffer-hash-partitions-only',
    sampleCount: rows.length,
    firstSamePolicyDriftDraw: firstSamePolicyDrift?.afterDraw ?? null,
    firstReplicateIndexGroupingDraw: first('replicate-index-grouped'),
    firstAllDistinctDraw: first('all-distinct'),
    checkpoints: rows,
    interpretation: 'observed partitions do not establish hardware or software causality',
  };
}
