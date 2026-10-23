// Display-only continuous Section annotations. The canonical source bands are
// intersected with the same analytic-owner-derived material contours that
// Section paints. A predecessor 2.5D slab is NEVER treated as released solid.
import { validateContinuousEtchModel } from './continuous-etch-model.js';
import {
  electricalRegionSectionBands,
  implantSectionBands,
  sectionContours,
} from './model-view-geometry.js';
import { intersection } from './vector-geometry.js';

function bandFootprint(band, kind, sectionXComponent, sectionLength) {
  const outer = Number(band.outerZ);
  const inner = Number(band.innerZ);
  const t0 = Number(band.t0);
  const t1 = Number(band.t1);
  if (![outer, inner, t0, t1].every(Number.isFinite) || t1 <= t0 || outer === inner) {
    return [];
  }
  const tilt = kind === 'implant' ? Math.tan(((Number(band.tilt) || 0) * Math.PI) / 180) : 0;
  const face = band.face === 'back' ? -1 : 1;
  const source = Number(band.sourceZ);
  const displacement = (z) =>
    tilt && Number.isFinite(source)
      ? (tilt * Math.max(0, face * (source - z)) * sectionXComponent) / sectionLength
      : 0;
  const dOuter = displacement(outer);
  const dInner = displacement(inner);
  return [
    [
      [t0 + dOuter, outer],
      [t1 + dOuter, outer],
      [t1 + dInner, inner],
      [t0 + dInner, inner],
      [t0 + dOuter, outer],
    ],
  ];
}

// The caller can pass its already-derived sectionContours to avoid computing
// (and potentially disagreeing with) a second display approximation.
export function continuousSectionAnnotationPolygons(model, a, b, materialContours = null) {
  validateContinuousEtchModel(model);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > 0)) return { electrical: [], implants: [] };
  const contours = materialContours ?? sectionContours(model, a, b);
  const byLayer = new Map(contours.map(({ layerId, polys }) => [layerId, polys]));
  const allMaterial = contours.flatMap(({ polys }) => polys);
  const clip = (bands, kind) =>
    bands.flatMap((band) => {
      // Electrical domains are confined to their registered host material;
      // an Implant may penetrate several distinct surviving host materials.
      const material = kind === 'electrical' ? byLayer.get(band.hostLayerId) || [] : allMaterial;
      if (!material.length) return [];
      const shape = bandFootprint(band, kind, b[0] - a[0], length);
      if (!shape.length) return [];
      const polys = intersection([shape], material);
      return polys.length ? [{ ...band, polys }] : [];
    });
  return {
    electrical: clip(electricalRegionSectionBands(model, a, b), 'electrical'),
    implants: clip(implantSectionBands(model, a, b), 'implant'),
  };
}
