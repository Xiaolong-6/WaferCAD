import {
  difference,
  intersection,
  unionGeometries,
  unionMaterialSweeps,
  isMaterialGridSeam,
  materialRegionCandidates,
  materialGeometryArea,
} from './material-process-boolean.js';
import { bufferMulti } from './vector-geometry.js';
import { robustIntersection } from './polygon-boolean.js';
import { synchronizeMaterialPartition } from './material-process-noding.js';
import { validateProcessModel } from './project-schema.js';
import { unionMaterialTiles } from './material-tile-union.js';

export function materialOwnerCoverage(model) {
  const geometries = model.regions.map((region) => region.geom);
  const shared = unionMaterialTiles(geometries, { gridScale: 10000000 });
  if (shared) return shared;
  // Validated owners can have tiny nonmatching seam nodes. Use the ordinary
  // polygon union before the integer fallback for dense disjoint partitions.
  const coverage = unionGeometries(geometries);
  const { boundary } = model;
  return difference(boundary, coverage).length || difference(coverage, boundary).length
    ? coverage
    : boundary;
}

function hasNumericalOwnerOverlap(regions, error, numerical) {
  const pair =
    /^Invalid project: model\.regions\[(\d+)\]\.geom overlaps model\.regions\[(\d+)\]\.geom\.$/.exec(
      error.message,
    );
  if (!pair) return false;
  const left = regions[Number(pair[1])].geom;
  const right = regions[Number(pair[2])].geom;
  const snapped = intersection(left, right);
  if (snapped.length) return numerical(snapped);
  // The material Boolean projects to its 1e-7 µm integer lattice. A genuine
  // sub-lattice overlap can disappear there while the independent project
  // validator still detects it. Confirm its original-area seam numerically
  // before allowing the ordinary partition/noding path to attempt a repair.
  // All source coverage and final model checks remain mandatory.
  const unsnapped = robustIntersection(left, right);
  return unsnapped.length > 0 && numerical(unsnapped);
}

export function repairMaterialHaloPartition(model, sourceCoverage) {
  try {
    validateProcessModel(model);
    return false;
  } catch (error) {
    const tolerance = Math.max(2e-8, model.width * model.height * 1e-15);
    const numerical = (geom) => materialGeometryArea(geom) <= tolerance || isMaterialGridSeam(geom);
    if (!hasNumericalOwnerOverlap(model.regions, error, numerical)) throw error;
    model.regions = partitionMaterialProcess(model, sourceCoverage());
    return true;
  }
}

// Same grid-width seam witness and overlap budget as ordinary fixed Direct.
// Integer clipping prevents a floating-point retry from independently rounding
// the two owners and then manufacturing another seam while repairing one.
function partition(model, inputCoverage, api, tolerance, numerical) {
  const regions = synchronizeMaterialPartition(model.regions)
    .map((r) => ({ ...r, geom: unionGeometries([r.geom]) }))
    .filter((r) => r.geom.length);
  regions.sort(
    (a, b) => Math.max(...b.stack.map((s) => s.z1)) - Math.max(...a.stack.map((s) => s.z1)),
  );
  const out = [],
    processed = new Map(),
    query = materialRegionCandidates(regions);
  for (const [index, r] of regions.entries()) {
    let geom = r.geom;
    for (const previousIndex of query(geom)) {
      if (previousIndex >= index) continue;
      const p = processed.get(previousIndex);
      if (!p) continue;
      const overlap = intersection(geom, p.geom);
      if (!overlap.length) continue;
      if (overlap.length && !numerical(overlap))
        throw Error('Material Direct produced a non-grid-width owner overlap.');
      geom = difference(geom, p.geom);
      if (!geom.length) break;
    }
    if (geom.length) {
      const result = { ...r, geom };
      out.push(result);
      processed.set(index, result);
    }
  }
  const uncovered = () => {
    let missing = inputCoverage;
    for (const r of out) {
      missing = difference(missing, r.geom);
      if (!missing.length) break;
    }
    return missing;
  };
  let missing = uncovered();
  for (const r of out) {
    const extra = difference(r.geom, inputCoverage);
    if (extra.length && !numerical(extra))
      throw Error('Material Direct grew unsupported XY columns.');
  }
  if (missing.length) {
    if (!numerical(missing)) throw Error('Material Direct lost non-grid-width material support.');
    for (const poly of missing) {
      const halo = bufferMulti([poly], 0.0004, 12);
      let owner = null,
        best = 0;
      for (const r of out) {
        const contact = api.geometryArea(intersection(r.geom, halo));
        if (contact > best) {
          best = contact;
          owner = r;
        }
      }
      if (!owner) throw Error('Material Direct cannot assign a grid seam.');
      owner.geom = unionMaterialSweeps([owner.geom, [poly]]);
    }
    missing = uncovered();
  }
  return { owners: out, missing };
}

export function partitionMaterialProcess(
  model,
  inputCoverage,
  api = { geometryArea: materialGeometryArea },
) {
  const tolerance = Math.max(2e-8, model.width * model.height * 1e-15);
  function reconcile(input, areaApi, allowSupportRepair, allowOverlapRepair) {
    const numerical = (geom) => areaApi.geometryArea(geom) <= tolerance || isMaterialGridSeam(geom);
    const { owners, missing } = partition(input, inputCoverage, areaApi, tolerance, numerical);
    if (missing.length && areaApi.geometryArea(missing) > tolerance) {
      // Re-node a witnessed seam before discarding zero-area boundary traces.
      // Translation-stable area keeps narrow rings and contact ranking intact.
      if (allowSupportRepair && numerical(missing))
        return reconcile(
          { ...input, regions: owners },
          { geometryArea: materialGeometryArea },
          false,
          allowOverlapRepair,
        );
      throw Error('Material Direct support repair did not converge.');
    }
    const regions = owners
      .map((r) => ({
        ...r,
        geom: r.geom
          .filter((p) => areaApi.geometryArea([[p[0]]]) > 0)
          .map((p) => [p[0], ...p.slice(1).filter((h) => areaApi.geometryArea([[h]]) > 0)]),
      }))
      .filter((r) => r.geom.length);
    const candidate = { ...input, regions };
    try {
      validateProcessModel(candidate);
    } catch (error) {
      if (!allowOverlapRepair || !hasNumericalOwnerOverlap(regions, error, numerical)) throw error;
      // Rounded seam unions can leave a numerical overlap along an adjacent
      // diagonal. Repeat with the same coverage and strict geometry checks.
      return reconcile(candidate, areaApi, false, false);
    }
    return regions;
  }
  return reconcile(model, api, true, true);
}
