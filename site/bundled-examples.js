export const BUNDLED_EXAMPLES = Object.freeze([
  {
    id: 'photodetector-literature',
    title: 'Photodetectors with nanopatterns',
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
      'Nanostructured Si and Ge photodiodes reconstructed as one branch-based project, covering rough surfaces, conformal passivation, implants, and induced electrical regions.',
    sources: [
      {
        citation:
          'O. E. Setälä et al., “Boron-Implanted Black Silicon Photodiode with Close-to-Ideal Responsivity from 200 to 1000 nm,” ACS Photonics 10, 1735–1741 (2023).',
        doi: '10.1021/acsphotonics.2c01984',
        href: 'https://doi.org/10.1021/acsphotonics.2c01984',
      },
      {
        citation:
          'H. Liu et al., “Near-infrared germanium PIN-photodiodes with >1A/W responsivity,” Light: Science & Applications 14, 9 (2025).',
        doi: '10.1038/s41377-024-01670-4',
        href: 'https://doi.org/10.1038/s41377-024-01670-4',
      },
    ],
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
