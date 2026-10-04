import { intersection, isEmpty, lineIntervalsInMulti, unionGeometries } from './vector-geometry.js';
import {
  appearanceSurfaceGroupsFromTopology,
  extrusionGroupsFromTopology,
  materialSolidsFromTopology,
  sectionColumnsFromTopology,
  sectionSlicesFromTopology,
  solidBordersFromTopology,
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

export function solidBorders(solid, thresholdDegrees = 20) {
  return solidBordersFromTopology(solid, thresholdDegrees);
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
          surfaceSegment =
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
              : surfaceSegment?.backSurface;

        // A released region can contain true Z gaps. Clip the annotation to
        // each surviving material interval rather than spanning from the first
        // to the last segment and visually filling an air cavity.
        for (const materialSegment of region.stack) {
          const z0 = Math.max(sourceLow, materialSegment.z0),
            z1 = Math.min(sourceHigh, materialSegment.z1);
          if (!(z1 > z0 + 1e-12)) continue;

          const outerZ = implant.face === 'front' ? z1 : z0,
            innerZ = implant.face === 'front' ? z0 : z1,
            surfaceExposed = Math.abs(currentSurfaceZ - outerZ) <= 1e-9;

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
            surfaceExposed,
            z0,
            z1,
            surfaceAppearance:
              (currentCutsImplant ? currentAppearance : patch.surfaceAppearance) || null,
            polys: geom,
          });
        }
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
