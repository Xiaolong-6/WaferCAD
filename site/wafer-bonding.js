// Experimental, geometry-only multi-wafer direct-bond kernel.
// Deliberately separate from Process/Recipe until assembly provenance, replay,
// storage schema and UI have independent acceptance contracts.
import {
  difference,
  intersection,
  isEmpty,
  multiBounds,
  transformMulti,
  unionGeometries,
} from './vector-geometry.js';
import { validateProcessModel } from './project-schema.js';

const Z_TOLERANCE_UM = 1e-9;
const MAX_BOND_REGIONS = 20000;

function requireFace(value, name) {
  if (value !== 'front' && value !== 'back') {
    throw new Error(`Bond ${name} must be front or back.`);
  }
  return value;
}

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Bond ${name} must be a finite number in physical units.`);
  }
  return value;
}

function assertSupported(model, name) {
  if (model?.kernel !== 'vector-2.5d-v1') {
    throw new Error(
      `Bond ${name} must be a resolved vector-2.5d-v1 model (array inputs are not yet supported).`,
    );
  }
  if (model?.units?.xy !== 'µm' || model?.units?.z !== 'µm') {
    throw new Error(`Bond ${name} must use canonical physical µm coordinates.`);
  }
  if (model?.implants?.length || model?.electricalRegions?.length) {
    throw new Error(
      `Bond ${name} contains annotations; remapping of physical Implant/Electrical Regions is not yet supported.`,
    );
  }
  validateProcessModel(model);
}

function materialExtremum(model, face) {
  let z = face === 'front' ? -Infinity : Infinity;
  for (const region of model.regions) {
    for (const segment of region.stack) {
      z = face === 'front' ? Math.max(z, segment.z1) : Math.min(z, segment.z0);
    }
  }
  if (!Number.isFinite(z)) throw new Error('Bond requires both wafers to contain material.');
  return z;
}

function contactFootprint(model, face, plane) {
  const touching = [];
  for (const region of model.regions) {
    const surface = face === 'front' ? region.stack.at(-1)?.z1 : region.stack[0]?.z0;
    if (surface !== undefined && Math.abs(surface - plane) <= Z_TOLERANCE_UM) {
      touching.push(region.geom);
    }
  }
  return unionGeometries(touching);
}

function polygonArea(geometry) {
  let area = 0;
  for (const polygon of geometry) {
    for (let i = 0; i < polygon.length; i++) {
      const ring = polygon[i];
      let doubled = 0;
      for (let j = 0; j + 1 < ring.length; j++) {
        doubled += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
      }
      area += (i === 0 ? 1 : -1) * Math.abs(doubled / 2);
    }
  }
  if (!Number.isFinite(area)) throw new Error('Bond contact geometry has an invalid area.');
  return area;
}

function mergeStacks(left, right) {
  const segments = [...left, ...right]
    .map((segment) => structuredClone(segment))
    .sort((a, b) => a.z0 - b.z0 || a.z1 - b.z1);
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].z0 < segments[i - 1].z1 - Z_TOLERANCE_UM) {
      throw new Error('Bond rejected: receiver and donor solids overlap in physical XYZ.');
    }
  }
  return segments;
}

function mappedSegment(source, flipZ, zShift, layerIds) {
  const segment = structuredClone(source);
  segment.layerId = layerIds.get(source.layerId);
  if (!segment.layerId) throw new Error('Bond donor segment references an unknown layer.');
  if (flipZ) {
    segment.z0 = zShift - source.z1;
    segment.z1 = zShift - source.z0;
    delete segment.frontSurface;
    delete segment.backSurface;
    if (source.backSurface) segment.frontSurface = structuredClone(source.backSurface);
    if (source.frontSurface) segment.backSurface = structuredClone(source.frontSurface);
  } else {
    segment.z0 = source.z0 + zShift;
    segment.z1 = source.z1 + zShift;
  }
  return segment;
}

function preparedDonor(receiver, donor, options, zShift, flipZ) {
  const cos = Math.cos((options.rotationDeg * Math.PI) / 180);
  const sin = Math.sin((options.rotationDeg * Math.PI) / 180);
  const c = Math.abs(cos) < 1e-14 ? 0 : cos;
  const s = Math.abs(sin) < 1e-14 ? 0 : sin;
  const xy = ([px, py]) => {
    const x = flipZ && options.flipAxis === 'x' ? -px : px;
    const y = flipZ && options.flipAxis === 'y' ? -py : py;
    return [x * c - y * s + options.dx, x * s + y * c + options.dy];
  };

  const layerIds = new Map();
  const layers = donor.layers.map((layer) => {
    const id = `layer-${receiver.nextLayerId++}`;
    layerIds.set(layer.id, id);
    return {
      ...structuredClone(layer),
      id,
      sourceWaferLayerId: layer.id,
      sourceWaferId: options.donorId,
    };
  });
  for (const layer of layers) {
    if (layer.pairedLayerId) layer.pairedLayerId = layerIds.get(layer.pairedLayerId);
    if (layer.processGroupId) {
      layer.processGroupId = `bond-${options.donorId}-${layer.processGroupId}`;
    }
    if (flipZ && (layer.processFace === 'front' || layer.processFace === 'back')) {
      layer.processFace = layer.processFace === 'front' ? 'back' : 'front';
    }
  }
  return {
    boundary: transformMulti(donor.boundary, xy),
    layers,
    regions: donor.regions.map((region) => ({
      geom: transformMulti(region.geom, xy),
      stack: region.stack.map((segment) => mappedSegment(segment, flipZ, zShift, layerIds)),
    })),
    layerIds,
  };
}

/**
 * Return a new native 2.5D material model and explicit zero-thickness interface.
 *
 * No input mutation, synthetic material, chemistry, pressure/temperature model,
 * historical commit, or file-format migration occurs here. Only direct contact
 * is permitted in this first phase. Bonding always maps the donor's requested
 * face onto the receiver's outermost physical material plane; any unbonded
 * recessed areas remain genuine voids.
 */
export function bondWaferModels(receiver, donor, request = {}) {
  const options = {
    receiverFace: requireFace(request.receiverFace ?? 'front', 'receiverFace'),
    donorFace: requireFace(request.donorFace ?? 'front', 'donorFace'),
    dx: requireFinite(request.dx ?? 0, 'dx'),
    dy: requireFinite(request.dy ?? 0, 'dy'),
    rotationDeg: requireFinite(request.rotationDeg ?? 0, 'rotationDeg'),
    flipAxis: request.flipAxis ?? 'x',
    donorId: request.donorId ?? 'donor',
  };
  if (!['x', 'y'].includes(options.flipAxis)) {
    throw new Error('Bond flipAxis must be x or y.');
  }
  if (
    typeof options.donorId !== 'string' ||
    !options.donorId.trim() ||
    options.donorId.length > 64
  ) {
    throw new Error('Bond donorId must be a nonempty identifier (maximum 64 characters).');
  }
  if (request.method != null && request.method !== 'direct') {
    throw new Error(
      'Bond prototype supports only direct contact without an intermediate material.',
    );
  }
  if (request.gapUm != null && requireFinite(request.gapUm, 'gapUm') !== 0) {
    throw new Error(
      'Bond direct contact requires zero gap; an adhesive spacer must be modeled explicitly.',
    );
  }
  assertSupported(receiver, 'receiver');
  assertSupported(donor, 'donor');
  // A donor is currently one independently processed wafer. If a previously
  // assembled structure were imported here its earlier source IDs would be
  // overwritten. Reject that case until nested Assembly lineage is supported.
  if (donor.layers.some((layer) => layer.sourceWaferId != null)) {
    throw new Error('Bond donor is already assembled; nested donor lineage is unsupported.');
  }
  if (receiver.layers.some((layer) => layer.sourceWaferId === options.donorId)) {
    throw new Error('Bond donorId already exists in the receiver Assembly.');
  }

  const receiverPlane = materialExtremum(receiver, options.receiverFace);
  const donorPlane = materialExtremum(donor, options.donorFace);
  const flipZ = options.receiverFace === options.donorFace;
  const zSign = flipZ ? -1 : 1;
  const zShift = receiverPlane - zSign * donorPlane;
  const candidate = structuredClone(receiver);
  const transformed = preparedDonor(candidate, donor, options, zShift, flipZ);

  const receiverContact = contactFootprint(receiver, options.receiverFace, receiverPlane);
  const donorContact = unionGeometries(
    transformed.regions
      .filter((region) => {
        const z = options.receiverFace === 'front' ? region.stack[0]?.z0 : region.stack.at(-1)?.z1;
        return z !== undefined && Math.abs(z - receiverPlane) <= Z_TOLERANCE_UM;
      })
      .map((region) => region.geom),
  );
  const contact = intersection(receiverContact, donorContact);
  const contactAreaUm2 = polygonArea(contact);
  if (isEmpty(contact) || !(contactAreaUm2 > 0)) {
    throw new Error(
      'Bond rejected: no finite-area physical contact exists at the selected interface.',
    );
  }

  candidate.layers.push(...transformed.layers);
  let parts = candidate.regions.map((region) => structuredClone(region));
  function append(geom, stack, existingId = null) {
    if (isEmpty(geom)) return null;
    return {
      id: existingId ?? `region-${candidate.nextRegionId++}`,
      geom,
      stack,
    };
  }
  for (const donorRegion of transformed.regions) {
    const next = [];
    let remaining = donorRegion.geom;
    for (const part of parts) {
      const shared = intersection(part.geom, donorRegion.geom);
      if (isEmpty(shared)) {
        next.push(part);
        continue;
      }
      const originalOnly = difference(part.geom, donorRegion.geom);
      const existing = append(originalOnly, part.stack, part.id);
      if (existing) next.push(existing);
      next.push(append(shared, mergeStacks(part.stack, donorRegion.stack)));
      if (!isEmpty(remaining)) remaining = difference(remaining, part.geom);
    }
    const donorOnly = append(remaining, donorRegion.stack);
    if (donorOnly) next.push(donorOnly);
    if (next.length > MAX_BOND_REGIONS) {
      throw new Error('Bond exceeds prototype region-partition budget.');
    }
    parts = next;
  }

  candidate.regions = parts;
  candidate.boundary = unionGeometries([receiver.boundary, transformed.boundary]);
  const bounds = multiBounds(candidate.boundary);
  candidate.width = bounds.maxX - bounds.minX;
  candidate.height = bounds.maxY - bounds.minY;
  candidate.shape = 'rect';
  candidate.revision = (receiver.revision || 0) + 1;
  candidate.processRevision = (receiver.processRevision || 0) + 1;
  validateProcessModel(candidate);

  return {
    model: candidate,
    interface: {
      method: 'direct',
      receiverFace: options.receiverFace,
      donorFace: options.donorFace,
      donorId: options.donorId,
      flipAxis: options.flipAxis,
      flipped: flipZ,
      dx: options.dx,
      dy: options.dy,
      rotationDeg: options.rotationDeg,
      z: receiverPlane,
      contactGeometry: contact,
      contactAreaUm2,
      receiverExposedAreaUm2: polygonArea(receiverContact),
      donorExposedAreaUm2: polygonArea(donorContact),
      contactFractionReceiver: contactAreaUm2 / polygonArea(receiverContact),
      contactFractionDonor: contactAreaUm2 / polygonArea(donorContact),
      contactIslands: contact.length,
    },
    donorLayerIds: Object.fromEntries(transformed.layerIds),
  };
}
