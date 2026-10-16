/**
 * Experimental read-only numerical inputs for semiconductor research.
 *
 * Qualitative Implant records in .wafercad are NOT activated donor/acceptor
 * concentrations. This contract accepts only explicitly supplied, unverified
 * XY/XZ sampling data and never makes a calibrated physics claim.
 */
export const NET_DOPANT_SLICE_KIND = 'net-dopant-xz-grid-v1';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const validId = (value) => typeof value === 'string' && value.length > 0;
const MAX_NODES = 65536;

function fail(message) {
  throw new TypeError('Semiconductor input: ' + message);
}

function validateAxis(values, name) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 256) {
    fail(name + ' requires 2–256 samples.');
  }
  for (let index = 0; index < values.length; index++) {
    if (!finite(values[index])) fail(name + ' requires finite coordinates.');
    if (index > 0) {
      const spacing = values[index] - values[index - 1];
      if (!finite(spacing) || spacing <= 0) fail(name + ' must be strictly increasing.');
    }
  }
}

function validateGrid(grid, name, nx, nz, test) {
  if (!Array.isArray(grid) || grid.length !== nz) {
    fail(name + ' must have one row per Z sample.');
  }
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== nx) {
      fail(name + ' must have one column per X sample.');
    }
    for (const value of row) {
      if (!test(value)) fail(name + ' contains invalid samples.');
    }
  }
}

function validateExactKeys(value, permitted, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(name + ' must be an object.');
  }
  for (const key of Object.keys(value)) {
    if (!permitted.includes(key)) fail(name + ' has unsupported key ' + key + '.');
  }
}

/**
 * Verify grid shape, units, material ownership, nonnegative separate donor and
 * acceptor concentrations, and explicit *unverified* external provenance.
 * The caller owns the input; no mutation or project schema upgrade occurs.
 */
export function validateNetDopantCrossSection(slice) {
  validateExactKeys(
    slice,
    ['kind', 'units', 'xUm', 'zUm', 'donorsCm3', 'acceptorsCm3', 'hostLayerIds', 'provenance'],
    'cross-section',
  );
  if (slice.kind !== NET_DOPANT_SLICE_KIND) fail('unsupported cross-section kind.');
  validateExactKeys(slice.units, ['position', 'concentration'], 'units');
  if (slice.units.position !== 'um' || slice.units.concentration !== 'cm^-3') {
    fail('coordinates must be um and concentrations cm^-3.');
  }
  validateExactKeys(slice.provenance, ['kind', 'sourceId'], 'provenance');
  if (
    !['synthetic', 'external-unverified'].includes(slice.provenance.kind) ||
    !validId(slice.provenance.sourceId)
  ) {
    fail('provenance must be synthetic or external-unverified with sourceId.');
  }
  validateAxis(slice.xUm, 'xUm');
  validateAxis(slice.zUm, 'zUm');
  const nx = slice.xUm.length;
  const nz = slice.zUm.length;
  if (nx * nz > MAX_NODES) fail('cross-section exceeds the node budget.');
  validateGrid(slice.donorsCm3, 'donorsCm3', nx, nz, (v) => finite(v) && v >= 0);
  validateGrid(slice.acceptorsCm3, 'acceptorsCm3', nx, nz, (v) => finite(v) && v >= 0);
  validateGrid(slice.hostLayerIds, 'hostLayerIds', nx, nz, (v) => v === null || validId(v));
  let semiconductorNodes = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (slice.hostLayerIds[iz][ix] !== null) {
        semiconductorNodes += 1;
      } else if (slice.donorsCm3[iz][ix] !== 0 || slice.acceptorsCm3[iz][ix] !== 0) {
        fail('non-semiconductor samples cannot carry dopant concentration.');
      }
    }
  }
  if (!semiconductorNodes) fail('cross-section has no semiconductor samples.');
  return {
    kind: NET_DOPANT_SLICE_KIND,
    nx,
    nz,
    semiconductorNodes,
    activationVerified: false,
    externalCalibrationVerified: false,
    projectDopantRegionsConverted: false,
  };
}

/**
 * Scan adjacent samples for strict sign changes of supplied N_D-N_A.
 * Values exactly equal to zero are reported separately, never silently
 * assigned to a P or N region. Crossings are interpolated *sample points*;
 * no PN contour/surface, depletion solution or current is calculated.
 */
export function findSampledNetDopantSignCrossings(slice) {
  const summary = validateNetDopantCrossSection(slice);
  const crossings = [];
  let zeroSamples = 0;
  const netAt = (ix, iz) => slice.donorsCm3[iz][ix] - slice.acceptorsCm3[iz][ix];
  for (let iz = 0; iz < summary.nz; iz++) {
    for (let ix = 0; ix < summary.nx; ix++) {
      const hostLayerId = slice.hostLayerIds[iz][ix];
      if (hostLayerId === null) continue;
      const a = netAt(ix, iz);
      if (a === 0) zeroSamples++;
      const adjacent = [
        ['x', ix + 1, iz],
        ['z', ix, iz + 1],
      ];
      for (const [axis, nx, nz] of adjacent) {
        if (nx >= summary.nx || nz >= summary.nz) continue;
        if (slice.hostLayerIds[nz][nx] !== hostLayerId) continue;
        const b = netAt(nx, nz);
        if (!((a < 0 && b > 0) || (a > 0 && b < 0))) continue;
        const magnitude = Math.max(Math.abs(a), Math.abs(b));
        const left = Math.abs(a) / magnitude;
        const right = Math.abs(b) / magnitude;
        const t = left / (left + right);
        crossings.push({
          axis,
          hostLayerId,
          xUm: slice.xUm[ix] + (slice.xUm[nx] - slice.xUm[ix]) * t,
          zUm: slice.zUm[iz] + (slice.zUm[nz] - slice.zUm[iz]) * t,
          originNode: [ix, iz],
          neighborNode: [nx, nz],
          interpolation: 'linear-between-samples',
        });
      }
    }
  }
  return {
    kind: 'sampled-net-dopant-sign-change-candidates-v1',
    crossings,
    zeroSamples,
    activatedProfileVerified: false,
    physicalPnInterfaceResolved: false,
    depletionWidthComputed: false,
    electricalTransportComputed: false,
  };
}

/**
 * Validate a minimal Dirichlet boundary *input* for a future 2D Poisson solver.
 * All four edges must be specified with matching corner values. This validator
 * never calls a solver and never produces electrostatic potential or field.
 */
export function validatePoissonCrossSectionInput(problem) {
  validateExactKeys(
    problem,
    ['kind', 'slice', 'relativePermittivity', 'temperatureKelvin', 'dirichletVolt'],
    'Poisson input',
  );
  if (problem.kind !== 'poisson-xz-input-v1') fail('unsupported Poisson input kind.');
  const slice = validateNetDopantCrossSection(problem.slice);
  validateGrid(
    problem.relativePermittivity,
    'relativePermittivity',
    slice.nx,
    slice.nz,
    (v) => finite(v) && v > 0,
  );
  if (!finite(problem.temperatureKelvin) || problem.temperatureKelvin <= 0) {
    fail('temperatureKelvin must be positive.');
  }
  validateExactKeys(problem.dirichletVolt, ['left', 'right', 'bottom', 'top'], 'Dirichlet');
  const bc = problem.dirichletVolt;
  const edgeSizes = [
    ['left', slice.nz],
    ['right', slice.nz],
    ['bottom', slice.nx],
    ['top', slice.nx],
  ];
  for (const [edge, length] of edgeSizes) {
    const samples = bc[edge];
    if (!Array.isArray(samples) || samples.length !== length) {
      fail(edge + ' Dirichlet boundary has invalid samples.');
    }
    if (samples.some((value) => !finite(value))) {
      fail(edge + ' Dirichlet boundary has invalid samples.');
    }
  }
  if (
    bc.left[0] !== bc.bottom[0] ||
    bc.right[0] !== bc.bottom[slice.nx - 1] ||
    bc.left[slice.nz - 1] !== bc.top[0] ||
    bc.right[slice.nz - 1] !== bc.top[slice.nx - 1]
  ) {
    fail('Dirichlet corner values disagree.');
  }
  return {
    kind: 'poisson-xz-validated-input-v1',
    nodes: slice.nx * slice.nz,
    boundaryNodes: 2 * (slice.nx + slice.nz) - 4,
    poissonSolved: false,
    potentialComputed: false,
    electricFieldComputed: false,
    pnInterfaceResolved: false,
    btbtCurrentComputed: false,
    missingPhysics: ['free-carrier-statistics', 'poisson-discretization', 'solver-calibration'],
  };
}
