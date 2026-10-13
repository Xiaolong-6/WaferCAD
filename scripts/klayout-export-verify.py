import json
import pathlib
import sys

import klayout.db as kdb

root = pathlib.Path(sys.argv[1])
expected_layers = {(1, 0), (7, 3), (4, 2)}
results = []


def assert_exact_rectangle(layout, top, layer, corners_um, filename):
    layer_index = layout.find_layer(*layer)
    if layer_index is None or layer_index < 0:
        raise AssertionError(f"{filename}: missing rectangle layer {layer}")
    dbu = layout.dbu
    x0, y0, x1, y1 = (round(value / dbu) for value in corners_um)
    expected = kdb.Region(kdb.Box(x0, y0, x1, y1))
    actual = kdb.Region(top.begin_shapes_rec(layer_index))
    if not (actual ^ expected).is_empty():
        raise AssertionError(
            f"{filename}: layer {layer} differs from the exact physical polygon "
            f"{corners_um} um; expected area {expected.area() * dbu * dbu}, "
            f"actual area {actual.area() * dbu * dbu}"
        )
    return {
        "layer": list(layer),
        "corners_um": list(corners_um),
        "area_um2": actual.area() * dbu * dbu,
    }


for name in ("wafercad-export.gds", "wafercad-export.oas"):
    path = root / name
    layout = kdb.Layout()
    layout.read(str(path))
    top_cells = list(layout.top_cells())
    if len(top_cells) != 1:
        raise SystemExit(f"{name}: expected one top cell, got {len(top_cells)}")
    top = top_cells[0]
    present_layers = {
        (info.layer, info.datatype)
        for index in layout.layer_indexes()
        for info in [layout.get_info(index)]
        if not top.shapes(index).is_empty()
    }
    missing = expected_layers - present_layers
    if missing:
        raise SystemExit(f"{name}: missing exported layers {sorted(missing)}")
    bbox = top.bbox()
    if bbox.width() <= 0 or bbox.height() <= 0:
        raise SystemExit(f"{name}: empty top-cell bbox")
    width_um = bbox.width() * layout.dbu
    height_um = bbox.height() * layout.dbu
    if width_um < 18 or height_um < 15:
        raise SystemExit(
            f"{name}: unexpected bbox {width_um:.6f} x {height_um:.6f} um"
        )
    exact_polygons = [
        assert_exact_rectangle(layout, top, (1, 0), (-5, -4, 7, 6), name),
        assert_exact_rectangle(layout, top, (7, 3), (10, 2, 14, 8), name),
    ]
    results.append(
        {
            "exact_polygons": exact_polygons,
            "file": name,
            "top_cell": top.name,
            "layers": sorted([list(item) for item in present_layers]),
            "bbox_um": [width_um, height_um],
            "dbu_um": layout.dbu,
        }
    )

large_path = root / "wafercad-export-large-layer.oas"
large_layout = kdb.Layout()
large_layout.read(str(large_path))
large_top = list(large_layout.top_cells())[0]
large_layers = {
    (info.layer, info.datatype)
    for index in large_layout.layer_indexes()
    for info in [large_layout.get_info(index)]
    if not large_top.shapes(index).is_empty()
}
if (40000, 17) not in large_layers:
    raise SystemExit(
        f"{large_path.name}: expected OASIS layer/datatype 40000/17, got {sorted(large_layers)}"
    )
large_exact_polygon = assert_exact_rectangle(
    large_layout, large_top, (40000, 17), (0, 0, 6, 4), large_path.name
)
results.append(
    {
        "exact_polygons": [large_exact_polygon],
        "file": large_path.name,
        "top_cell": large_top.name,
        "layers": sorted([list(item) for item in large_layers]),
        "bbox_um": [
            large_top.bbox().width() * large_layout.dbu,
            large_top.bbox().height() * large_layout.dbu,
        ],
        "dbu_um": large_layout.dbu,
    }
)

print(json.dumps({"results": results}))
