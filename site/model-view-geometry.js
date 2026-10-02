import { intersection, isEmpty, unionGeometries } from './vector-geometry.js';
import {
  appearanceSurfaceGroupsFromTopology,
  extrusionGroupsFromTopology,
  materialSolidsFromTopology,
  sectionColumnsFromTopology,
  sectionSlicesFromTopology,
  visibleSurfaceGroups,
} from './process-topology.js';

// All views consume canonical physical XYZ geometry; visual Z scaling is renderer-only.
// Topology v2 owns the shared volumetric/section derivation; this module keeps
// the stable view-facing API.
export function extrusionGroups(model, clip = null) {
  return extrusionGroupsFromTopology(model, clip);
}

export function sectionColumns(model, a, b) {
  return sectionColumnsFromTopology(model, a, b);
}

export function sectionSlices(model, a, b) {
  return sectionSlicesFromTopology(model, a, b);
}

// Region partitions describe processing history, not visible material boundaries.
// Topology v2 owns which horizontal faces are physically exposed and which
// rough interfaces are buried; the view layer only adapts those facts.
export function surfaceGroups(model, face = 'front') {
  return visibleSurfaceGroups(model, { face }).map(({ layerId, z, geom }) => ({
    layerId,
    z,
    geom,
  }));
}

export function appearanceSurfaceGroups(model, clip = null) {
  return appearanceSurfaceGroupsFromTopology(model, clip).map(
    ({ layerId, z, face, profileNormal, appearance, buried, polys }) => ({
      layerId,
      z,
      face,
      profileNormal,
      appearance,
      buried,
      polys,
    }),
  );
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

// A material's boundary is built by topology v2 from unioned Z slabs.
// Only footprint differences become horizontal caps; overlapping slab
// transitions are internal and never rendered as physical faces.
export function materialSolids(model, clip = null) {
  return materialSolidsFromTopology(model, clip);
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


function implantFragments(model, clip = null) {
  const fragments = [];
  for (const implant of model?.implants || []) {
    if (implant.visible === false) continue;
    const thickness = Math.max(0, Number(implant.thickness) || 0);
    if (!(thickness > 1e-12)) continue;

    for (const patch of implant.patches || []) {
      const sourceLow = implant.face === 'front' ? patch.z - thickness : patch.z,
        sourceHigh = implant.face === 'front' ? patch.z : patch.z + thickness;

      for (const region of model.regions || []) {
        if (!region.stack?.length) continue;
        let geom = intersection(patch.geom, region.geom);
        if (clip && !isEmpty(geom)) geom = intersection(geom, clip);
        if (isEmpty(geom)) continue;

        const currentLow = region.stack[0].z0,
          currentHigh = region.stack.at(-1).z1,
          z0 = Math.max(sourceLow, currentLow),
          z1 = Math.min(sourceHigh, currentHigh);
        if (!(z1 > z0 + 1e-12)) continue;

        const surfaceSegment =
            implant.face === 'front' ? region.stack.at(-1) : region.stack[0],
          currentSurfaceZ = implant.face === 'front' ? currentHigh : currentLow,
          sourceSurfaceZ = Number(patch.z),
          currentCutsImplant =
            implant.face === 'front'
              ? currentSurfaceZ < sourceSurfaceZ - 1e-9
              : currentSurfaceZ > sourceSurfaceZ + 1e-9,
          currentAppearance =
            implant.face === 'front'
              ? surfaceSegment?.frontSurface
              : surfaceSegment?.backSurface,
          outerZ = implant.face === 'front' ? z1 : z0,
          innerZ = implant.face === 'front' ? z0 : z1;

        fragments.push({
          implantId: implant.id,
          name: implant.name,
          color: implant.color,
          face: implant.face,
          thickness,
          tilt: Number(implant.tilt) || 0,
          sourceZ: sourceSurfaceZ,
          outerZ,
          innerZ,
          z0,
          z1,
          surfaceAppearance:
            (currentCutsImplant ? currentAppearance : patch.surfaceAppearance) || null,
          polys: geom,
        });
      }
    }
  }
  return fragments;
}

export function implantSurfaceGroups(model, clip = null) {
  return implantFragments(model, clip).map((fragment) => ({
    ...fragment,
    z: fragment.outerZ,
  }));
}

export function implantSolids(model, clip = null) {
  return implantFragments(model, clip).map((fragment) => ({
    ...fragment,
    slabs: [{ z0: fragment.z0, z1: fragment.z1, polys: fragment.polys }],
    caps: [
      { z: fragment.z0, normal: -1, polys: fragment.polys },
      { z: fragment.z1, normal: 1, polys: fragment.polys },
    ],
  }));
}

export function implantSectionBands(model, a, b) {
  const bands = [];
  for (const fragment of implantFragments(model)) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, fragment.polys)) {
      bands.push({
        ...fragment,
        t0,
        t1,
      });
    }
  }
  return bands;
}
