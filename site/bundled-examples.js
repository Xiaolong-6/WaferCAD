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
    previewProject: {
      path: './examples/previews/photodetector-literature.wafercad',
      filename: 'photodetector-literature-preview.wafercad',
    },
    preview: { path: './examples/thumbnails/photodetector-literature-three.webp', view: 'three' },
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
    variants: ['Source-order reconstruction', 'GDS-patterned contacts'],
    path: './examples/perc-solar-cells-point-contacts.wafercad',
    filename: 'perc-solar-cells-point-contacts.wafercad',
    previewProject: {
      path: './examples/previews/perc-point-contact-solar-cell.wafercad',
      filename: 'perc-point-contact-solar-cell-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/perc-point-contact-solar-cell-three.webp',
      view: 'three',
    },
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
    id: 'fully-textured-perovskite-silicon-tandem',
    title: 'Fully textured perovskite–silicon tandems',
    figure: 'Sahli et al. · fully textured monolithic tandem',
    kind: 'project',
    level: 'Tandem solar-cell literature',
    variants: ['nc-Si:H recombination junction', 'ITO control branch'],
    path: './examples/fully-textured-perovskite-silicon-tandem.wafercad',
    filename: 'fully-textured-perovskite-silicon-tandem.wafercad',
    previewProject: {
      path: './examples/previews/fully-textured-perovskite-silicon-tandem.wafercad',
      filename: 'fully-textured-perovskite-silicon-tandem-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/fully-textured-perovskite-silicon-tandem-three.webp',
      view: 'three',
    },
    summary:
      'A fully textured monolithic perovskite/silicon tandem with double-sided Si pyramids, SHJ contacts, conformal top-cell layers, ALD SnO2, IZO, and a surrogate Ag front grid.',
    sources: [
      {
        citation:
          'F. Sahli et al., “Fully textured monolithic perovskite/silicon tandem solar cells with 25.2% power conversion efficiency,” Nature Materials 17, 820–826 (2018).',
        doi: '10.1038/s41563-018-0115-4',
        href: 'https://doi.org/10.1038/s41563-018-0115-4',
      },
    ],
    tags: ['Literature', 'Tandem solar cell', 'Pyramid texture', 'Conformal', 'ALD', 'Variants'],
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
    previewProject: {
      path: './examples/previews/suspended-silica-microdisk.wafercad',
      filename: 'suspended-silica-microdisk-preview.wafercad',
    },
    preview: { path: './examples/thumbnails/suspended-silica-microdisk-three.webp', view: 'three' },
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
  {
    id: 'three-tier-silicon-jlfets',
    title: 'Three-tier silicon junctionless transistors',
    figure: 'Lam et al. - Fig. 3 single-site reconstruction',
    kind: 'project',
    level: '3D transistor literature',
    variants: [],
    path: './examples/three-tier-silicon-jlfets.wafercad',
    filename: 'three-tier-silicon-jlfets.wafercad',
    previewProject: {
      path: './examples/previews/three-tier-silicon-jlfets.wafercad',
      filename: 'three-tier-silicon-jlfets-preview.wafercad',
    },
    preview: { path: './examples/thumbnails/three-tier-silicon-jlfets-three.webp', view: 'three' },
    summary:
      'Three stacked silicon transistor tiers with native conformal HfO2 gates, contact windows, ILD liners and CMP, retained in 40 History Steps. Reconstructed masks cover one device site; transfer and SOG/CMP use recorded geometric assumptions.',
    sources: [
      {
        citation:
          'B. Lam et al., "Monolithic three-dimensional integration of silicon transistors," Nature 654, 652-659 (2026).',
        doi: '10.1038/s41586-026-10496-6',
        href: 'https://doi.org/10.1038/s41586-026-10496-6',
      },
    ],
    tags: ['Literature', '3D integration', 'Transfer', 'Conformal', 'CMP', 'History'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
