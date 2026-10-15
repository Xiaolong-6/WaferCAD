// Physical Z Break line clipping. Preserve the old parameterization, cut
// order and floating-point expression order, but avoid allocating endpoint
// arrays and temporary lerp vertices for every border segment.
export function clipBorderPositions(positions, state) {
  if (!state || !positions?.length) return positions || [];
  const out = [];

  for (let index = 0; index + 5 < positions.length; index += 6) {
    const ax = positions[index];
    const ay = positions[index + 1];
    const az = positions[index + 2];
    const bx = positions[index + 3];
    const by = positions[index + 4];
    const bz = positions[index + 5];
    const dz = bz - az;
    const cuts = [0, 1];

    if (Math.abs(dz) > 1e-12) {
      for (const boundary of [state.bottom, state.top]) {
        const t = (boundary - az) / dz;
        if (t > 0 && t < 1) cuts.push(t);
      }
    }

    cuts.sort((left, right) => left - right);
    const dx = bx - ax;
    const dy = by - ay;
    for (let part = 0; part < cuts.length - 1; part++) {
      const t0 = cuts[part];
      const t1 = cuts[part + 1];
      const middleZ = az + dz * ((t0 + t1) / 2);
      if (
        state.enabled !== false &&
        Number.isFinite(middleZ) &&
        middleZ < state.top &&
        middleZ > state.bottom
      ) {
        continue;
      }
      out.push(
        ax + dx * t0,
        ay + dy * t0,
        az + dz * t0,
        ax + dx * t1,
        ay + dy * t1,
        az + dz * t1,
      );
    }
  }
  return out;
}
