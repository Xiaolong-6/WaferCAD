import { intersection, isEmpty, lineIntervalsInMulti, unionGeometries } from './vector-geometry.js';

// Both views consume canonical XY and relative Z; visual Z scaling is renderer-only.
export function extrusionGroups(model, clip = null) {
  const groups = new Map();
  for (const region of model.regions) {
    const geom = clip ? intersection(region.geom, clip) : region.geom;
    if (isEmpty(geom)) continue;
    for (const segment of region.stack) {
      const key = JSON.stringify([segment.layerId, segment.z0, segment.z1]);
      if (!groups.has(key)) groups.set(key, { ...segment, geoms: [] });
      groups.get(key).geoms.push(geom);
    }
  }
  return [...groups.values()].map(({ geoms, ...segment }) => ({
    ...segment,
    polys: unionGeometries(geoms),
  }));
}

export function sectionSlices(model, a, b) {
  const slices = [];
  for (const region of model.regions) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, region.geom)) {
      for (const segment of region.stack) slices.push({ ...segment, t0, t1 });
    }
  }
  return slices;
}
