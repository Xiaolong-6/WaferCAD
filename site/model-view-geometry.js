import {
  difference,
  intersection,
  isEmpty,
  lineIntervalsInMulti,
  unionGeometries,
} from './vector-geometry.js';
import { surfacePatches } from './model.js';

// All views consume canonical physical XYZ geometry; visual Z scaling is renderer-only.
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

export function sectionColumns(model, a, b) {
  const columns = [];
  for (const region of model.regions) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, region.geom)) {
      columns.push({
        t0,
        t1,
        stack: region.stack.map((segment) => ({
          ...segment,
          frontSurface: segment.frontSurface ? { ...segment.frontSurface } : undefined,
          backSurface: segment.backSurface ? { ...segment.backSurface } : undefined,
        })),
      });
    }
  }
  return columns;
}

export function sectionSlices(model, a, b) {
  const slices = [];
  for (const column of sectionColumns(model, a, b)) {
    for (let index = 0; index < column.stack.length; index++) {
      const segment = column.stack[index],
        below = column.stack[index - 1] || null,
        above = column.stack[index + 1] || null;
      slices.push({
        ...segment,
        t0: column.t0,
        t1: column.t1,
        below: below ? { ...below } : null,
        above: above ? { ...above } : null,
      });
    }
  }
  return slices;
}

// Region partitions describe processing history, not visible material boundaries.
export function surfaceGroups(model, face = 'front') {
  const groups = new Map();
  for (const patch of surfacePatches(model, face)) {
    const key = JSON.stringify([patch.layerId, patch.z]);
    if (!groups.has(key)) groups.set(key, { layerId: patch.layerId, z: patch.z, geoms: [] });
    groups.get(key).geoms.push(patch.geom);
  }
  return [...groups.values()].map(({ geoms, ...patch }) => ({
    ...patch,
    geom: unionGeometries(geoms),
  }));
}

export function appearanceSurfaceGroups(model, clip = null) {
  const groups = new Map();
  for (const face of ['front', 'back']) {
    for (const patch of surfacePatches(model, face)) {
      if (patch.appearance?.kind !== 'rough') continue;
      const geom = clip ? intersection(patch.geom, clip) : patch.geom;
      if (isEmpty(geom)) continue;
      const key = JSON.stringify([
        patch.layerId,
        patch.z,
        face,
        patch.appearance.profileId,
        patch.appearance.featureSize,
        patch.appearance.meanHeight,
        patch.appearance.featureCv,
        patch.appearance.heightCv,
        patch.appearance.seed,
        patch.appearance.geometryMode,
      ]);
      if (!groups.has(key))
        groups.set(key, {
          layerId: patch.layerId, z: patch.z, face,
          appearance: { ...patch.appearance }, geoms: [],
        });
      groups.get(key).geoms.push(geom);
    }
  }
  return [...groups.values()].map(({ geoms, ...patch }) => ({
    ...patch,
    polys: unionGeometries(geoms),
  }));
}

export function sectionContours(model, a, b) {
  const groups = new Map();
  for (const { layerId, t0, t1, z0, z1 } of sectionSlices(model, a, b)) {
    if (!groups.has(layerId)) groups.set(layerId, []);
    groups.get(layerId).push([
      [
        [
          [t0, z0],
          [t1, z0],
          [t1, z1],
          [t0, z1],
          [t0, z0],
        ],
      ],
    ]);
  }
  return [...groups].map(([layerId, geoms]) => ({ layerId, polys: unionGeometries(geoms) }));
}

// A material's boundary is built from unioned Z slabs. Only footprint differences
// become horizontal faces; overlapping material at a slab transition is internal.
export function materialSolids(model, clip = null) {
  const layers = new Map();
  for (const item of extrusionGroups(model, clip)) {
    if (!layers.has(item.layerId)) layers.set(item.layerId, []);
    layers.get(item.layerId).push(item);
  }
  return [...layers].map(([layerId, items]) => {
    const events = new Map();
    for (const item of items) {
      for (const [z, kind] of [
        [item.z0, 'start'],
        [item.z1, 'end'],
      ]) {
        if (!events.has(z)) events.set(z, { start: [], end: [] });
        events.get(z)[kind].push(item);
      }
    }
    const levels = [...events.keys()].sort((a, b) => a - b);
    const active = new Set(),
      slabs = [];
    for (let i = 0; i < levels.length - 1; i++) {
      const z0 = levels[i],
        z1 = levels[i + 1],
        event = events.get(z0);
      for (const item of event.end) active.delete(item);
      for (const item of event.start) active.add(item);
      const polys = unionGeometries([...active].map((item) => item.polys));
      slabs.push({ z0, z1, polys });
    }
    const caps = [];
    for (let i = 0; i < slabs.length; i++) {
      const slab = slabs[i];
      for (const [z, normal, neighbor] of [
        [slab.z0, -1, slabs[i - 1]],
        [slab.z1, 1, slabs[i + 1]],
      ]) {
        const polys = difference(slab.polys, neighbor?.polys || []);
        if (!isEmpty(polys)) caps.push({ z, normal, polys });
      }
    }
    return { layerId, slabs: slabs.filter((slab) => !isEmpty(slab.polys)), caps };
  });
}

export function solidBorders({ slabs, caps }, thresholdDegrees = 20) {
  const lines = [];
  for (const { z, polys } of caps)
    for (const poly of polys)
      for (const ring of poly)
        for (let i = 1; i < ring.length; i++)
          lines.push([
            [...ring[i - 1], z],
            [...ring[i], z],
          ]);
  const threshold = Math.cos((thresholdDegrees * Math.PI) / 180);
  for (const { z0, z1, polys } of slabs)
    for (const poly of polys)
      for (const closed of poly) {
        const ring = closed.slice(0, -1);
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i],
            before = ring[(i + ring.length - 1) % ring.length],
            after = ring[(i + 1) % ring.length];
          const u = [p[0] - before[0], p[1] - before[1]],
            v = [after[0] - p[0], after[1] - p[1]];
          const cosine = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
          if (cosine <= threshold)
            lines.push([
              [...p, z0],
              [...p, z1],
            ]);
        }
      }
  return lines;
}


export function implantSurfaceGroups(model, clip = null) {
  const groups = [];
  for (const implant of model?.implants || []) {
    for (const patch of implant.patches || []) {
      const polys = clip ? intersection(patch.geom, clip) : patch.geom;
      if (isEmpty(polys)) continue;
      groups.push({
        implantId: implant.id,
        name: implant.name,
        color: implant.color,
        face: implant.face,
        thickness: implant.thickness,
        tilt: implant.tilt || 0,
        border: Boolean(implant.border),
        z: patch.z,
        zMin: patch.zMin,
        zMax: patch.zMax,
        layerId: patch.layerId,
        polys,
      });
    }
  }
  return groups;
}

export function implantSectionBands(model, a, b) {
  const bands = [];
  for (const implant of model?.implants || []) {
    for (const patch of implant.patches || []) {
      for (const [t0, t1] of lineIntervalsInMulti(a, b, patch.geom)) {
        bands.push({
          implantId: implant.id,
          name: implant.name,
          color: implant.color,
          face: implant.face,
          thickness: implant.thickness,
          tilt: implant.tilt || 0,
          border: Boolean(implant.border),
          z: patch.z,
          zMin: patch.zMin,
          zMax: patch.zMax,
          layerId: patch.layerId,
          t0,
          t1,
        });
      }
    }
  }
  return bands;
}
