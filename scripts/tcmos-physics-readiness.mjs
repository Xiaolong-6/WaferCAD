/**
 * Read-only stage-gate for the illustrative Jeong et al. (2019) T-CMOS cell.
 * Only device geometry and qualitative dopant intent exist in WaferCAD.
 * This module must never synthesize a net-doping field, PN surface or current.
 */
import { auditDopantPhysicsEvidence } from '../site/dopant-regions.js';

const EXPECTED_TERMINAL_NETS = [
  ['pMOS-source', 'VDD'],
  ['pMOS-drain', 'VOUT'],
  ['nMOS-drain', 'VOUT'],
  ['nMOS-source', 'GND'],
  ['pMOS-gate', 'VIN'],
  ['nMOS-gate', 'VIN'],
  ['pMOS-well-tie', 'VDD'],
  ['nMOS-well-tie', 'GND'],
];

const REQUIRED_INPUTS = [
  {
    id: 'activated-net-dopant-field',
    stage: 'physical-pn',
    reason: 'Spatial N_D-N_A and activation after implant, diffusion and anneal are absent.',
  },
  {
    id: 'oxide-stopping-and-implant-calibration',
    stage: 'physical-pn',
    reason: 'Implant dose/energy, lateral spread and SiO2 stopping are not calibrated.',
  },
  {
    id: 'poisson-boundary-conditions',
    stage: 'physical-pn',
    reason: 'Bias/contact boundary conditions and a Poisson solver are absent.',
  },
  {
    id: 'field-resolved-btbt-transport',
    stage: 'btbt',
    reason: 'No calibrated band-to-band tunnelling law or electric-field solver exists.',
  },
  {
    id: 'activated-contact-and-resistivity',
    stage: 'contacts',
    reason: 'Surface contact dopants, activation and contact resistivity are unknown.',
  },
  {
    id: 'device-and-circuit-iv-calibration',
    stage: 'ternary-vtc',
    reason: 'No bias-dependent device I-V, circuit solver or measured fitting data are supplied.',
  },
];

/**
 * A validated illustrative geometry can pass the *structural* gate. Physics
 * remains explicitly blocked until a future calibrated schema and solver are
 * implemented and independently validated. Fake numeric metadata is ignored.
 */
export function auditTcmosPnBtbtReadiness(model, netEvidence, overlapAreaUm2) {
  const physics = auditDopantPhysicsEvidence(model);
  const actual = netEvidence?.terminals || [];
  const byId = new Map(actual.map((terminal) => [terminal.id, terminal.net]));
  const netTopologyQualified =
    actual.length === EXPECTED_TERMINAL_NETS.length &&
    byId.size === EXPECTED_TERMINAL_NETS.length &&
    EXPECTED_TERMINAL_NETS.every(([id, net]) => byId.get(id) === net);

  const terminalNames = EXPECTED_TERMINAL_NETS.filter(([id]) =>
    id.endsWith('-source') || id.endsWith('-drain'),
  ).map(([id]) => id);
  const overlapAreas = terminalNames.map((id) => overlapAreaUm2?.[id]);
  const qualitativeOverlapPresent = overlapAreas.every(
    (area) => typeof area === 'number' && Number.isFinite(area) && area > 0,
  );

  return {
    contract: 'tcmos-pn-btbt-prerequisites-v1',
    source: 'Jeong et al. 2019 Fig. 1, Methods and Supplementary model',
    sourceEvidence: {
      deviceTopology: 'published-schematic',
      hvtSpecies: 'As+ pMOS and BF2+ nMOS',
      foundryNodeNm: 130,
      localGateLengthMeasured: false,
      effectiveTjEstimateNm: {
        tNmosBoron: 75,
        tPmosArsenic: 30,
        interpretation: 'analytical estimate; not an HVT implant interval or PN surface',
      },
    },
    structural: {
      netTopologyQualified,
      qualitativeOverlapPresent,
      geometryCandidateQualified: netTopologyQualified && qualitativeOverlapPresent,
      terminalCount: actual.length,
    },
    quantitative: {
      calibratedNetDopantProfileAvailable: physics.calibratedNetDopantProfileAvailable,
      activatedJunctionProfileAvailable: physics.activatedJunctionProfileAvailable,
      physicalPnInterfaceReady: false,
      btbtCurrentReady: false,
      ohmicContactReady: false,
      ternaryVoltageTransferReady: false,
    },
    prerequisites: REQUIRED_INPUTS.map((item) => ({
      ...item,
      status: 'missing',
    })),
    numericalOutputAuthorized: false,
  };
}
