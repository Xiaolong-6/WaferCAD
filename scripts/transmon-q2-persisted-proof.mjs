import { readFileSync } from 'node:fs';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { expandProjectStorage } = await import('../site/project-io.js');
const { validateProjectFile } = await import('../site/project-schema.js');
const { sectionSlices, materialSolids } = await import('../site/model-view-geometry.js');
const { geometryArea } = await import('../site/model.js');
const { difference, intersection, pointInMulti, unionGeometries } =
  await import('../site/vector-geometry.js');

const MAX_AREA_ERROR_UM2 = 2e-8; // Two area cells at 0.1 nm XY grid pitch.
const Z_ERROR_UM = 1e-8;
const SOURCE_SHA256 = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';

function requireInvariant(ok, message) {
  if (!ok) throw new Error('Q2 persisted artifact: ' + message);
}

/** Verify the *saved* GDS-backed material model, never an input shadow preview. */
export function verifyPersistedQ2Project(storedJson, report) {
  requireInvariant(report?.sourceSha256 === SOURCE_SHA256, 'author source hash mismatch');
  requireInvariant(report?.transport === 'native-direct', 'not a native-direct Process replay');
  requireInvariant(report?.strictProjectRoundTrip === true, 'project roundtrip not established');
  requireInvariant(report?.tunnelJunctionValidated === false, 'unsupported device claim');
  requireInvariant(report?.operations?.length === 3, 'exactly three Al doses required');
  const project = JSON.parse(storedJson);
  expandProjectStorage(project);
  validateProjectFile(project);
  const { model } = project;
  const { regions, boundary } = model;
  requireInvariant(regions.length > 0, 'empty material model');
  requireInvariant(
    model.processRevision === (report.oxideHypothesis ? 6 : 5),
    'unexpected native process revision',
  );
  const footprint = unionGeometries(regions.map((region) => region.geom));
  const uncovered = geometryArea(difference(boundary, footprint));
  const overgrown = geometryArea(difference(footprint, boundary));
  requireInvariant(uncovered <= MAX_AREA_ERROR_UM2, `unowned Si area ${uncovered} µm²`);
  requireInvariant(overgrown <= MAX_AREA_ERROR_UM2, `outside-wafer area ${overgrown} µm²`);
  let duplicateArea = 0;
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const overlap = geometryArea(intersection(regions[i].geom, regions[j].geom));
      requireInvariant(
        overlap <= MAX_AREA_ERROR_UM2,
        `duplicate XY owner ${i}/${j}: ${overlap} µm²`,
      );
      duplicateArea += overlap;
    }
  }
  requireInvariant(duplicateArea <= MAX_AREA_ERROR_UM2, 'cumulative duplicate owner area');

  const alIds = report.operations.map(({ layerId }) => layerId);
  requireInvariant(new Set(alIds).size === 3, 'Al doses did not create three distinct layers');
  const alFootprints = alIds.map((id) =>
    unionGeometries(
      regions
        .filter((region) => region.stack.some((segment) => segment.layerId === id))
        .map((region) => region.geom),
    ),
  );
  for (const [index, geometry] of alFootprints.entries()) {
    requireInvariant(geometryArea(geometry) > 0, `Al${index + 1} absent from persisted model`);
  }
  const firstTwoOverlap = geometryArea(intersection(alFootprints[0], alFootprints[1]));
  requireInvariant(firstTwoOverlap > 0, 'first-two Al overlap missing');
  requireInvariant(
    Math.abs(firstTwoOverlap - report.firstTwoAlOverlapAreaUm2) <= 5e-5,
    'persisted junction area disagrees with replay report',
  );
  const { crossSectionCenterUm, sectionIncludesThirdAl } = report;
  requireInvariant(
    Array.isArray(crossSectionCenterUm) && crossSectionCenterUm.length === 2,
    'missing source-backed Section witness',
  );
  requireInvariant(
    pointInMulti(crossSectionCenterUm, alFootprints[0]) &&
      pointInMulti(crossSectionCenterUm, alFootprints[1]),
    'Section misses the Al1/Al2 intersection',
  );
  requireInvariant(
    pointInMulti(crossSectionCenterUm, alFootprints[2]) === sectionIncludesThirdAl,
    'Section does not match third dose material ownership',
  );

  const slices = sectionSlices(model, project.section.a, project.section.b);
  const solids = materialSolids(model);
  let unmatched = 0;
  for (const slice of slices) {
    if (
      !solids.some(
        (solid) =>
          solid.layerId === slice.layerId &&
          solid.slabs.some(
            (slab) =>
              Math.abs(slab.z0 - slice.z0) < Z_ERROR_UM &&
              Math.abs(slab.z1 - slice.z1) < Z_ERROR_UM,
          ),
      )
    )
      unmatched++;
  }
  requireInvariant(unmatched === 0, `${unmatched} Section/3D physical material slabs differ`);
  requireInvariant(
    slices.some((slice) => slice.layerId === alIds[0]) &&
      slices.some((slice) => slice.layerId === alIds[1]),
    'Section has no common Al1/Al2 layer slices',
  );
  return {
    sourceSha256: report.sourceSha256,
    regions: regions.length,
    unownedSiAreaUm2: uncovered,
    outsideWaferAreaUm2: overgrown,
    duplicateOwnerAreaUm2: duplicateArea,
    firstTwoAlOverlapAreaUm2: firstTwoOverlap,
    sectionIncludesThirdAl,
    sectionSlices: slices.length,
    section3dZSlabMismatches: unmatched,
    browserAcceptance: false,
  };
}

if (process.argv[1]?.endsWith('transmon-q2-persisted-proof.mjs')) {
  const [file, reportPath] = process.argv.slice(2);
  if (!file || !reportPath) {
    console.error(
      'Usage: node scripts/transmon-q2-persisted-proof.mjs project.wafercad native-report.json',
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          verifyPersistedQ2Project(
            readFileSync(file, 'utf8'),
            JSON.parse(readFileSync(reportPath, 'utf8')),
          ),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
