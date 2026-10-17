/**
 * Paper-vs-mask scope audit for Hu et al. Nat. Commun. 16, 331 (2025).
 *
 * The paper's 95x100um "MEMS actuator included" footprint and 23x23um
 * local optical SWX dimensions are NOT automatically the bbox of an EBL
 * field containing couplers, contact pads and unsupported perimeter routes.
 * A green CAD Geometry/Recipe gate must never imply those scopes agree.
 */
export const HU2025_PAPER_FOOTPRINT_UM = Object.freeze({
  switchIncludingActuator: Object.freeze({ width: 95, height: 100 }),
  splitCrossing: Object.freeze({ width: 23, height: 23 }),
});

// A measured shape is one polygon with one closed ring. Keep this
// MultiPolygon at four nesting levels for multiBounds(); only the Boolean
// sweep takes an EXTRA outer array of independent input geometries.
const toMulti = (rings) => rings.map((ring) => [[...ring, ring[0]]]);

const containsBounds = (outer, inner) =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minY >= outer.minY &&
  inner.maxY <= outer.maxY;

function centeredWindow(bounds, reported) {
  const x = (bounds.minX + bounds.maxX) / 2;
  const y = (bounds.minY + bounds.maxY) / 2;
  return {
    minX: x - reported.width / 2,
    maxX: x + reported.width / 2,
    minY: y - reported.height / 2,
    maxY: y + reported.height / 2,
    width: reported.width,
    height: reported.height,
  };
}

export function auditSwxPaperEnvelope(vectorApi, source) {
  const pose = source.physicalGroups.semV2;
  if (!pose) throw new Error('Paper envelope audit requires actual SEM-v2 device geometry');
  const silicon = vectorApi.unionGeometries(
    toMulti(source.maskPolygons.get(1)).map((polygon) => [polygon]),
  );
  const allSiliconMaskBoundsUm = vectorApi.multiBounds(silicon);
  const footprintFromMask = {
    width: allSiliconMaskBoundsUm.width,
    height: allSiliconMaskBoundsUm.height,
  };
  // Actuator and the crossing are source-defined groups. Couplers, external
  // optical leads, pads and speculative return rails are deliberately not
  // used to claim the author's switch-cell outline.
  const springAndActuator = [
    ...pose.fixedActuator,
    ...pose.movableActuator,
    ...pose.springContours,
    ...pose.springTrussContours,
  ];
  const swxLocal = [
    ...pose.source.optics.fixedFacetsAndPorts,
    ...pose.source.optics.movableFacetsAndPorts,
    ...pose.source.optics.fixedStops,
    ...pose.source.optics.movableStops,
  ];
  // Only actual reflecting teeth/facets plus the associated hard stops
  // define the measurable active SWX feature. The first item of each
  // FacetsAndPorts array is its etched reflector; subsequent entries are
  // access tapers/ports that exit the photonic window into an array.
  const activeSwx = [
    pose.source.optics.fixedFacetsAndPorts[0],
    pose.source.optics.movableFacetsAndPorts[0],
    ...pose.source.optics.fixedStops,
    ...pose.source.optics.movableStops,
  ];
  const actuatorGeometryBoundsUm = vectorApi.multiBounds(toMulti(springAndActuator));
  const opticalCrossingGeometryBoundsUm = vectorApi.multiBounds(toMulti(swxLocal));
  const activeSwxFeatureBoundsUm = vectorApi.multiBounds(toMulti(activeSwx));
  const coreAndActuatorGeometryBoundsUm = vectorApi.multiBounds(
    toMulti([...springAndActuator, ...swxLocal, ...pose.bridge]),
  );
  const fieldBoundsUm = source.layout.bounds;
  const paperReported = HU2025_PAPER_FOOTPRINT_UM;
  // Keep the *same* window for OFF and ON: its registered origin is the
  // stationary reflecting facet and the nominal 900nm OFF slit, not the
  // center of a movable shape after actuation. The fixed facet has the
  // same physical world position in both states.
  const fixedReflectorBoundsUm = vectorApi.multiBounds(
    toMulti([pose.source.optics.fixedFacetsAndPorts[0]]),
  );
  const nominalOffGapUm = 0.9;
  const stationaryOpticalOriginUm = {
    x: (fixedReflectorBoundsUm.minX + fixedReflectorBoundsUm.maxX) / 2,
    y: fixedReflectorBoundsUm.minY - nominalOffGapUm / 2,
  };
  const photonicMeasurementWindowUm = centeredWindow(
    {
      minX: stationaryOpticalOriginUm.x,
      maxX: stationaryOpticalOriginUm.x,
      minY: stationaryOpticalOriginUm.y,
      maxY: stationaryOpticalOriginUm.y,
    },
    paperReported.splitCrossing,
  );
  const activeSwxWithinPhotonicWindow = containsBounds(
    photonicMeasurementWindowUm,
    activeSwxFeatureBoundsUm,
  );
  const accessPortsExtendOutsidePhotonicWindow = !containsBounds(
    photonicMeasurementWindowUm,
    opticalCrossingGeometryBoundsUm,
  );
  // This is an unresolved comparison, not a request to pad the model to
  // exactly 100um. The paper's complete switch device scope is unregistered.
  const unregisteredFullSwitchYDifferenceUm =
    paperReported.switchIncludingActuator.height - coreAndActuatorGeometryBoundsUm.height;
  const b = allSiliconMaskBoundsUm;
  const siliconFitsField =
    b.minX >= fieldBoundsUm.minX &&
    b.maxX <= fieldBoundsUm.maxX &&
    b.minY >= fieldBoundsUm.minY &&
    b.maxY <= fieldBoundsUm.maxY;
  return {
    source: 'Hu et al., Nature Communications 16, 331 (2025), Fig. 1c and Fig. 3a',
    paperReported,
    fullMaskSiliconBoundsUm: allSiliconMaskBoundsUm,
    fullMaskSiliconFootprintUm: footprintFromMask,
    nominalSimulationFieldBoundsUm: fieldBoundsUm,
    actuatorGeometryBoundsUm,
    opticalCrossingGeometryBoundsUm,
    activeSwxFeatureBoundsUm,
    fixedReflectorBoundsUm,
    stationaryOpticalOriginUm,
    photonicMeasurementWindowUm,
    activeSwxWithinPhotonicWindow,
    accessPortsExtendOutsidePhotonicWindow,
    coreAndActuatorGeometryBoundsUm,
    unregisteredFullSwitchYDifferenceUm,
    siliconFitsField,
    // The author did not supply EBL GDS, a measured SEM transform or a
    // documented mask-footprint definition that includes all four couplers.
    // Reporting a number is not equivalent to metrology or alignment.
    dimensionsComparedOnLikeForLikeScope: false,
    semMetrologyTransformVerified: false,
    paperSwitchFootprintAccepted: false,
    paperSwxFootprintAccepted: false,
    fullFigureGeometryAccepted: false,
  };
}
