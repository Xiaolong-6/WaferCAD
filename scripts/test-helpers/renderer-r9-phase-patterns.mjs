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
  let terminal = null;
  for (let i = 0; i < reference.length; i++) {
    const entries = trials.map((trial) => trial.phaseCheckpoints?.[i]);
    const draw = entries[0]?.afterDraw;
    const last = i === reference.length - 1;
    const aligned = last
      ? entries[0]?.afterDraw === entries[1]?.afterDraw &&
        entries[2]?.afterDraw === entries[3]?.afterDraw
      : entries.every((entry) => entry?.afterDraw === draw);
    if (
      !Number.isSafeInteger(draw) ||
      !aligned ||
      entries.some(
        (entry, arm) =>
          !Number.isSafeInteger(entry?.afterDraw) ||
          entry.afterDraw <= trials[arm].phaseCheckpoints[i - 1]?.afterDraw ||
          entry.status !== 'valid' ||
          !/^[a-f0-9]{64}$/.test(entry.hash || '') ||
          !Number.isInteger(entry.width) ||
          entry.width <= 0 ||
          !Number.isInteger(entry.height) ||
          entry.height <= 0 ||
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
    if (last) {
      terminal = {
        drawsByPolicy: { off: entries[0].afterDraw, on: entries[2].afterDraw },
        pattern: classifyGroups(groups),
        groups,
      };
    } else {
      rows.push({
        afterDraw: draw,
        kind: entries[0].kind,
        pattern: classifyGroups(groups),
        groups,
      });
    }
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
    terminal,
    interpretation: 'observed partitions do not establish hardware or software causality',
  };
}
