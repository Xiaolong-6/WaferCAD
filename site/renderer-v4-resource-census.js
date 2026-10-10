// R3: observe retained WebGL scene-object resource ownership without
// allocating, disposing or changing render data. Report typed-array byte
// *estimates*, NOT driver/GPU memory consumption.
const validObject = (value) => value !== null && typeof value === 'object';
const safeBytes = (array) =>
  Number.isFinite(array?.byteLength) && array.byteLength >= 0 ? array.byteLength : 0;

export function censusV4SceneResources(groups, { maxObjects = 20000 } = {}) {
  const output = {
    mode: 'observe-only',
    valid: false,
    reason: 'invalid-input',
    groupCount: 0,
    meshCount: 0,
    instancedMeshCount: 0,
    geometryCount: 0,
    materialCount: 0,
    bufferCount: 0,
    estimatedBufferBytes: 0,
    sharedGeometries: 0,
    sharedMaterials: 0,
    crossGroupGeometries: 0,
    crossGroupMaterials: 0,
    objectOverflow: 0,
    complete: false,
  };
  if (
    !Array.isArray(groups) ||
    !Number.isInteger(maxObjects) ||
    maxObjects < 1 ||
    maxObjects > 100000 ||
    !groups.every((group) => validObject(group) && Array.isArray(group.children))
  )
    return output;

  output.valid = true;
  output.reason = 'measured';
  output.groupCount = groups.length;
  const geometryOwners = new Map();
  const materialOwners = new Map();
  const countedArrays = new Set();
  const countBuffer = (attribute) => {
    const array = attribute?.array || attribute?.data?.array;
    if (!validObject(array) || countedArrays.has(array)) return;
    countedArrays.add(array);
    output.bufferCount++;
    output.estimatedBufferBytes += safeBytes(array);
  };
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    for (const object of groups[groupIndex].children) {
      if (output.meshCount >= maxObjects) {
        output.complete = false;
        output.reason = 'object-budget-overflow';
        output.objectOverflow++;
        continue;
      }
      if (!object?.geometry || !object?.material) continue;
      output.meshCount++;
      if (object.isInstancedMesh) output.instancedMeshCount++;
      const geometry = object.geometry;
      if (!geometryOwners.has(geometry)) geometryOwners.set(geometry, []);
      geometryOwners.get(geometry).push(groupIndex);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!validObject(material)) continue;
        if (!materialOwners.has(material)) materialOwners.set(material, []);
        materialOwners.get(material).push(groupIndex);
      }
      countBuffer(object.instanceMatrix);
      countBuffer(object.instanceColor);
    }
  }
  for (const geometry of geometryOwners.keys()) {
    countBuffer(geometry.index);
    for (const attribute of Object.values(geometry.attributes || {})) countBuffer(attribute);
    // Morphology/GLB metadata is intentionally excluded from GPU byte estimates.
  }
  output.geometryCount = geometryOwners.size;
  output.materialCount = materialOwners.size;
  output.sharedGeometries = [...geometryOwners.values()].filter(
    (owners) => owners.length > 1,
  ).length;
  output.sharedMaterials = [...materialOwners.values()].filter(
    (owners) => owners.length > 1,
  ).length;
  output.crossGroupGeometries = [...geometryOwners.values()].filter(
    (owners) => new Set(owners).size > 1,
  ).length;
  output.crossGroupMaterials = [...materialOwners.values()].filter(
    (owners) => new Set(owners).size > 1,
  ).length;
  output.complete = output.objectOverflow === 0;
  // A shared resource across scene-variant groups cannot be disposed with
  // either group independently. R3 does not change existing ownership rules.
  return output;
}
