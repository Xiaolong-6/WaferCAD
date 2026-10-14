"""Independent KLayout verification of M3D-LIME's *inferred* 11-layer mask.

Inputs are downloaded by the actual WaferCAD v2 browser, not fabricated here.
This tests KLayout's geometry reader and never claims equivalence to author GDS.
"""
import json
import pathlib
import sys

import klayout.db as kdb

root = pathlib.Path(sys.argv[1])
expected_counts = {**{layer: 8 for layer in range(11, 15)},
                   **{layer: 14 for layer in range(15, 22)}}


def read_mask(filename):
    layout = kdb.Layout()
    layout.read(str(root / filename))
    cells = list(layout.top_cells())
    assert len(cells) == 1, f"{filename}: expected a single inferred mask top cell"
    top = cells[0]
    assert layout.dbu <= 0.001000001, (
        f"{filename}: DBU must resolve 1 nm; found {layout.dbu} um")
    polys = {}
    for layer, expected in expected_counts.items():
        index = layout.find_layer(layer, 0)
        assert index is not None and index >= 0, f"{filename}: missing {layer}/0"
        raw = list(top.shapes(index).each())
        assert len(raw) == expected, (
            f"{filename}: {layer}/0 has {len(raw)} shapes, expected {expected}")
        assert all(shape.is_box() or shape.is_polygon() for shape in raw), (
            f"{filename}: {layer}/0 has non-polygon geometry")
        polys[layer] = (
            kdb.Region(top.begin_shapes_rec(index)),
            [shape.bbox() for shape in raw],
        )
    others = [(layout.get_info(i).layer, layout.get_info(i).datatype)
              for i in layout.layer_indexes()
              if not top.shapes(i).is_empty()
              and (layout.get_info(i).layer, layout.get_info(i).datatype)
              not in {(layer, 0) for layer in expected_counts}]
    assert not others, f"{filename}: unexpected layers {others}"
    assert sum(len(entry[1]) for entry in polys.values()) == 130
    return layout, polys


def aligned_contacts(polys, dbu, filename):
    # A buffer channel is at y=24..44 um and x=-42..-39.4 um.
    # Mask coordinates are explicitly inferred; only active W/L is sourced.
    def boxes(layer, ymin=23.99, ymax=24.01):
        return [box for box in polys[layer][1]
                if ymin <= box.bottom * dbu <= ymax]

    channels, sources, drains, gates = (
        boxes(16), boxes(17), boxes(18), boxes(15)
    )
    rrams = boxes(19, 28.99, 29.01)
    # Four buffer transistors share this Y interval, select leftmost.
    for label, rects in [('island', channels), ('source', sources),
                         ('drain', drains), ('gate', gates), ('rram', rrams)]:
        assert len(rects) == 4, f"{filename}: {label} must include 4 buffer FETs"
    channel = min(channels, key=lambda b: b.left)
    source = min(sources, key=lambda b: b.left)
    drain = min(drains, key=lambda b: b.left)
    gate = min(gates, key=lambda b: b.left)
    rram = min(rrams, key=lambda b: b.left)
    close = lambda actual, target: abs(actual - target) <= dbu + 1e-9
    assert close((channel.top - channel.bottom) * dbu, 20.0), (
        f"{filename}: CNTFET width is not 20um")
    assert close((drain.left - source.right) * dbu, 2.0), (
        f"{filename}: CNTFET active S/D length is not 2um")
    assert close((source.right - channel.left) * dbu, 0.3), (
        f"{filename}: source overlap not retained")
    assert close((channel.right - drain.left) * dbu, 0.3), (
        f"{filename}: drain overlap not retained")
    assert gate.left <= source.right and gate.right >= drain.left, (
        f"{filename}: gate does not cover the active region")
    assert close((rram.left - channel.right) * dbu, 0.45), (
        f"{filename}: Ta2O5 RRAM must be laterally separated from active CNT")
    assert drain.left <= rram.left and rram.right <= drain.right, (
        f"{filename}: digital RRAM must physically land on Pd drain/BE")
    return {'channel_width_um': (channel.top - channel.bottom) * dbu,
            'active_length_um': (drain.left - source.right) * dbu,
            'inferred_overlap_um': (source.right - channel.left) * dbu,
            'rram_lateral_clearance_um': (rram.left - channel.right) * dbu}


gds, gds_layers = read_mask("full-inferred-mask.gds")
oas, oas_layers = read_mask("full-inferred-mask.oas")
# GDSII and OASIS may store the same micrometre geometry in *different*
# database units. Never XOR raw integer Regions across unequal DBU grids.
def physical_rectangles_um_to_nm(boxes, dbu):
    return sorted(tuple(round(coordinate * dbu * 1000)
                        for coordinate in (box.left, box.bottom, box.right, box.top))
                  for box in boxes)


for layer in expected_counts:
    gds_polygons = physical_rectangles_um_to_nm(gds_layers[layer][1], gds.dbu)
    oas_polygons = physical_rectangles_um_to_nm(oas_layers[layer][1], oas.dbu)
    assert gds_polygons == oas_polygons, (
        f"KLayout found a 1nm physical-coordinate difference on {layer}/0; "
        f"GDS DBU={gds.dbu}, OAS DBU={oas.dbu}")
gds_geom = aligned_contacts(gds_layers, gds.dbu, "GDS")
oas_geom = aligned_contacts(oas_layers, oas.dbu, "OAS")
report = {
    'passed': True,
    'reader': 'KLayout Python 0.30.12',
    'scope': 'inferred local masks, not original foundry GDS',
    'layers': len(expected_counts),
    'rectangles': sum(expected_counts.values()),
    'gds_dbu_um': gds.dbu,
    'oas_dbu_um': oas.dbu,
    'gds': gds_geom,
    'oas': oas_geom,
}
out = root.parent / "klayout-m3d-lime.json"
out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
