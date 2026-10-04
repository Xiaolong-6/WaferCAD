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
    id: 'perc-point-contact-solar-cell',
    title: 'PERC solar cells with point contacts',
    figure: 'Blakers et al. · Fig. 1 reconstruction',
    kind: 'project',
    level: 'Solar-cell literature',
    variants: ['Corrected source-order process', 'Alternative reconstruction branches'],
    path: './examples/perc-solar-cells-point-contacts.wafercad',
    filename: 'perc-solar-cells-point-contacts.wafercad',
    summary:
      'Texturing, diffusion regions, front and rear passivation, local rear openings, and metallization reconstructed as a branch-based PERC process project.',
    sources: [
      {
        citation:
          'A. W. Blakers et al., “22.8% efficient silicon solar cell,” Applied Physics Letters 55, 1363–1365 (1989).',
        doi: '10.1063/1.101596',
        href: 'https://doi.org/10.1063/1.101596',
      },
    ],
    tags: ['Literature', 'Solar cell', 'Point contacts', 'Front / Back', 'Variants'],
  },
  {
    id: 'suspended-silica-microdisk',
    title: 'Suspended silica microdisks',
    figure: 'Basiri-Esfahani et al. · Fig. 2 reconstruction',
    kind: 'project',
    level: 'MEMS / photonics literature',
    variants: [],
    path: './examples/suspended-silica-microdisks.wafercad',
    filename: 'suspended-silica-microdisks.wafercad',
    summary:
      'A spoked silica microdisk released from silicon with a real annular air gap and surviving central support pedestal.',
    sources: [
      {
        citation:
          'S. Basiri-Esfahani et al., “Precision ultrasound sensing on a chip,” Nature Communications 10, 132 (2019).',
        doi: '10.1038/s41467-018-08038-4',
        href: 'https://doi.org/10.1038/s41467-018-08038-4',
      },
    ],
    tags: ['Literature', 'Release', 'Undercut', 'Suspended structure'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
