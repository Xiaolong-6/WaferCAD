export const BUNDLED_EXAMPLES = Object.freeze([
  {
    id: 'photodetector-literature',
    title: 'Photodetector literature examples',
    figure: 'Black-Si Fig. 1a · Ge Fig. 15',
    kind: 'project',
    path: './examples/photodetector-literature-examples.wafercad',
    filename: 'photodetector-literature-examples.wafercad',
    summary:
      'One branch-based project containing two closely related detector reconstructions. Black-Si retains FINAL/QA variants; Ge retains its Fig. 15 A/B device variants.',
    tags: ['Literature', 'Rough surfaces', 'ALD', 'Implant', 'Variants'],
  },
  {
    id: 'visualization',
    title: 'Visualization mask',
    figure: 'Layout demo',
    kind: 'generated',
    path: null,
    filename: null,
    summary:
      '50 mm synthetic hierarchy for learning GDS-style cells, layers, mask alignment, and the four synchronized views.',
    tags: ['Beginner', 'Mask', 'Hierarchy', '50 mm'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
