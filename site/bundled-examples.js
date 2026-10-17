export const BUNDLED_EXAMPLES = Object.freeze([
  {
    id: 'photodetector-literature',
    title: 'Photodetectors with nanopatterns',
    figure: 'Black-Si Fig. 1a · Ge thesis Fig. 15',
    kind: 'project',
    level: 'Literature reconstruction',
    variants: ['Black-Si · FINAL / QA', 'Ge thesis Fig. 15 · A / B'],
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
      {
        citation:
          'H. Liu, “Development of highly sensitive Ge NIR photodiode utilizing nanotexturing and charged oxides,” Aalto University Doctoral Theses 6/2026, Fig. 15.',
        href: 'https://urn.fi/URN:ISBN:978-952-64-2900-7',
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
    id: 'm3d-selfpowered-heterogeneous-ic',
    title: 'Self-powered heterogeneous M3D circuits',
    figure: 'Ghosh et al. · Si PVM / WSe₂ / MoS₂ / graphene',
    kind: 'project',
    level: 'Heterogeneous 3D integrated circuit',
    variants: [],
    path: './examples/m3d-selfpowered-full-replay.wafercad',
    filename: 'm3d-selfpowered-full-replay.wafercad',
    previewProject: {
      path: './examples/previews/m3d-selfpowered-heterogeneous-ic.wafercad',
      filename: 'm3d-selfpowered-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/m3d-selfpowered-heterogeneous-ic-three.webp',
      view: 'three',
      alt: 'WaferCAD 3D rendering of a reconstructed heterogeneous M3D chip',
      label: 'WaferCAD final-stage render · open to explore the model',
    },
    summary:
      'Paper-derived, kernel-reconstructed self-powered IC: silicon photovoltaic tier, WSe₂ and MoS₂ logic, graphene sensor, conformal oxides and selective sensing windows. Includes 36 History nodes and 27 stage bookmarks (S00–S26); routing masks are inferred.',
    sources: [
      {
        citation:
          'S. Ghosh et al., “Monolithic three-dimensional integration of heterogeneous electronics for self-powered sensing and processing,” Nature Electronics 9, 775–787 (2026).',
        doi: '10.1038/s41928-026-01624-1',
        href: 'https://doi.org/10.1038/s41928-026-01624-1',
      },
    ],
    tags: ['Literature', 'M3D', 'Graphene', 'WSe₂ / MoS₂', 'Conformal', 'History'],
  },
  {
    id: 'magic-1000-mos2-beol',
    title: 'MoS₂ computer with four-level BEOL interconnect',
    figure: 'Fan et al. · MAGIC-1000 transistor pair / M1–M4',
    kind: 'project',
    level: '2D semiconductor IC literature',
    variants: [],
    path: './examples/magic-1000-mos2-beol.wafercad',
    filename: 'magic-1000-mos2-beol.wafercad',
    previewProject: {
      path: './examples/previews/magic-1000-mos2-beol.wafercad',
      filename: 'magic-1000-mos2-beol-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/magic-1000-mos2-beol-three.webp',
      view: 'three',
      alt: 'WaferCAD reconstruction of MoS2 transistor pair over four aluminium wiring levels',
      label: 'WaferCAD reconstruction · inferred routing masks',
    },
    summary:
      'Kernel-reconstructed representative local MoS₂ D/E-mode transistor pair over four aluminium routing levels with tungsten vias, repeated SiO₂/CMP, planarized tungsten gates, HfO₂ and Sb/Au contacts. Routing is illustrative, not the authors original GDS.',
    sources: [
      {
        citation:
          'D. Fan et al., “A bit-parallel molybdenum disulfide computer built through multi-level co-optimization,” Nature Electronics 9, 887–896 (2026).',
        doi: '10.1038/s41928-026-01641-0',
        href: 'https://doi.org/10.1038/s41928-026-01641-0',
      },
    ],
    tags: ['Literature', 'MoS₂', 'BEOL', 'CMP', 'Four metal layers', 'Reconstruction'],
  },
  {
    id: 'three-tier-silicon-jlfets',
    title: 'Three-tier silicon junctionless transistors',
    figure: 'Lam et al. - Fig. 3 · 625-site wafer array',
    kind: 'project',
    level: '3D transistor literature',
    variants: [],
    path: './examples/three-tier-silicon-jlfets-full-wafer.wafercad',
    filename: 'three-tier-silicon-jlfets-full-wafer.wafercad',
    previewSourcePath: './examples/three-tier-silicon-jlfets.wafercad',
    previewProject: {
      path: './examples/previews/three-tier-silicon-jlfets.wafercad',
      filename: 'three-tier-silicon-jlfets-preview.wafercad',
    },
    preview: { path: './examples/thumbnails/three-tier-silicon-jlfets-three.webp', view: 'three' },
    summary:
      'Three stacked silicon transistor tiers with native conformal HfO2 gates, contact windows, ILD liners and CMP, retained in 40 History Steps. The cover shows one device; Open loads the complete 625-site wafer array. Transfer and SOG/CMP use recorded geometric assumptions.',
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
  {
    id: 'tio2-metalens-four-unit',
    title: 'TiO₂ achromatic metalens · four meta-atoms',
    figure: 'Wang et al. · Fig. 2–3 / Supplementary Note 4',
    kind: 'project',
    level: 'Paper-derived nanophotonics',
    variants: [],
    path: './examples/tio2-metalens-full-array.wafercad',
    filename: 'tio2-metalens-full-array.wafercad',
    previewSourcePath: './examples/tio2-metalens-four-unit-process.wafercad',
    previewProject: {
      path: './examples/previews/tio2-metalens-four-unit.wafercad',
      filename: 'tio2-metalens-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/tio2-metalens-four-unit-schematic.svg',
      view: 'three',
      alt: 'Illustrative schematic of four TiO2 meta-atom cross-sections, not an author GDS image',
      label: 'Schematic only · process verified; XY is illustrative',
    },
    summary:
      'Open loads the complete illustrative 4,725-site array, its matching Mask, nine-step Recipe and compiled History. The cover shows four representative shapes; the actual full-array Run All from Base has passed Kernel replay and storage-quantized geometry acceptance. This is not the authors’ GDS or a verified optical design.',
    sources: [
      {
        citation:
          'Y. Wang et al., “High-efficiency broadband achromatic metalens for near-IR biological imaging window,” Nature Communications 12, 5560 (2021).',
        doi: '10.1038/s41467-021-25797-9',
        href: 'https://doi.org/10.1038/s41467-021-25797-9',
      },
    ],
    tags: ['Literature', 'Metalens', 'TiO₂', 'Lift-off', 'EBL / RIE', 'Illustrative XY'],
  },
  {
    id: 'gan-microchannel-interposer-2022',
    title: 'HR-Si microchannel interposer — unassembled',
    figure: 'Lian et al. · independent workpiece, not bonded',
    kind: 'project',
    level: 'Unassembled GaN device literature',
    variants: [],
    path: './examples/gan-microchannel-interposer-2022.wafercad',
    filename: 'gan-microchannel-interposer-2022.wafercad',
    previewProject: {
      path: './examples/previews/gan-microchannel-interposer-2022.wafercad',
      filename: 'gan-microchannel-interposer-2022-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/gan-microchannel-interposer-2022-schematic.svg',
      view: 'three',
      alt: 'Schematic only: HR-Si interposer; NOT a renderer screenshot',
      label: 'SCHEMATIC ONLY · open native 3D / independent Main',
    },
    summary:
      'Independent 800 µm Si workpiece with four-tier coolant cavities, true TSV geometry and separate Main/History. No wafer Bond, die placement or connecting wires.',
    sources: [
      {
        citation:
          'T. Lian et al., “Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device,” Microsystems & Nanoengineering 8, 119 (2022).',
        doi: '10.1038/s41378-022-00462-3',
        href: 'https://doi.org/10.1038/s41378-022-00462-3',
      },
    ],
    tags: ['Literature', 'GaN', 'Independent Main', 'No Bond', 'Unassembled'],
  },
  {
    id: 'gan-hemt-die-2022',
    title: 'GaN HEMT Die — unassembled',
    figure: 'Lian et al. · independent workpiece, not bonded',
    kind: 'project',
    level: 'Unassembled GaN device literature',
    variants: [],
    path: './examples/gan-hemt-die-2022.wafercad',
    filename: 'gan-hemt-die-2022.wafercad',
    previewProject: {
      path: './examples/previews/gan-hemt-die-2022.wafercad',
      filename: 'gan-hemt-die-2022-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/gan-hemt-die-2022-schematic.svg',
      view: 'three',
      alt: 'Schematic only: GaN HEMT Die; NOT a renderer screenshot',
      label: 'SCHEMATIC ONLY · open native 3D / independent Main',
    },
    summary:
      'Independent GaN-on-SiC Main with ten Gate fingers and explicitly inferred outer source/drain pads. No bonding, die placement or assembly wire.',
    sources: [
      {
        citation:
          'T. Lian et al., “Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device,” Microsystems & Nanoengineering 8, 119 (2022).',
        doi: '10.1038/s41378-022-00462-3',
        href: 'https://doi.org/10.1038/s41378-022-00462-3',
      },
    ],
    tags: ['Literature', 'GaN', 'Independent Main', 'No Bond', 'Unassembled'],
  },
  {
    id: 'gan-gsg-left-die-2022',
    title: 'Left GSG Pad Die — unassembled',
    figure: 'Lian et al. · independent workpiece, not bonded',
    kind: 'project',
    level: 'Unassembled GaN device literature',
    variants: [],
    path: './examples/gan-gsg-left-die-2022.wafercad',
    filename: 'gan-gsg-left-die-2022.wafercad',
    previewProject: {
      path: './examples/previews/gan-gsg-left-die-2022.wafercad',
      filename: 'gan-gsg-left-die-2022-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/gan-gsg-left-die-2022-schematic.svg',
      view: 'three',
      alt: 'Schematic only: Left GSG Die; NOT a renderer screenshot',
      label: 'SCHEMATIC ONLY · open native 3D / independent Main',
    },
    summary:
      'Independent left GSG Die Main with three inferred Au pads. No placement, Bond or Au wire operations.',
    sources: [
      {
        citation:
          'T. Lian et al., “Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device,” Microsystems & Nanoengineering 8, 119 (2022).',
        doi: '10.1038/s41378-022-00462-3',
        href: 'https://doi.org/10.1038/s41378-022-00462-3',
      },
    ],
    tags: ['Literature', 'GaN', 'Independent Main', 'No Bond', 'Unassembled'],
  },
  {
    id: 'gan-gsg-right-die-2022',
    title: 'Right GSG Pad Die — unassembled',
    figure: 'Lian et al. · independent workpiece, not bonded',
    kind: 'project',
    level: 'Unassembled GaN device literature',
    variants: [],
    path: './examples/gan-gsg-right-die-2022.wafercad',
    filename: 'gan-gsg-right-die-2022.wafercad',
    previewProject: {
      path: './examples/previews/gan-gsg-right-die-2022.wafercad',
      filename: 'gan-gsg-right-die-2022-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/gan-gsg-right-die-2022-schematic.svg',
      view: 'three',
      alt: 'Schematic only: Right GSG Die; NOT a renderer screenshot',
      label: 'SCHEMATIC ONLY · open native 3D / independent Main',
    },
    summary:
      'Independent right GSG Die Main with three inferred Au pads. No placement, Bond or Au wire operations.',
    sources: [
      {
        citation:
          'T. Lian et al., “Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device,” Microsystems & Nanoengineering 8, 119 (2022).',
        doi: '10.1038/s41378-022-00462-3',
        href: 'https://doi.org/10.1038/s41378-022-00462-3',
      },
    ],
    tags: ['Literature', 'GaN', 'Independent Main', 'No Bond', 'Unassembled'],
  },
  {
    id: 'gan-hemt-microchannel-2022',
    title: 'GaN package — hypothetical assembly reference only',
    figure: 'Lian et al. · four stepped Si microchannels / 2.5D package',
    kind: 'project',
    level: 'Reference-only hypothetical assembly; no native Bond',
    variants: [],
    path: './examples/gan-hemt-microchannel-2022.wafercad',
    filename: 'gan-hemt-microchannel-2022.wafercad',
    previewProject: {
      path: './examples/previews/gan-hemt-microchannel-2022.wafercad',
      filename: 'gan-hemt-microchannel-2022-preview.wafercad',
    },
    preview: {
      path: './examples/thumbnails/gan-hemt-microchannel-2022-three.webp',
      view: 'three',
      alt: 'WaferCAD 3D geometry reconstruction of four stepped cooling channels under GaN-on-SiC HEMT',
      label: 'Paper-derived geometric surrogate · not a thermal simulation',
    },
    summary:
      'HISTORICAL GEOMETRY-ONLY ASSEMBLY REFERENCE. This combined 3D surrogate places the HEMT and two GSG dies over the Si interposer and draws two inferred Au wire loops. The project History is NOT a real Bond or die-placement process. Use the four separate unassembled Main projects as future assembly inputs.',
    sources: [
      {
        citation:
          'T. Lian et al., “Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device,” Microsystems & Nanoengineering 8, 119 (2022).',
        doi: '10.1038/s41378-022-00462-3',
        href: 'https://doi.org/10.1038/s41378-022-00462-3',
      },
    ],
    tags: ['Reference only', 'GaN HEMT', 'NO Bond', 'Microfluidics', 'Surrogate'],
  },
]);

export function bundledExampleById(id) {
  return BUNDLED_EXAMPLES.find((example) => example.id === id) || null;
}
