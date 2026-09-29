export const KLAYOUT_SAMPLES = [
  {
    id: 'gds-alm',
    label: 'GDS · transforms (alm.gds)',
    path: './samples/klayout/gds-alm.gds',
    source: 'testdata/gds/alm.gds',
  },
  {
    id: 'gds-arefs',
    label: 'GDS · arrays (arefs.gds)',
    path: './samples/klayout/gds-arefs.gds',
    source: 'testdata/gds/arefs.gds',
  },
  {
    id: 'gds-basic-instances',
    label: 'GDS · hierarchy (basic_instances.gds)',
    path: './samples/klayout/gds-basic-instances.gds',
    source: 'testdata/gds/basic_instances.gds',
  },
  {
    id: 'oas-rectangles',
    label: 'OASIS · rectangles (t4.2)',
    path: './samples/klayout/oas-rectangles.oas',
    source: 'testdata/oasis/t4.2.oas',
  },
  {
    id: 'oas-polygons',
    label: 'OASIS · polygons (t5.3)',
    path: './samples/klayout/oas-polygons.oas',
    source: 'testdata/oasis/t5.3.oas',
  },
  {
    id: 'oas-paths',
    label: 'OASIS · paths (t6.1)',
    path: './samples/klayout/oas-paths.oas',
    source: 'testdata/oasis/t6.1.oas',
  },
  {
    id: 'oas-trapezoids',
    label: 'OASIS · trapezoids (t7.1)',
    path: './samples/klayout/oas-trapezoids.oas',
    source: 'testdata/oasis/t7.1.oas',
  },
  {
    id: 'oas-placements',
    label: 'OASIS · placements (t8.8)',
    path: './samples/klayout/oas-placements.oas',
    source: 'testdata/oasis/t8.8.oas',
  },
  {
    id: 'oas-ctrapezoids',
    label: 'OASIS · compact trapezoids (t9.1)',
    path: './samples/klayout/oas-ctrapezoids.oas',
    source: 'testdata/oasis/t9.1.oas',
  },
  {
    id: 'oas-circles',
    label: 'OASIS · circles (t12.1)',
    path: './samples/klayout/oas-circles.oas',
    source: 'testdata/oasis/t12.1.oas',
  },
  {
    id: 'oas-cblock',
    label: 'OASIS · CBLOCK (t14.1)',
    path: './samples/klayout/oas-cblock.oas',
    source: 'testdata/oasis/t14.1.oas',
  },
];

export function sampleById(id) {
  return KLAYOUT_SAMPLES.find((sample) => sample.id === id) || null;
}
