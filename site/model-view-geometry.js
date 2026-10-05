import { intersection, isEmpty, lineIntervalsInMulti, unionGeometries } from './vector-geometry.js';
import { visibleMaterialModel } from './model.js';
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
  return extrusionGroupsFromTopology(visibleMaterialModel(model), clip);
}

export function sectionColumns(model, a, b) {
  return sectionColumnsFromTopology(visibleMaterialModel(model), a, b);
}

export function sectionSlices(model, a, b) {
  return sectionSlicesFromTopology(visibleMaterialModel(model), a, b);
}

// Region partitions describe processing history, not visible material boundaries.
// Topology v2 owns which horizontal faces are physically exposed and which
// rough interfaces are buried; the view layer only adapts those facts.
export function surfaceGroups(model, face = 'front') {
  return visibleSurfaceGroups(visibleMaterialModel(model), { face }).map(
    ({ layerId, z, geom, appearance }) => ({
      layerId,
      z,
      geom,
      appearance,
    }),
  );
}

export function appearanceSurfaceGroups(model, clip = null) {
  return appearanceSurfaceGroupsFromTopology(visibleMaterialModel(model), clip).map(
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
  return materialSolidsFromTopology(visibleMaterialModel(model), clip);
}

export function solidBorders(solid, thresholdDegrees = 20) {
  return solidBordersFromTopology(solid, thresholdDegrees);
}

function annotationVolumeFragments(items, model, clip = null, kind = 'annotation') {
  const fragments = [];
  for (const item of items || []) {
    if (item.visible === false) continue;
    const thickness = Math.max(0, Number(item.thickness) || 0);
    if (!(thickness > 1e-12)) continue;

    for (const patch of item.patches || []) {
      const sourceLow = item.face === 'front' ? patch.z - thickness : patch.z,
        sourceHigh = item.face === 'front' ? patch.z : patch.z + thickness;

      for (const region of model.regions || []) {
        if (!region.stack?.length) continue;
        let geom = intersection(patch.geom, region.geom);
        if (clip && !isEmpty(geom)) geom = intersection(geom, clip);
        if (isEmpty(geom)) continue;

        const currentLow = region.stack[0].z0,
          currentHigh = region.stack.at(-1).z1,
          hostSegments =
            kind === 'electrical'
              ? region.stack.filter((segment) => segment.layerId === patch.layerId)
              : region.stack;

        for (const hostSegment of hostSegments) {
          const z0 = Math.max(sourceLow, hostSegment.z0),
            z1 = Math.min(sourceHigh, hostSegment.z1);
          if (!(z1 > z0 + 1e-12)) continue;

          const currentSurfaceSegment =
              item.face === 'front' ? region.stack.at(-1) : region.stack[0],
            currentSurfaceZ = item.face === 'front' ? currentHigh : currentLow,
            sourceSurfaceZ = Number(patch.z),
            currentCutsAnnotation =
              item.face === 'front'
                ? currentSurfaceZ < sourceSurfaceZ - 1e-9
                : currentSurfaceZ > sourceSurfaceZ + 1e-9,
            currentAppearance =
              item.face === 'front'
                ? currentSurfaceSegment?.frontSurface
                : currentSurfaceSegment?.backSurface,
            outerZ = item.face === 'front' ? z1 : z0,
            innerZ = item.face === 'front' ? z0 : z1,
            surfaceExposed = Math.abs(currentSurfaceZ - outerZ) <= 1e-9;

          fragments.push({
            annotationKind: kind,
            annotationId: item.id,
            ...(kind === 'implant' ? { implantId: item.id } : { electricalRegionId: item.id }),
            name: item.name,
            color: item.color,
            face: item.face,
            thickness,
            depthProfile: item.depthProfile === 'smooth' ? 'smooth' : 'follow',
            tilt: kind === 'implant' ? Number(item.tilt) || 0 : 0,
            ...(kind === 'electrical'
              ? {
                  regionType: item.regionType,
                  source: item.source,
                  hostLayerId: patch.layerId,
                }
              : {}),
            sourceZ: sourceSurfaceZ,
            outerZ,
            innerZ,
            surfaceExposed,
            z0,
            z1,
            surfaceAppearance:
              (currentCutsAnnotation ? currentAppearance : patch.surfaceAppearance) || null,
            polys: geom,
          });
        }
      }
    }
  }
  return fragments;
}

function annotationSurfaceGroups(fragments) {
  return fragments.map((fragment) => ({
    ...fragment,
    z: fragment.outerZ,
  }));
}

function annotationSolids(fragments) {
  return fragments.map((fragment) => ({
    ...fragment,
    slabs: [{ z0: fragment.z0, z1: fragment.z1, polys: fragment.polys }],
    caps: [
      { z: fragment.z0, normal: -1, polys: fragment.polys },
      { z: fragment.z1, normal: 1, polys: fragment.polys },
    ],
  }));
}

function annotationSectionBands(fragments, a, b) {
  const bands = [];
  for (const fragment of fragments) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, fragment.polys)) {
      bands.push({ ...fragment, t0, t1 });
    }
  }
  return bands;
}

function implantFragments(model, clip = null) {
  return annotationVolumeFragments(model?.implants, model, clip, 'implant');
}

function electricalRegionFragments(model, clip = null) {
  return annotationVolumeFragments(model?.electricalRegions, model, clip, 'electrical');
}

export function implantSurfaceGroups(model, clip = null) {
  return annotationSurfaceGroups(implantFragments(model, clip));
}

export function implantSolids(model, clip = null) {
  return annotationSolids(implantFragments(model, clip));
}

export function implantSectionBands(model, a, b) {
  return annotationSectionBands(implantFragments(model), a, b);
}

export function electricalRegionSurfaceGroups(model, clip = null) {
  return annotationSurfaceGroups(electricalRegionFragments(model, clip));
}

export function electricalRegionSolids(model, clip = null) {
  return annotationSolids(electricalRegionFragments(model, clip));
}

export function electricalRegionSectionBands(model, a, b) {
  return annotationSectionBands(electricalRegionFragments(model), a, b);
}

