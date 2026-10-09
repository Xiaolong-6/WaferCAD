import { isArrayModel } from './model-array.js';
import { geometryArea } from './model.js';
import { intersection, isEmpty, multiBounds } from './vector-geometry.js';

const Z_EPSILON = 1e-9;
const XY_AREA_EPSILON = 1e-8;
const PAIR_LIMIT = 2500;
const MAX_FINDINGS = 40;

function boundsOverlap(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

function sampleBox(geom, dx = 0, dy = 0) {
  const box = multiBounds(geom);
  if (!Number.isFinite(box.minX)) return null;
  return {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
  };
}

function addFinding(state, finding, copies = 1) {
  const key = JSON.stringify([
    finding.code,
    finding.layerId || '',
    finding.relatedLayerId || '',
    finding.z0,
    finding.z1,
  ]);
  const existing = state.findingKeys.get(key);
  if (existing) {
    existing.occurrences += copies;
    return;
  }
  state.findingsTotal += 1;
  if (state.findings.length >= MAX_FINDINGS) {
    state.omittedFindings += 1;
    return;
  }
  const next = { ...finding, occurrences: copies };
  state.findingKeys.set(key, next);
  state.findings.push(next);
}

function addLayerMeasurement(state, id, thickness, volume, count) {
  let item = state.layerTotals.get(id);
  if (!item) {
    item = {
      layerId: id,
      name: state.layerNames.get(id) || id,
      volumeUm3: 0,
      minThicknessUm: Infinity,
      maxThicknessUm: -Infinity,
      segments: 0,
    };
    state.layerTotals.set(id, item);
  }
  item.volumeUm3 += volume;
  item.segments += count;
  item.minThicknessUm = Math.min(item.minThicknessUm, thickness);
  item.maxThicknessUm = Math.max(item.maxThicknessUm, thickness);
}

function analyzePart(state, model, copies = 1, dx = 0, dy = 0) {
  const regions = (model.regions || []).filter((r) => !isEmpty(r.geom));
  const boxes = regions.map((r) => sampleBox(r.geom));
  state.regionCount += regions.length * copies;
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const box = boxes[i] && {
      minX: boxes[i].minX + dx,
      minY: boxes[i].minY + dy,
      maxX: boxes[i].maxX + dx,
      maxY: boxes[i].maxY + dy,
    };
    const area = geometryArea(region.geom);
    const stack = region.stack || [];
    let previous = null;
    for (const segment of stack) {
      const { z0, z1, layerId } = segment;
      if (!Number.isFinite(z0) || !Number.isFinite(z1) || z1 <= z0) {
        addFinding(state, {
          code: 'invalid-z-interval',
          severity: 'error',
          title: 'Invalid material Z interval',
          detail: `Region ${region.id} has a nonpositive or nonfinite material interval.`,
          layerId,
          z0,
          z1,
          box,
        }, copies);
        previous = null;
        continue;
      }
      if (!state.layerNames.has(layerId)) {
        addFinding(state, {
          code: 'unknown-layer',
          severity: 'error',
          title: 'Material references a missing layer',
          detail: `Region ${region.id} references layer ${layerId}.`,
          layerId,
          z0,
          z1,
          box,
        }, copies);
      }
      if (previous && z0 < previous.z1 - Z_EPSILON) {
        addFinding(state, {
          code: 'z-overlap',
          severity: 'error',
          title: 'Material intervals overlap in Z',
          detail: `Region ${region.id}: ${previous.layerId} and ${layerId} claim the same Z interval.`,
          layerId,
          relatedLayerId: previous.layerId,
          z0,
          z1: Math.min(z1, previous.z1),
          box,
        }, copies);
      } else if (previous && z0 > previous.z1 + Z_EPSILON) {
        state.gapCount += copies;
        state.gapVolumeUm3 += area * (z0 - previous.z1) * copies;
        addFinding(state, {
          code: 'z-gap',
          severity: 'info',
          title: 'Separated material intervals (possible cavity)',
          detail: 'An empty Z interval exists between two solids. Released cavities and air gaps are intentional in many devices.',
          layerId,
          relatedLayerId: previous.layerId,
          z0: previous.z1,
          z1: z0,
          box,
        }, copies);
      }
      addLayerMeasurement(state, layerId, z1 - z0, area * (z1 - z0) * copies, copies);
      if (segment.frontSurface || segment.backSurface) state.appearanceSegments += copies;
      previous = segment;
    }
  }

  // Bounding-box filtering avoids expensive polygon booleans for disjoint regions.
  // An explicit budget makes an incomplete overlap scan visible to the user.
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      if (!boundsOverlap(boxes[i], boxes[j])) continue;
      if (state.pairsExamined >= PAIR_LIMIT) {
        state.overlapComplete = false;
        return;
      }
      state.pairsExamined += 1;
      try {
        const overlap = intersection(regions[i].geom, regions[j].geom);
        if (isEmpty(overlap) || geometryArea(overlap) <= XY_AREA_EPSILON) continue;
        addFinding(state, {
          code: 'xy-overlap',
          severity: 'error',
          title: 'Overlapping XY material owners',
          detail: `Regions ${regions[i].id} and ${regions[j].id} claim overlapping XY area. Canonical regions must be non-overlapping.`,
          box: sampleBox(overlap, dx, dy),
          overlapAreaUm2: geometryArea(overlap),
        }, copies);
      } catch (error) {
        state.overlapComplete = false;
        addFinding(state, {
          code: 'overlap-check-failed',
          severity: 'warning',
          title: 'XY overlap inspection was incomplete',
          detail: error?.message || 'Polygon intersection failed; no clean overlap claim can be made.',
          box: sampleBox(regions[i].geom, dx, dy),
        }, copies);
      }
    }
  }
}

/**
 * Read-only canonical geometry diagnostics. It does not infer fabrication
 * defects from legal voids or render-only morphology.
 *
 * Array processing is weighted by template instance count, but XY ownership
 * checks are within each template only; inter-instance seams are not scanned.
 */
export function analyzeProcessGeometry(model) {
  const state = {
    layerNames: new Map((model.layers || []).map((l) => [l.id, l.name])),
    layerTotals: new Map(),
    findingKeys: new Map(),
    findings: [],
    findingsTotal: 0,
    omittedFindings: 0,
    regionCount: 0,
    gapCount: 0,
    gapVolumeUm3: 0,
    appearanceSegments: 0,
    pairsExamined: 0,
    overlapComplete: true,
  };
  const array = isArrayModel(model);
  let instanceCount = 1;
  if (array) {
    const templates = new Map(model.array.templates.map((item) => [item.id, item.model]));
    const groups = new Map();
    instanceCount = model.array.instances.length;
    for (const instance of model.array.instances) {
      const current = groups.get(instance.templateId);
      if (current) current.count += 1;
      else groups.set(instance.templateId, { count: 1, x: instance.x, y: instance.y });
    }
    for (const [id, group] of groups) {
      const template = templates.get(id);
      if (!template) {
        addFinding(state, {
          code: 'missing-template',
          severity: 'error',
          title: 'Array instance references a missing template',
          detail: `No geometry template for ${id}.`,
        }, group.count);
        continue;
      }
      analyzePart(state, template, group.count, group.x, group.y);
    }
  } else analyzePart(state, model);

  const layers = [...state.layerTotals.values()].sort((a, b) => b.volumeUm3 - a.volumeUm3);
  const errors = state.findings.filter((item) => item.severity === 'error')
    .reduce((sum, item) => sum + item.occurrences, 0);
  const warnings = state.findings.filter((item) => item.severity === 'warning')
    .reduce((sum, item) => sum + item.occurrences, 0);
  return {
    modelRevision: model.revision,
    processRevision: model.processRevision,
    scope: array ? 'array-templates' : 'full-model',
    instanceCount,
    regions: state.regionCount,
    totalVolumeUm3: layers.reduce((sum, item) => sum + item.volumeUm3, 0),
    layers,
    gapCount: state.gapCount,
    gapVolumeUm3: state.gapVolumeUm3,
    appearanceSegments: state.appearanceSegments,
    checks: {
      zIntervals: true,
      xyOverlapWithinTemplate: state.overlapComplete,
      crossInstanceBoundaries: !array,
      physicalRoughMorphology: false,
    },
    pairsExamined: state.pairsExamined,
    findings: state.findings,
    findingsTotal: state.findingsTotal,
    omittedFindings: state.omittedFindings,
    errors,
    warnings,
  };
}
