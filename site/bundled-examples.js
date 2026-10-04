export const BUNDLED_EXAMPLES = Object.freeze([
  {
    id: 'photodetector-literature',
    title: 'Photodetector literature examples',
    figure: 'Black-Si Fig. 1a · Ge Fig. 15',
    kind: 'project',
    level: 'Literature reconstruction',
    variants: ['Black-Si · FINAL / QA', 'Ge Fig. 15 · A / B'],
    path: './examples/photodetector-literature-examples.wafercad',
    filename: 'photodetector-literature-examples.wafercad',
    preview: {
      path: './example-previews/photodetector-literature.jpg',
      alt: 'WaferCAD reconstruction of the boron-implanted black-silicon photodetector with Main, Mask, and Section views visible.',
      label: 'Real WaferCAD reconstruction',
      position: '50% 42%',
    },
    summary:
      'One branch-based project containing two closely related detector reconstructions. Black-Si retains FINAL/QA variants; Ge Fig. 15 uses first-class induced inversion/accumulation Electrical Regions across A/B variants.',
    tags: ['Literature', 'Rough surfaces', 'ALD', 'Implant', 'Electrical', 'Variants'],
  },
  {
    id: 'visualization',
    title: 'Visualization mask',
    figure: 'Layout demo',
    kind: 'generated',
    level: 'Beginner',
    variants: [],
    path: null,
    filename: null,
    preview: {
      path: './example-previews/visualization-mask.jpg',
      alt: 'WaferCAD layout example shown in the real Main, Mask, 3D, and Section workspace.',
      label: 'Real WaferCAD workspace',
      position: '50% 48%',
    },
    summary:
      '50 mm synthetic hierarchy for learning GDS-style cells, layers, mask alignment, and the four synchronized views.',
    tags: ['Beginner', 'Mask', 'Hierarchy', '50 mm'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
