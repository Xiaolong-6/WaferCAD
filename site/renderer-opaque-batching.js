// Presentation-only WebGL draw-call batching for adjacent opaque smooth meshes.
// No topology, Boolean, export or physical model data is modified.
// Adjacent runs preserve cross-material painter ordering and Z Break semantics.
const SAME = (a, b) => Object.is(a, b);

function eligible(mesh) {
  if (!mesh?.isMesh || mesh.isInstancedMesh || mesh.children?.length) return false;
  const material = mesh.material;
  const geometry = mesh.geometry;
  const z = mesh.userData?.waferCadZDisplay;
  const kind = mesh.userData?.waferCadPresentation?.kind;
  if (
    !mesh.visible ||
    kind !== 'material-exterior' ||
    !material ||
    Array.isArray(material) ||
    material.transparent ||
    !material.depthWrite ||
    !material.depthTest ||
    mesh.renderOrder !== 0 ||
    geometry?.index ||
    geometry?.groups?.length ||
    geometry?.userData?.roughGpuDisplacement ||
    mesh.userData?.surfaceAppearance ||
    !z ||
    !['canonical', 'mapped', 'translated'].includes(z.mode)
  ) {
    return false;
  }
  const attributes = geometry.attributes || {};
  const position = attributes.position;
  const normal = attributes.normal;
  if (
    Object.keys(attributes).length !== 2 ||
    !position ||
    !normal ||
    position.itemSize !== 3 ||
    normal.itemSize !== 3 ||
    position.count !== normal.count ||
    position.count < 3 ||
    !Number.isFinite(position.count) ||
    (z.canonicalZ && z.canonicalZ.length !== position.count) ||
    !(position.array instanceof Float32Array) ||
    !(normal.array instanceof Float32Array) ||
    position.isInterleavedBufferAttribute ||
    normal.isInterleavedBufferAttribute ||
    position.normalized ||
    normal.normalized ||
    mesh.position.x !== 0 ||
    mesh.position.y !== 0 ||
    mesh.scale.x !== 1 ||
    mesh.scale.y !== 1 ||
    mesh.scale.z !== 1 ||
    mesh.quaternion.x !== 0 ||
    mesh.quaternion.y !== 0 ||
    mesh.quaternion.z !== 0 ||
    mesh.quaternion.w !== 1
  ) {
    return false;
  }
  return true;
}

function compatible(first, second) {
  if (!eligible(second)) return false;
  const a = first.userData.waferCadZDisplay;
  const b = second.userData.waferCadZDisplay;
  const firstPresentation = first.userData.waferCadPresentation;
  const secondPresentation = second.userData.waferCadPresentation;
  return (
    first.material === second.material &&
    SAME(a.minZ, b.minZ) &&
    SAME(a.maxZ, b.maxZ) &&
    a.mode === b.mode &&
    Boolean(a.canonicalZ) === Boolean(b.canonicalZ) &&
    SAME(first.position.z, second.position.z) &&
    SAME(firstPresentation.sortBias || 0, secondPresentation.sortBias || 0) &&
    Boolean(firstPresentation.planarCap) === Boolean(secondPresentation.planarCap) &&
    first.geometry.getAttribute('position').usage === second.geometry.getAttribute('position').usage
  );
}

function mergeRun(THREE, group, meshes, onReplace) {
  const count = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const firstZ = meshes[0].userData.waferCadZDisplay;
  const canonical = firstZ.canonicalZ ? new Float32Array(count) : null;
  let offset = 0;
  for (const mesh of meshes) {
    const attr = mesh.geometry.getAttribute('position');
    const n = attr.count;
    position.set(attr.array, offset * 3);
    normal.set(mesh.geometry.getAttribute('normal').array, offset * 3);
    if (canonical) canonical.set(mesh.userData.waferCadZDisplay.canonicalZ, offset);
    offset += n;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  const material = meshes[0].material;
  const merged = new THREE.Mesh(geometry, material);
  merged.name = `WaferCAD opaque batch (${meshes.length})`;
  merged.position.z = meshes[0].position.z;
  merged.renderOrder = meshes[0].renderOrder;
  merged.userData.waferCadPresentation = { ...meshes[0].userData.waferCadPresentation };
  merged.userData.waferCadZDisplay = {
    minZ: firstZ.minZ,
    maxZ: firstZ.maxZ,
    mode: firstZ.mode,
    canonicalZ: canonical,
  };

  // Preserve run placement in group.children rather than moving all merged
  // material to the end. Retain resource ownership in the active variant only.
  const insertion = group.children.indexOf(meshes[0]);
  for (const mesh of meshes) {
    group.remove(mesh);
    onReplace?.(mesh, null);
    mesh.geometry.dispose();
  }
  group.add(merged);
  group.children.splice(group.children.indexOf(merged), 1);
  group.children.splice(insertion, 0, merged);
  onReplace?.(null, merged);
}

export async function batchOpaqueExteriorMeshes(
  THREE,
  group,
  { onReplace = () => {}, onYield = async () => {}, maxVertices = 9216 } = {},
) {
  const verticesPerBatch = Math.max(3, Math.floor(maxVertices));
  const originals = [...(group?.children || [])];
  let run = [];
  let vertices = 0;
  let batches = 0;
  let removed = 0;
  const flush = async () => {
    if (run.length >= 2) {
      mergeRun(THREE, group, run, onReplace);
      batches++;
      removed += run.length - 1;
      await onYield();
    }
    run = [];
    vertices = 0;
  };
  for (const mesh of originals) {
    const count = mesh?.geometry?.getAttribute?.('position')?.count || 0;
    if (!eligible(mesh) || count > verticesPerBatch) {
      await flush();
      continue;
    }
    if (run.length && (!compatible(run[0], mesh) || vertices + count > verticesPerBatch)) {
      await flush();
    }
    run.push(mesh);
    vertices += count;
  }
  await flush();
  return { batches, removed, drawCallsSaved: removed };
}
