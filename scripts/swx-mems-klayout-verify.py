"""Independent KLayout verification of real WaferCAD SWX browser exports.

Unlike the browser acceptance's built-in GDS/OAS parsers, this test reads
both formats through the pinned third-party KLayout database engine and
compares exact Boolean geometry on each format's native export database grid.
"""

import json
import math
from pathlib import Path
import sys

import klayout.db as kdb

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "test-results/swx-mems")
CANDIDATE = len(sys.argv) > 2 and sys.argv[2] == "compact"
PROJECT = ROOT / ("swx-compact-candidate.wafercad" if CANDIDATE else "swx-photonic-mems.wafercad")
BROWSER = ROOT / "browser"
REPORT = ROOT / "klayout-independent-verification.json"
GDS_DBU_UM = 0.0001
OAS_DBU_UM = 0.00005

project = json.loads(PROJECT.read_text(encoding="utf-8"))
source = project["layout"]
assert source["units"]["xy"] == "µm", "Source mask lost physical micrometre units"
assert source["root"] == "SWX_MEMS_UNIT", "Unexpected physical mask root"
assert source["elements"], "Source mask is empty"
expected_layers = {
    (int(item["layer"]), int(item.get("datatype", 0)))
    for item in source["elements"]
}
assert expected_layers == {(1, 0), (2, 0), (3, 0)}, (
    f"Unexpected original layer/datatype set: {expected_layers}"
)


def quantize(value, dbu):
    # Equivalent to JS Math.round for positive and negative XY coordinates,
    # avoiding Python's ties-to-even convention.
    return math.floor(float(value) / dbu + 0.5)


def canonical_regions(dbu):
    result = {layer: kdb.Region() for layer in expected_layers}
    for element in source["elements"]:
        assert element["kind"] == "polygon", "Unexpected non-polygon source element"
        layer = (int(element["layer"]), int(element.get("datatype", 0)))
        points = [
            kdb.Point(quantize(x, dbu), quantize(y, dbu))
            for x, y in element["points"]
        ]
        polygon = kdb.Polygon(points)
        if polygon.area() <= 0:
            raise AssertionError(
                f"Source layer {layer}: polygon collapses at {dbu} um DBU"
            )
        result[layer].insert(polygon)
    for region in result.values():
        region.merge()
    return result


def exported_regions(file_path):
    layout = kdb.Layout()
    layout.read(str(file_path))
    tops = list(layout.top_cells())
    if len(tops) != 1:
        raise AssertionError(f"{file_path.name}: expected one top cell, got {len(tops)}")
    top = tops[0]
    dbu = layout.dbu
    native_dbu = GDS_DBU_UM if file_path.suffix == ".gds" else OAS_DBU_UM
    if not math.isclose(dbu, native_dbu, rel_tol=0, abs_tol=1e-10):
        raise AssertionError(
            f"{file_path.name}: physical DBU {dbu} um differs from the "
            f"expected native {native_dbu} um export grid"
        )
    present = {}
    for index in layout.layer_indexes():
        layer_info = layout.get_info(index)
        region = kdb.Region(top.begin_shapes_rec(index))
        region.merge()
        if not region.is_empty():
            present[(layer_info.layer, layer_info.datatype)] = region
    if set(present) != expected_layers:
        raise AssertionError(
            f"{file_path.name}: expected {sorted(expected_layers)} but found "
            f"{sorted(present)}"
        )
    return top.name, dbu, present


results = []
baseline_by_format = {}
for state in ("off", "on"):
    for extension in ("gds", "oas"):
        filename = BROWSER / f"{'compact' if CANDIDATE else 'swx'}-{state}.{extension}"
        assert filename.is_file(), f"Missing actual browser export: {filename}"
        top_name, dbu, actual = exported_regions(filename)
        expected = canonical_regions(dbu)
        layers = []
        for layer in sorted(expected_layers):
            delta = expected[layer] ^ actual[layer]
            if not delta.is_empty():
                raise AssertionError(
                    f"{filename.name}: layer {layer} differs from source Mask by "
                    f"{delta.area() * dbu * dbu:.10g} um^2 "
                    f"(independent KLayout XOR; zero difference required)"
                )
            layers.append(
                {
                    "layer": list(layer),
                    "area_um2": actual[layer].area() * dbu * dbu,
                    "physical_bbox_dbu": str(actual[layer].bbox()),
                }
            )
        signature = [(layer, str(actual[layer].bbox()), actual[layer].area())
                     for layer in sorted(expected_layers)]
        if extension in baseline_by_format and signature != baseline_by_format[extension]:
            raise AssertionError(
                f"{filename.name}: mask bounds/areas changed between OFF and ON"
            )
        baseline_by_format[extension] = signature
        results.append(
            {
                "file": str(filename),
                "state": state.upper(),
                "format": extension.upper(),
                "top_cell": top_name,
                "dbu_um": dbu,
                "layers": layers,
                "exact_source_boolean_parity": True,
            }
        )

summary = {
    "pass": True,
    "engine": "KLayout 0.30.12 Python database API",
    "candidate_mode": CANDIDATE,
    "source": str(PROJECT),
    "source_root": source["root"],
    "source_polygons": len(source["elements"]),
    "files_verified": len(results),
    "independent_boolean_xor": "empty on the format-native grid for each layer and file",
    "results": results,
}
REPORT.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "pass": True,
    "engine": summary["engine"],
    "files_verified": len(results),
    "source_polygons": len(source["elements"]),
    "layer_count": len(expected_layers),
}))
