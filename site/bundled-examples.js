export const BUNDLED_EXAMPLES = Object.freeze([
  {
    id: 'black-si-fig1a',
    title: 'Black-Si photodiode',
    figure: 'Fig. 1a',
    kind: 'project',
    path: './examples/black-si-fig1a.wafercad',
    filename: 'Example_BlackSi_Fig1a.wafercad',
    summary: 'B-implanted black-silicon detector process with rough Si, conformal Al₂O₃, front/rear processing, and complete History.',
    tags: ['Rough etch', 'Implant', 'ALD', 'Front/back'],
  },
  {
    id: 'ge-fig15-ab',
    title: 'Ge induced-junction devices',
    figure: 'Fig. 15 A/B',
    kind: 'project',
    path: './examples/ge-fig15-ab.wafercad',
    filename: 'Example_Ge_Fig15_AB.wafercad',
    summary: 'Germanium detector project with two process Variants for the Fig. 15 A/B structures and restorable fabrication Steps.',
    tags: ['2 Variants', 'Ge', 'ALD', 'Guard ring'],
  },
  {
    id: 'visualization',
    title: 'Visualization mask',
    figure: 'Layout demo',
    kind: 'generated',
    path: null,
    filename: null,
    summary: '50 mm synthetic hierarchy for learning GDS-style cells, layers, mask alignment, and the four synchronized views.',
    tags: ['Mask', 'Hierarchy', '50 mm'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
