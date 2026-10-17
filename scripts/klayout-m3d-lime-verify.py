"""Independent KLayout verification of M3D-LIME's *inferred* 12-layer mask.

Inputs are downloaded by the actual WaferCAD v2 browser, not fabricated here.
This tests KLayout's geometry reader and never claims equivalence to author GDS.
"""
import json
import pathlib
import sys

import klayout.db as kdb

root = pathlib.Path(sys.argv[1])
expected_counts = {**{layer: 8 for layer in range(11, 15)},
                   **{layer: 15 for layer in range(15, 19)},
                   **{layer: 14 for layer in range(19, 21)},
                   21: 21, 22: 1}


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
    assert sum(len(entry[1]) for entry in polys.values()) == 142
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
def isolated_precharge(polys, dbu, filename):
    # Separate Fig. 3b ML pre-charge FET: 15th CNTFET, no 15th RRAM.
    # Coordinates are explicitly inferred and do not prove ML wiring.
    def physical(box):
        return tuple(round(value * dbu * 1000) for value in (
            box.left, box.bottom, box.right, box.top))
    channel = polys[16][1][-1]
    gate = polys[15][1][-1]
    source = polys[17][1][-1]
    drain = polys[18][1][-1]
    # Do not assume export ordering is source ordering: locate by XY bounding box.
    candidates = [box for box in polys[16][1]
                  if physical(box) == (44000, -25000, 46600, -5000)]
    assert len(candidates) == 1, f"{filename}: missing inferred pre-charge CNT island"
    channel = candidates[0]
    assert not any(r.bbox().overlaps(channel) for r in [polys[19][0]]), (
        f"{filename}: pre-charge overlaps a fabricated RRAM")
    assert any(physical(b) == (43750, -25000, 46850, -5000)
               for b in polys[15][1]), f"{filename}: pre-charge gate missing"
    assert any(physical(b) == (43100, -25000, 44300, -5000)
               for b in polys[17][1]), f"{filename}: pre-charge source missing"
    assert any(physical(b) == (46300, -25000, 48100, -5000)
               for b in polys[18][1]), f"{filename}: pre-charge drain missing"
    return {'bbox_nm': list(physical(channel)), 'has_rram': False}


def verify_inferred_ml(polys, dbu, filename):
    """Separate buffer/T-CAM metal components; ensure ML terminates on drain via."""
    def physical(box):
        return tuple(round(value * dbu * 1000) for value in (
            box.left, box.bottom, box.right, box.top))
    metal = polys[21][1]
    via = polys[22][1]
    assert len(metal) == 21 and len(via) == 1
    assert physical(via[0]) == (47000, -14500, 47400, -13500), (
        f"{filename}: incorrect pre-charge drain contact opening")
    assert any(physical(b) == (-38700, -2000, 47400, -1000)
               for b in metal), f"{filename}: absent TCAM ML bus"
    assert any(physical(b) == (47000, -15000, 47400, -1000)
               for b in metal), f"{filename}: absent pre-charge drain spur"
    def touches(a, b):
        return (a.left <= b.right and b.left <= a.right and
                a.bottom <= b.top and b.bottom <= a.top)
    # Do not rely on shape order from external GDS/OAS import.
    roots = [i for i, b in enumerate(metal)
             if 30000 <= physical(b)[1] <= 38000 and
             physical(b)[3] == 38000]
    assert len(roots) == 4, f"{filename}: expected exactly four buffer stubs"
    seen = set()
    components = []
    for seed in range(len(metal)):
        if seed in seen:
            continue
        component = {seed}
        frontier = [seed]
        seen.add(seed)
        while frontier:
            current = frontier.pop()
            for i, candidate in enumerate(metal):
                if i not in seen and touches(metal[current], candidate):
                    seen.add(i)
                    component.add(i)
                    frontier.append(i)
        components.append(component)
    assert sorted(len(c) for c in components) == [1, 1, 1, 1, 17], (
        f"{filename}: ML must connect ten TCAM Pt electrodes and isolate 4 buffer stubs")
    ml = next(c for c in components if len(c) == 17)
    assert not any(i in ml for i in roots), (
        f"{filename}: buffer RRAM top contact shorted into Match Line")
    # The five tall ML trunks span -27..15um, so matching only their
    # lower/upper Y values would incorrectly classify them as ten Pt
    # electrode stubs. Restrict the endpoint cohort to 8um-high pads.
    tcam = [i for i, b in enumerate(metal)
            if physical(b)[1] in (-27000, 7000)
            and physical(b)[3] - physical(b)[1] == 8000]
    assert len(tcam) == 10 and all(i in ml for i in tcam), (
        f"{filename}: one or more TCAM RRAM top electrodes not wired to ML")
    assert any(touches(via[0], metal[i]) for i in ml), (
        f"{filename}: ML does not touch the pre-charge DRAIN via")
    return {'connected_tcam_contacts': 10, 'isolated_buffer_contacts': 4,
            'precharge_via_bbox_nm': list(physical(via[0])), 'ml_segments': 17}


gds_geom = aligned_contacts(gds_layers, gds.dbu, "GDS")
oas_geom = aligned_contacts(oas_layers, oas.dbu, "OAS")
gds_precharge = isolated_precharge(gds_layers, gds.dbu, "GDS")
oas_precharge = isolated_precharge(oas_layers, oas.dbu, "OAS")
gds_ml = verify_inferred_ml(gds_layers, gds.dbu, "GDS")
oas_ml = verify_inferred_ml(oas_layers, oas.dbu, "OAS")
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
    'gds_precharge': gds_precharge,
    'oas_precharge': oas_precharge,
    'gds_ml': gds_ml,
    'oas_ml': oas_ml,
}
out = root.parent / "klayout-m3d-lime.json"
out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
