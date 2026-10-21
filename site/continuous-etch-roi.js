// ROI is view-only: crop displayed continuous surfaces without changing their
// analytic material owner. Plane clipping currently supports exact XY rectangles.
export function continuousRectRoiBounds(clip) {
  if (clip == null) return null;
  if (!Array.isArray(clip) || clip.length !== 1 || clip[0]?.length !== 1)
    throw new RangeError('Continuous Etch 3D currently supports a single rectangular ROI');
  const ring = clip[0][0];
  if (!Array.isArray(ring) || ring.length !== 5)
    throw new RangeError('Continuous Etch 3D currently supports a rectangular ROI');
  const points = ring.map((point) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
      throw new RangeError('Invalid Continuous Etch ROI vertex');
    return point;
  });
  const x = points.map((p) => p[0]);
  const y = points.map((p) => p[1]);
  const minX = Math.min(...x),
    maxX = Math.max(...x);
  const minY = Math.min(...y),
    maxY = Math.max(...y);
  const tolerance = Math.max(maxX - minX, maxY - minY, 1) * 1e-9;
  const near = (a, b) => Math.abs(a - b) <= tolerance;
  if (
    !(maxX - minX > tolerance && maxY - minY > tolerance) ||
    !near(points[0][0], points[4][0]) ||
    !near(points[0][1], points[4][1]) ||
    !points
      .slice(0, 4)
      .every(([px, py]) => (near(px, minX) || near(px, maxX)) && (near(py, minY) || near(py, maxY)))
  )
    throw new RangeError('Continuous Etch 3D requires an axis-aligned rectangular ROI');
  const corners = new Set(
    points.slice(0, 4).map(([px, py]) => `${near(px, minX) ? 0 : 1}:${near(py, minY) ? 0 : 1}`),
  );
  if (corners.size !== 4)
    throw new RangeError('Continuous Etch ROI must have four distinct corners');
  return { minX, minY, maxX, maxY };
}

export function continuousRectRoiPlanes(THREE, clip) {
  const bounds = continuousRectRoiBounds(clip);
  if (!bounds) return [];
  const { minX, minY, maxX, maxY } = bounds;
  // Three.js discards where dot(position, normal) > plane.constant.
  // Each half-space keeps material inside the physical XY rectangle.
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), -minX),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), maxX),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), -minY),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), maxY),
  ];
}
