// Canonical Process help catalog shared by the UI and product-manual exporter.
// Descriptions document geometric semantics, not calibrated fabrication physics.
const guide = (id, family, title, summary, detail, parameters, limits, example, effect) => ({
  id,
  family,
  title,
  summary,
  detail,
  parameters,
  limits,
  example,
  effect,
});

export const PROCESS_GUIDE = Object.freeze([
  guide(
    'deposit-directional',
    'Deposit',
    'Directional deposition',
    'Adds a new layer to exposed horizontal surfaces along Z.',
    'Applies the requested thickness on local exposed horizontal faces inside the chosen area; vertical walls are not coated.',
    'Material · Thickness · Face · Area',
    'No rate, shadowing, or transport physics is computed.',
    'Simplified sputtered contacts in the detector process.',
    'geometry',
  ),
  guide(
    'deposit-conformal',
    'Deposit',
    'Conformal deposition',
    'Coats exposed horizontal surfaces and genuine sidewalls.',
    'A shared kernel coats exposed horizontal faces and makes physical sidewall bands of the same lateral thickness.',
    'Material · Thickness · Face · Area',
    'Rough surface coating is a render approximation; no ALD kinetics or pinch-off prediction.',
    'ALD Al₂O₃ passivation on nanostructured Si/Ge.',
    'geometry',
  ),
  guide(
    'deposit-transfer-follow',
    'Deposit',
    'Transfer · Follow surface',
    'Transfers a new film onto each local exposed horizontal plane.',
    'Every supported XY column uses its own exposed height. True voids stay empty; vertical sidewalls receive no film.',
    'Film thickness · Gap · Placement',
    'No mechanical deformation, bonding, or sagging model.',
    'Local transfer of a 2D film onto stepped surfaces.',
    'geometry',
  ),
  guide(
    'deposit-transfer-flat',
    'Deposit',
    'Transfer · Flat bridge',
    'Transfers a flat membrane at one global exposed plane.',
    'The front-side highest exposed Z (back-side lowest) defines the film plane; it may bridge openings without filling underneath.',
    'Film thickness · Gap · Placement',
    'No membrane sag or fracture. Legacy Transfer without placement replays as Flat bridge.',
    'Bridge a patterned gap with a suspended sheet.',
    'geometry',
  ),
  guide(
    'extend-directional',
    'Extend',
    'Directional extension',
    'Thickens the exposed horizontal part of an existing layer.',
    'Uses the target layer identity and extends only currently exposed horizontal target surfaces.',
    'Target layer · Thickness · Area',
    'A covered target and exposed sidewalls do not grow in this mode.',
    'Continue an exposed metal/contact layer.',
    'geometry',
  ),
  guide(
    'extend-conformal',
    'Extend',
    'Conformal extension',
    'Continues an existing layer over exposed faces and real sidewalls.',
    'Uses the same conformal kernel as Deposit, retaining the selected layer ID. The target must be exposed in the selected area.',
    'Target layer · Thickness · Area',
    'May cover neighboring exposed surfaces; rough shells are display approximations.',
    'Add another conformal increment of a passivation film.',
    'geometry',
  ),
  guide(
    'etch-directional',
    'Etch',
    'Directional etch',
    'Vertically subtracts exposed materials through the selected footprint.',
    'Without a target material, subtraction progresses through adjacent contiguous materials in stack order, stopping at true voids.',
    'Depth · Face · Area',
    'No measured etch rates, aspect-ratio or plasma chemistry.',
    'Open a patterned contact hole through oxide.',
    'geometry',
  ),
  guide(
    'etch-selective',
    'Etch',
    'Material-selective etch',
    'Etches only a selected exposed material and stops at another layer.',
    'Directional subtraction stops once the chosen material is no longer exposed, or when it reaches a real cavity.',
    'Target material · Depth · Area',
    'Material selectivity is an ideal geometric choice, not a rate prediction.',
    'Remove oxide without subtracting underlying silicon.',
    'geometry',
  ),
  guide(
    'etch-isotropic',
    'Etch',
    'Isotropic release',
    'Expands a curved etch front into and laterally under exposed target material.',
    'A distance-based geometric removal front forms real cavities and supported overhangs while preserving other materials.',
    'Exposed target material · Radius · Area',
    'A bounded Z-sliced approximation; no calibrated wet/dry release chemistry.',
    'MEMS-style release beneath a protective mask.',
    'geometry',
  ),
  guide(
    'etch-undercut',
    'Etch',
    'Undercut release',
    'Laterally removes an exposed sacrificial layer from access openings.',
    'Expands the access area in XY and subtracts only the selected sacrificial material, leaving upper structures suspended.',
    'Exposed sacrificial material · Undercut distance',
    'Uses 2.5D lateral removal, not a fully 3D advancing front.',
    'BOX / sacrificial-spacer removal.',
    'geometry',
  ),
  guide(
    'etch-planarize',
    'Etch',
    'Planarize / CMP',
    'Clips the existing stack to a physical target Z plane.',
    'Only material beyond Target Z on the chosen face is removed. Depressions remain and no fill is invented.',
    'Target Z · Face · Area',
    'No CMP polishing rate, dishing, or erosion computation.',
    'Level a stepped multi-material stack.',
    'geometry',
  ),
  guide(
    'etch-rough-normal',
    'Surface',
    'Rough · Normal peaks',
    'Renders stochastic correlated outward surface relief after directional etch.',
    'Feature size, mean height, coefficients of variation, and seed define a deterministic roughness heightfield.',
    'Depth · Feature XY · Height · CV · Seed',
    'Render-only morphology: subsequent Process actions use the ideal stack.',
    'Schematic RIE-like black-Si surface.',
    'display',
  ),
  guide(
    'etch-rough-inverted',
    'Surface',
    'Rough · Inverted pits',
    'Renders inward valleys from the same stochastic surface profile.',
    'Inverted mirrors the Normal vertical field without moving its lateral feature positions.',
    'Depth · Feature XY · Height · CV · Seed',
    'Render-only. No measured black-Si profile is implied.',
    'Schematic recessed texture, e.g. MACE-like.',
    'display',
  ),
  guide(
    'etch-pyramid-normal',
    'Surface',
    'Pyramid · Normal',
    'Renders outward square-pyramid texture after directional etch.',
    'The shared deterministic XY heightfield creates outward pyramidal relief on the displayed surface.',
    'Depth · Pyramid XY · Height · Orientation',
    'Render-only; it does not alter the canonical etch boundary.',
    'Idealized textured silicon pyramids.',
    'display',
  ),
  guide(
    'etch-pyramid-inverted',
    'Surface',
    'Pyramid · Inverted',
    'Renders recessed square pyramidal pits.',
    'A vertical mirror of Normal pyramid relief creates regular inward pits.',
    'Depth · Pyramid XY · Height · Orientation',
    'Render-only; crystallographic etch kinetics are outside scope.',
    'Idealized inverted-pyramid antireflective texture.',
    'display',
  ),
  guide(
    'implant',
    'Annotation',
    'Implant',
    'Adds a depth-graded structural marker beneath exposed surfaces.',
    'Stores a separately named annotation with empirical depth and signed X tilt. Later etches clip the surviving annotation.',
    'Name · Depth · Tilt X · Face · Area',
    'Does not compute species, dose, energy, activation, diffusion or electrical junctions.',
    'Front B implant and guard ring in the photodetector.',
    'annotation',
  ),
  guide(
    'electrical',
    'Annotation',
    'Electrical Region',
    'Annotates induced, doped, p/n, depletion or interface zones.',
    'Anchors a non-material schematic zone to the exposed face. It follows later geometrical clipping.',
    'Name · Type · Source · Depth · Area',
    'No electrostatics, carrier concentration or transport simulation.',
    'Dielectric-induced inversion region on Ge.',
    'annotation',
  ),
  guide(
    'record',
    'History',
    'Record process step',
    'Stores fabrication metadata without changing geometry.',
    'Adds an ordered History event for Anneal, Clean, Oxidation, Surface treatment, Activation or a custom operation.',
    'Process · Label · Temperature · Duration · Ambient · Notes',
    'Recording an anneal does not perform diffusion or add an oxide layer.',
    '1050 °C drive-in or forming-gas anneal in the detector example.',
    'history',
  ),
]);

const BY_ID = new Map(PROCESS_GUIDE.map((entry) => [entry.id, entry]));

export function processGuideKey({
  type = 'add',
  growth = 'direct',
  placement = 'follow',
  profile = 'directional',
  surface = 'smooth',
  polarity = 'inverted',
  targetMaterial = false,
} = {}) {
  if (type === 'add') {
    if (growth === 'transfer')
      return placement === 'flat' ? 'deposit-transfer-flat' : 'deposit-transfer-follow';
    return growth === 'conformal' ? 'deposit-conformal' : 'deposit-directional';
  }
  if (type === 'grow') return growth === 'conformal' ? 'extend-conformal' : 'extend-directional';
  if (type === 'etch') {
    if (profile === 'isotropic') return 'etch-isotropic';
    if (profile === 'undercut') return 'etch-undercut';
    if (profile === 'planarize') return 'etch-planarize';
    if (surface === 'rough' || surface === 'pyramid') {
      return 'etch-' + surface + '-' + (polarity === 'normal' ? 'normal' : 'inverted');
    }
    return targetMaterial ? 'etch-selective' : 'etch-directional';
  }
  return BY_ID.has(type) ? type : 'deposit-directional';
}

export function processGuideEntry(id) {
  return BY_ID.get(id) || null;
}
