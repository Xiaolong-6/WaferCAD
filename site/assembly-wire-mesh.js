/**
 * Renderer/exporter adapter for explicit 3D Au packaging wires.
 * The nominal diameter, bond-foot radius and control points are inferred.
 * Tangent-oriented end disks close the visible tube surfaces without
 * inventing ball-bond volumes inside the semiconductor. This construction
 * is not a welded Boolean union or proof of a metallurgical/electrical bond.
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
    ...[0, 1].map((end) => {
      const normal = curve.getTangent(end).clone();
      if (end === 0) normal.negate();
      const geometry = new THREE.CircleGeometry(radius, 10);
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
      );
      // Bake contact XYZ into vertices because Z-break rewrites position.z.
      geometry.translate(...wire.points[end ? 3 : 0]);
      return { kind: 'contact-' + end, geometry };
    }),
  ];
  return parts.map(({ kind, geometry }) => {
    const mesh = new THREE.Mesh(geometry, material());
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
