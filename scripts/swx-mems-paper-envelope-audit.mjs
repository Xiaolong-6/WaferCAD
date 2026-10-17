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
  const actuatorGeometryBoundsUm = vectorApi.multiBounds(toMulti(springAndActuator));
  const opticalCrossingGeometryBoundsUm = vectorApi.multiBounds(toMulti(swxLocal));
  const coreAndActuatorGeometryBoundsUm = vectorApi.multiBounds(
    toMulti([...springAndActuator, ...swxLocal, ...pose.bridge]),
  );
  const fieldBoundsUm = source.layout.bounds;
  const paperReported = HU2025_PAPER_FOOTPRINT_UM;
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
    coreAndActuatorGeometryBoundsUm,
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
