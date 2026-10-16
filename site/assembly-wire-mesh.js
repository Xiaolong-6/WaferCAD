/**
 * Renderer/exporter adapter for explicit 3D Au packaging wires.
 * The nominal diameter, bond-foot radius and control points are inferred.
 * End spheres seal the visible open tube ends and intersect the metal-pad
 * surfaces. This visual construction is not a watertight Boolean union or
 * proof of a metallurgical/electrical bond.
 */
export function assemblyWireCurve(THREE, wire) {
  return new THREE.CubicBezierCurve3(
    ...wire.points.map((point) => new THREE.Vector3(...point)),
  );
}

export function createAssemblyWireMeshes(THREE, wire, curve = assemblyWireCurve(THREE, wire)) {
  const radius = wire.diameterUm / 2;
  const material = () =>
    new THREE.MeshStandardMaterial({
      color: '#D8A83A',
      metalness: 0.78,
      roughness: 0.24,
    });
  const parts = [
    {
      kind: 'tube',
      geometry: new THREE.TubeGeometry(curve, 64, radius, 10, false),
    },
    ...[0, 1].map((end) => ({
      kind: 'contact-' + end,
      geometry: new THREE.SphereGeometry(radius * 1.01, 12, 8),
      point: wire.points[end ? 3 : 0],
    })),
  ];
  return parts.map(({ kind, geometry, point }) => {
    const mesh = new THREE.Mesh(geometry, material());
    if (point) mesh.position.set(...point);
    mesh.name = 'Au bond ' + wire.id + ' / ' + kind + ' (inferred)';
    mesh.userData.waferCadAssemblyWireId = wire.id;
    mesh.userData.wafercadAssemblyWireId = wire.id;
    mesh.userData.wafercadAssemblyPart = kind;
    mesh.userData.wafercadMaterial = wire.material;
    mesh.userData.wafercadDiameterUm = wire.diameterUm;
    mesh.userData.wafercadContactLayerIds = wire.contactLayerIds;
    mesh.userData.wafercadSource = wire.source;
    return mesh;
  });
}
