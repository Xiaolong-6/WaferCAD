function sectionCollapseEdgeEpsilon(bounds) {
  const [rawLo, rawHi] = bounds || [];
  const lo = Number(rawLo),
    hi = Number(rawHi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return 1e-12;

  // Keep only a sub-nanometre-scale numerical guard at normal wafer thicknesses.
  // A percentage-of-span margin makes thick substrates trap the collapse handle
  // several micrometres away from the physical surface.
  const span = hi - lo;
  return Math.min(1e-3, Math.max(1e-9, span * 1e-6));
}

export function defaultSectionCollapse(bounds) {
  const [rawLo, rawHi] = bounds || [];
  const lo = Number(rawLo),
    hi = Number(rawHi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return { top: 0.5, bottom: -0.5 };

  const span = hi - lo,
    margin = span * 0.055;
  return {
    top: hi - margin,
    bottom: lo + margin,
  };
}

export function defaultSectionCollapseForModel(model, bounds) {
  const fallback = defaultSectionCollapse(bounds),
    baseIntervals = [];

  for (const region of model?.regions || []) {
    const base = (region?.stack || []).find((segment) => segment?.layerId === 'base');
    if (!base) return fallback;
    const z0 = Number(base.z0),
      z1 = Number(base.z1);
    if (!Number.isFinite(z0) || !Number.isFinite(z1) || !(z1 > z0)) return fallback;
    baseIntervals.push([z0, z1]);
  }

  if (!baseIntervals.length) return fallback;

  const commonLo = Math.max(...baseIntervals.map(([z0]) => z0)),
    commonHi = Math.min(...baseIntervals.map(([, z1]) => z1));
  if (!(commonHi > commonLo)) return fallback;

  const [rawLo, rawHi] = bounds || [],
    lo = Number(rawLo),
    hi = Number(rawHi),
    totalSpan =
      Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? hi - lo : commonHi - commonLo,
    commonSpan = commonHi - commonLo,
    inset = Math.min(commonSpan * 0.08, totalSpan * 0.03),
    top = commonHi - inset,
    bottom = commonLo + inset;

  if (!(top > bottom)) return fallback;
  return { top, bottom };
}

export function normalizeSectionZScales(value) {
  const clampScale = (raw) => {
      const number = Number(raw);
      return Number.isFinite(number) ? Math.max(0.1, Math.min(10, number)) : 1;
    },
    scaleLinked = value?.scaleLinked !== false,
    frontScale = scaleLinked ? 1 : clampScale(value?.frontScale),
    backScale = scaleLinked ? 1 : clampScale(value?.backScale);

  return { scaleLinked, frontScale, backScale };
}

export function resolveSectionCollapse(value, model, bounds) {
  const source = value ?? defaultSectionCollapseForModel(model, bounds),
    normalized = normalizeSectionCollapse(source, bounds);
  return {
    ...normalized,
    enabled: source?.enabled !== false,
    ...normalizeSectionZScales(source),
  };
}

export function createCollapsedZDisplayTransform({
  zMin,
  zMax,
  collapse,
  breakFraction = 0.04,
} = {}) {
  const min = Number(zMin),
    max = Number(zMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
    return {
      mapZ: (value) => Number(value),
      zMin: min,
      zMax: max,
      top: max,
      bottom: min,
      displayTop: max,
      displayBottom: min,
      gap: 0,
      displayMin: min,
      displayMax: max,
      displaySpan: Math.max(0, max - min),
    };
  }

  const normalized = normalizeSectionCollapse(collapse, [min, max]),
    enabled = collapse?.enabled !== false;

  const scales = normalizeSectionZScales(collapse);

  if (!enabled) {
    return {
      mapZ: (value) => Number(value),
      enabled: false,
      zMin: min,
      zMax: max,
      top: normalized.top,
      bottom: normalized.bottom,
      displayTop: normalized.top,
      displayBottom: normalized.bottom,
      gap: 0,
      displayMin: min,
      displayMax: max,
      displaySpan: max - min,
      ...scales,
    };
  }

  const hiddenSpan = Math.max(normalized.top - normalized.bottom, 1e-12),
    upperSpan = Math.max(0, max - normalized.top),
    lowerSpan = Math.max(0, normalized.bottom - min),
    visibleSpan = Math.max(
      upperSpan * scales.frontScale + lowerSpan * scales.backScale,
      (max - min) * 0.02,
    ),
    fraction = Math.max(0, Math.min(0.12, Number(breakFraction) || 0)),
    gap =
      fraction === 0
        ? 0
        : Math.min(hiddenSpan, Math.max((max - min) * 1e-6, visibleSpan * fraction)),
    center = (normalized.top + normalized.bottom) / 2,
    displayBottom = center - gap / 2,
    displayTop = center + gap / 2;

  const mapZ = (value) => {
    const z = Number(value);
    if (!Number.isFinite(z)) return z;
    if (z >= normalized.top) return displayTop + (z - normalized.top) * scales.frontScale;
    if (z <= normalized.bottom) return displayBottom + (z - normalized.bottom) * scales.backScale;
    return displayBottom + ((z - normalized.bottom) / hiddenSpan) * gap;
  };

  const displayMin = mapZ(min),
    displayMax = mapZ(max);

  return {
    mapZ,
    enabled: true,
    zMin: min,
    zMax: max,
    top: normalized.top,
    bottom: normalized.bottom,
    displayTop,
    displayBottom,
    gap,
    displayMin,
    displayMax,
    displaySpan: Math.max(1e-12, displayMax - displayMin),
    ...scales,
  };
}

export function normalizeSectionCollapse(value, bounds) {
  const [rawLo, rawHi] = bounds || [];
  const lo = Number(rawLo),
    hi = Number(rawHi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) {
    return defaultSectionCollapse([-1, 1]);
  }

  const span = hi - lo,
    minVisible = sectionCollapseEdgeEpsilon([lo, hi]),
    minCollapsed = Math.max(span * 0.02, 1e-12),
    fallback = defaultSectionCollapse([lo, hi]);

  let top = Number(value?.top),
    bottom = Number(value?.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    top = fallback.top;
    bottom = fallback.bottom;
  }

  top = Math.max(lo + minVisible + minCollapsed, Math.min(hi - minVisible, top));
  bottom = Math.max(lo + minVisible, Math.min(hi - minVisible - minCollapsed, bottom));

  if (!(top > bottom + minCollapsed)) {
    const center = Math.max(
      lo + minVisible + minCollapsed / 2,
      Math.min(hi - minVisible - minCollapsed / 2, (top + bottom) / 2),
    );
    top = center + minCollapsed / 2;
    bottom = center - minCollapsed / 2;
  }

  return { top, bottom };
}

export function translateSectionCollapse(value, delta, bounds) {
  const normalized = normalizeSectionCollapse(value, bounds),
    [rawLo, rawHi] = bounds || [],
    lo = Number(rawLo),
    hi = Number(rawHi),
    requested = Number(delta);

  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo) || !Number.isFinite(requested)) {
    return normalized;
  }

  const minVisible = sectionCollapseEdgeEpsilon([lo, hi]),
    minBottom = lo + minVisible,
    maxTop = hi - minVisible,
    applied = Math.max(minBottom - normalized.bottom, Math.min(maxTop - normalized.top, requested));

  return {
    top: normalized.top + applied,
    bottom: normalized.bottom + applied,
  };
}

export function sectionVisibleZSpan(zMin, zMax, collapse) {
  if (collapse?.enabled === false) return Math.max(0, zMax - zMin);
  return Math.max(0, zMax - collapse.top) + Math.max(0, collapse.bottom - zMin);
}

export function createSectionZTransform({
  zMin,
  zMax,
  collapse,
  plotTop,
  plotHeight,
  breakPixels = 8,
  mode = 'auto',
  xScale = 1,
}) {
  const min = Number(zMin),
    max = Number(zMax),
    height = Math.max(1, Number(plotHeight) || 1),
    enabled = collapse?.enabled !== false;

  if (!enabled) {
    const worldSpan = Math.max(1e-12, max - min),
      scale =
        mode === 'physical'
          ? Math.max(1e-12, Math.min(Number(xScale) || 1, height / worldSpan))
          : height / worldSpan,
      frameHeight = worldSpan * scale,
      frameTop = (Number(plotTop) || 0) + (height - frameHeight) / 2,
      frameBottom = frameTop + frameHeight,
      center = frameTop + frameHeight / 2;

    return {
      mapZ: (z) => frameTop + ((max - Number(z)) / worldSpan) * frameHeight,
      frameTop,
      frameBottom,
      frameHeight,
      upperBottom: center,
      lowerTop: center,
      breakCenter: center,
      breakPixels: 0,
      topScale: scale,
      bottomScale: scale,
      enabled: false,
      isHidden: () => false,
    };
  }

  const gap = Math.max(4, Math.min(Number(breakPixels) || 8, height * 0.12)),
    upperWorld = Math.max(1e-12, max - collapse.top),
    lowerWorld = Math.max(1e-12, collapse.bottom - min);

  let frameTop = Number(plotTop) || 0,
    frameHeight = height,
    upperPixels,
    lowerPixels;

  if (mode === 'physical') {
    const scale = Math.max(
      1e-12,
      Math.min(Number(xScale) || 1, (height - gap) / Math.max(upperWorld + lowerWorld, 1e-12)),
    );
    upperPixels = upperWorld * scale;
    lowerPixels = lowerWorld * scale;
    frameHeight = upperPixels + gap + lowerPixels;
    frameTop += (height - frameHeight) / 2;
  } else {
    const usable = Math.max(1, height - gap),
      scales = normalizeSectionZScales(collapse),
      weightedUpper = upperWorld * scales.frontScale,
      weightedLower = lowerWorld * scales.backScale,
      fitScale = usable / Math.max(weightedUpper + weightedLower, 1e-12);
    upperPixels = weightedUpper * fitScale;
    lowerPixels = weightedLower * fitScale;
  }

  const upperBottom = frameTop + upperPixels,
    lowerTop = upperBottom + gap,
    breakCenter = (upperBottom + lowerTop) / 2,
    frameBottom = lowerTop + lowerPixels,
    topScale = upperPixels / upperWorld,
    bottomScale = lowerPixels / lowerWorld;

  function mapZ(z) {
    const value = Number(z);
    if (value >= collapse.top) {
      return frameTop + ((max - value) / upperWorld) * upperPixels;
    }
    if (value <= collapse.bottom) {
      return lowerTop + ((collapse.bottom - value) / lowerWorld) * lowerPixels;
    }
    return upperBottom + ((collapse.top - value) / (collapse.top - collapse.bottom)) * gap;
  }

  return {
    mapZ,
    frameTop,
    frameBottom,
    frameHeight,
    upperBottom,
    lowerTop,
    breakCenter,
    breakPixels: gap,
    topScale,
    bottomScale,
    enabled: true,
    isHidden: (z) => z < collapse.top && z > collapse.bottom,
  };
}

export function sectionCollapseSnapValues(model, bounds = null) {
  const values = new Set();
  const push = (value) => {
    const number = Number(value);
    if (Number.isFinite(number)) values.add(Number(number.toFixed(9)));
  };

  if (Array.isArray(bounds)) {
    push(bounds[0]);
    push(bounds[1]);
  }

  for (const region of model?.regions || []) {
    for (const segment of region?.stack || []) {
      push(segment?.z0);
      push(segment?.z1);
    }
  }

  for (const implant of model?.implants || []) {
    for (const patch of implant?.patches || []) {
      push(patch?.z);
      push(patch?.zMin);
      push(patch?.zMax);
      push(patch?.sourceZ);
      push(patch?.outerZ);
      push(patch?.innerZ);
    }
  }

  return [...values].sort((a, b) => a - b);
}

export function niceSectionTicks(minimum, maximum, target = 4) {
  const min = Number(minimum),
    max = Number(maximum);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [];

  const span = max - min,
    raw = span / Math.max(1, Number(target) || 4),
    power = 10 ** Math.floor(Math.log10(raw)),
    fraction = raw / power,
    nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10,
    step = nice * power,
    first = Math.ceil((min - step * 1e-9) / step) * step,
    out = [];

  for (let value = first; value <= max + step * 1e-9 && out.length < 16; value += step) {
    out.push(Number(value.toPrecision(12)));
  }
  return out;
}
