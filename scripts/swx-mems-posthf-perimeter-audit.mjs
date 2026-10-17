/**
 * Exact process-geometry witness for the EXPERIMENTAL SWX Ground/Signal perimeter.
 *
 * This reads the actual post-HF BOX polygons, never the unetched mask/pad
 * dimensions. The result is a centerline support contract, not a FEM result:
 * the BOX can be narrower than the surrounding device-Si in both X and Y.
 */
const EPS = 1e-10;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function addCrossingParams(params, a, b, p, q) {
  const r = sub(b, a);
  const s = sub(q, p);
  const d = cross(r, s);
  const offset = sub(p, a);
  if (Math.abs(d) < EPS) {
    if (Math.abs(cross(offset, r)) < EPS) {
      const norm = r[0] ** 2 + r[1] ** 2;
      for (const v of [p, q]) {
        const t = ((v[0] - a[0]) * r[0] + (v[1] - a[1]) * r[1]) / norm;
        if (t >= -EPS && t <= 1 + EPS) params.push(Math.min(1, Math.max(0, t)));
      }
    }
    return;
  }
  const t = cross(offset, s) / d;
  const u = cross(offset, r) / d;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    params.push(Math.min(1, Math.max(0, t)));
  }
}

export function measureBoxCenterline(vectorApi, box, a, b) {
  const lengthUm = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(lengthUm > 0)) throw new Error('BOX slice must have nonzero length');
  const ts = [0, 1];
  for (const polygon of box) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) {
        addCrossingParams(ts, a, b, ring[i], ring[i + 1]);
      }
    }
  }
  ts.sort((x, y) => x - y);
  const unique = ts.filter((t, i) => !i || t - ts[i - 1] > EPS);
  const intervals = [];
  for (let i = 0; i + 1 < unique.length; i++) {
    const start = unique[i],
      end = unique[i + 1];
    if (end - start <= EPS) continue;
    const supportedByBOX = vectorApi.pointInMulti(interpolate(a, b, (start + end) / 2), box);
    const previous = intervals.at(-1);
    if (
      previous &&
      previous.supportedByBOX === supportedByBOX &&
      Math.abs(previous.toT - start) < EPS
    ) {
      previous.toT = end;
      previous.to = interpolate(a, b, end);
      previous.lengthUm += (end - start) * lengthUm;
    } else {
      intervals.push({
        supportedByBOX,
        fromT: start,
        toT: end,
        from: interpolate(a, b, start),
        to: interpolate(a, b, end),
        lengthUm: (end - start) * lengthUm,
      });
    }
  }
  const supportedLengthUm = intervals.reduce(
    (sum, x) => sum + (x.supportedByBOX ? x.lengthUm : 0),
    0,
  );
  return {
    from: a,
    to: b,
    lengthUm,
    supportedLengthUm,
    releasedLengthUm: lengthUm - supportedLengthUm,
    intervals,
  };
}

export function auditSwxPostHFPerimeterSupport(vectorApi, model, g) {
  const region = model?.regions;
  if (!Array.isArray(region)) throw new Error('Post-HF audit requires process model regions');
  if (!Array.isArray(g?.groundPathsUm) || !Array.isArray(g?.signalPathUm))
    throw new Error('Missing authored routing centerlines');
  const boxSources = region.filter((r) => r.stack?.some((layer) => layer.layerId === 'layer-1'));
  if (!boxSources.length) throw new Error('Missing actual BOX process regions');
  const box = vectorApi.unionGeometries(boxSources.map((r) => r.geom));
  const ground = g.groundPathsUm.map((line, index) => ({
    route: 'ground-' + index,
    ...measureBoxCenterline(vectorApi, box, line[1], line[2]),
  }));
  const signal = measureBoxCenterline(vectorApi, box, ...g.externalSignalSupportEndpointsUm);
  const signalCrossSection = measureBoxCenterline(vectorApi, box, [0, -120], [0, -110]);
  const allSegments = [
    ...g.groundPathsUm.flatMap((points, index) =>
      points
        .slice(1)
        .map((b, i) => ({
          route: 'ground-' + index,
          ...measureBoxCenterline(vectorApi, box, points[i], b),
        })),
    ),
    ...g.signalPathUm
      .slice(1)
      .map((b, i) => ({
        route: 'signal',
        ...measureBoxCenterline(vectorApi, box, g.signalPathUm[i], b),
      })),
  ];
  const unsupportedParts = allSegments.flatMap(({ route, intervals }) =>
    intervals.filter((v) => !v.supportedByBOX).map((v) => ({ route, ...v })),
  );
  const longestActualReleasedSpan = unsupportedParts.reduce(
    (best, v) => (!best || v.lengthUm > best.lengthUm ? v : best),
    null,
  );
  return {
    basis: 'actual post-HF processed BOX geometry, physical centerlines only; no FEM',
    ground,
    signal,
    signalCrossSection,
    longestActualReleasedSpan,
    externalSignalContinuouslySupported:
      Math.abs(signal.supportedLengthUm - signal.lengthUm) < 1e-7,
    actualGroundSupportShorterThanNominal: ground.every(
      (x) => x.supportedLengthUm < g.rightGroundSupportWidthUm,
    ),
    originalAuthorMaskVerified: false,
    mechanicalFEMVerified: false,
    postHFMechanicalAcceptance: false,
  };
}
