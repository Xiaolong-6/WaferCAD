"""Build the ACS Photonics B-implanted photodiode as a WaferCAD project.

The input layout remains local.  The generated project preserves mask layers
1–5, creates process snapshots, and uses layer 1 as a shallow planar b-Si
placeholder instead of attempting to model its nanostructure.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import gdstk


ALIASES = {
    1: "B-Si opening",
    2: "Implantation opening",
    3: "Active-area opening",
    4: "Al etch",
    5: "Al2O3 etch",
}
COLORS = {1: "#dc2626", 2: "#059669", 3: "#7c3aed", 4: "#d97706", 5: "#0891b2"}


def _point_line_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def _rdp(values: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(values) <= 2:
        return values
    distances = [_point_line_distance(point, values[0], values[-1]) for point in values[1:-1]]
    if not distances or max(distances) <= tolerance:
        return [values[0], values[-1]]
    split = distances.index(max(distances)) + 1
    return _rdp(values[: split + 1], tolerance)[:-1] + _rdp(values[split:], tolerance)


def points(polygon: gdstk.Polygon, simplify: bool = False) -> list[list[float]]:
    values = [(float(x), float(y)) for x, y in polygon.points]
    if simplify and len(values) > 12:
        center_x = sum(x for x, _ in values) / len(values)
        center_y = sum(y for _, y in values) / len(values)
        start = max(range(len(values)), key=lambda index: (values[index][0] - center_x) ** 2 + (values[index][1] - center_y) ** 2)
        values = values[start:] + values[:start]
        reduced = _rdp(values + [values[0]], 1.0)
        if reduced[-1] == reduced[0]:
            reduced.pop()
        if len(reduced) >= 3:
            values = reduced
    return [[round(x, 6), round(y, 6)] for x, y in values]


def bbox(polygons: list[gdstk.Polygon]) -> list[float]:
    boxes = [polygon.bounding_box() for polygon in polygons]
    return [
        float(min(box[0][0] for box in boxes)),
        float(min(box[0][1] for box in boxes)),
        float(max(box[1][0] for box in boxes)),
        float(max(box[1][1] for box in boxes)),
    ]


def boolean(left: list[gdstk.Polygon], right: list[gdstk.Polygon], operation: str) -> list[gdstk.Polygon]:
    return list(gdstk.boolean(left, right, operation, precision=1e-4) or [])


def solids_for(layer_id: str, material: str, regions: list[gdstk.Polygon], z_min: float, z_max: float, side: str = "front", simplify: bool = False) -> list[dict[str, Any]]:
    return [
        {
            "id": f"solid-{layer_id}-{index}",
            "layerId": layer_id,
            "side": side,
            "material": material,
            "footprint": points(region, simplify=simplify),
            "zMin": z_min,
            "zMax": z_max,
            "sourceFaceId": None,
            "wholeFace": False,
            "profile": "vertical",
            "lateralRadius": 0,
        }
        for index, region in enumerate(regions)
    ]


def doping_for(layer_id: str, target: str, dopant: str, regions: list[gdstk.Polygon], z_min: float, z_max: float, position: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"doping-{layer_id}-{index}",
            "layerId": layer_id,
            "targetLayerId": target,
            "dopant": dopant,
            "position": position,
            "depth": z_max - z_min,
            "footprint": points(region),
            "zMin": z_min,
            "zMax": z_max,
        }
        for index, region in enumerate(regions)
    ]


def snapshot_device(wafer: dict[str, Any], solids: list[dict[str, Any]], cuts: list[dict[str, Any]], dopings: list[dict[str, Any]], visuals: dict[str, Any]) -> dict[str, Any]:
    return {
        "wafer": copy.deepcopy(wafer),
        "activeFace": "front",
        "solids": copy.deepcopy(solids),
        "cuts": copy.deepcopy(cuts),
        "dopings": copy.deepcopy(dopings),
        "layerVisuals": copy.deepcopy(visuals),
        "imprintedFaces": [],
    }


def build_project(source: Path, bsi_depth: float) -> dict[str, Any]:
    library = gdstk.read_oas(source) if source.suffix.lower() in {".oas", ".oasis"} else gdstk.read_gds(source)
    top_cells = library.top_level()
    if len(top_cells) != 1:
        raise ValueError(f"Expected one top cell, found {len(top_cells)}")
    top = top_cells[0]
    grouped: dict[tuple[int, int], list[gdstk.Polygon]] = {}
    for polygon in top.get_polygons():
        grouped.setdefault((polygon.layer, polygon.datatype), []).append(polygon)
    missing = [layer for layer in ALIASES if (layer, 0) not in grouped]
    if missing:
        raise ValueError(f"Missing required layer(s): {missing}")
    if len(grouped[(1, 0)]) != 51:
        raise ValueError(f"Expected B-Si layer 1/0 to contain 51 raw polygons, found {len(grouped[(1, 0)])}")

    wafer_polygon = gdstk.ellipse((0, 0), 50_000, tolerance=5)
    wafer_regions = [wafer_polygon]
    masks = {layer: boolean(grouped[(layer, 0)], wafer_regions, "and") for layer in ALIASES}
    bsi = boolean(masks[1], [], "or")
    implantation = boolean(masks[2], [], "or")
    oxide_openings = boolean(bsi + implantation, [], "or")
    oxide = boolean(wafer_regions, oxide_openings, "not")
    planar_implant = boolean(implantation, bsi, "not")
    lowered_implant = boolean(implantation, bsi, "and")
    # Layer 4 is the retained resist geometry for the Al etch level.  Keeping
    # the source components avoids an expensive and unnecessary Boolean
    # against the very dense active-area artwork.
    front_al = masks[4]
    al2o3_retained = boolean(masks[5], bsi, "and")
    if not al2o3_retained:
        al2o3_retained = bsi

    wafer = {
        "shape": "circle",
        "diameter": 100_000,
        "thickness": 350,
        "material": "n- Si (FZ, >10 kOhm cm, (111))",
        "displayUnits": {"lateral": "mm", "thickness": "um"},
        "edgeFeature": "none",
    }
    visuals = {
        "substrate": {"name": "Substrate · n− Si FZ (111)", "color": "#9ca3af", "scale": 1},
        "oxide": {"name": "Front · SiO₂ · 650 nm thermal", "color": "#93c5fd", "scale": 1},
        "pplus": {"name": "Front · p+ boron · 1.5 µm", "color": "#dc2626", "scale": 1, "gradient": True},
        "nplus": {"name": "Back · n+ phosphorus · assumed 1.5 µm", "color": "#2563eb", "scale": 1, "gradient": True},
        "al2o3": {"name": "Front · Al₂O₃ · 50 nm ALD", "color": "#22d3ee", "scale": 1},
        "front-al": {"name": "Front · Al contact · 300 nm", "color": "#d1d5db", "scale": 1},
        "rear-al": {"name": "Back · Al contact · 1000 nm", "color": "#6b7280", "scale": 1},
    }

    oxide_solids = solids_for("oxide", "SiO2", oxide, 0, 0.65)
    cuts = [
        {
            "id": f"cut-bsi-{index}",
            "side": "front",
            "footprint": points(region),
            "zMin": -bsi_depth,
            "zMax": 0,
            "sourceFaceId": None,
            "target": "substrate",
            "wholeFace": False,
            "profile": "vertical",
            "lateralRadius": 0,
            "partitionBatchId": "paper-bsi-placeholder",
        }
        for index, region in enumerate(bsi)
    ]
    front_doping = doping_for("pplus", "substrate", "Boron (p+)", planar_implant, -1.5, 0, "upper")
    front_doping += doping_for("pplus", "substrate", "Boron (p+)", lowered_implant, -bsi_depth - 1.5, -bsi_depth, "upper")
    rear_doping = doping_for("nplus", "substrate", "Phosphorus (n+)", wafer_regions, -350, -348.5, "lower")
    passivation = solids_for("al2o3", "Al2O3", al2o3_retained, -bsi_depth, -bsi_depth + 0.05)
    front_contacts = solids_for("front-al", "Al", front_al, 0, 0.3, simplify=True)
    rear_contact = solids_for("rear-al", "Al", wafer_regions, -351, -350, "back")

    stages = [
        ("01 · Starting 4-inch n− FZ Si wafer", [], [], []),
        ("02 · 650 nm front thermal SiO₂", oxide_solids, [], []),
        (f"03 · B-Si placeholder push down {bsi_depth:.2f} µm · layer 1/0", oxide_solids, cuts, []),
        ("04 · B front / P rear implantation · 1.5 µm model", oxide_solids, cuts, front_doping + rear_doping),
        ("05 · 50 nm Al₂O₃ active-area passivation", oxide_solids + passivation, cuts, front_doping + rear_doping),
        ("06 · Final 300 nm front / 1000 nm rear Al contacts", oxide_solids + passivation + front_contacts + rear_contact, cuts, front_doping + rear_doping),
    ]
    snapshot_devices: dict[str, Any] = {}
    snapshots = []
    created = datetime.now(timezone.utc).isoformat()
    for index, (name, stage_solids, stage_cuts, stage_dopings) in enumerate(stages, start=1):
        key = f"paper-process-step-{index}"
        snapshot_devices[key] = snapshot_device(wafer, stage_solids, stage_cuts, stage_dopings, visuals)
        snapshots.append({"id": f"paper-step-{index}", "name": name, "created": created, "deviceRef": key, "thumbRef": None, "camera": None})

    gds_layers = []
    all_bbox = None
    for layer in ALIASES:
        source_polygons = grouped[(layer, 0)]
        layer_bbox = bbox(source_polygons)
        all_bbox = layer_bbox if all_bbox is None else [
            min(all_bbox[0], layer_bbox[0]), min(all_bbox[1], layer_bbox[1]),
            max(all_bbox[2], layer_bbox[2]), max(all_bbox[3], layer_bbox[3]),
        ]
        gds_layers.append({
            "key": f"{layer}/0",
            "layer": layer,
            "datatype": 0,
            "name": ALIASES[layer],
            "alias": ALIASES[layer],
            "count": len(source_polygons),
            "bbox": layer_bbox,
            "polygons": [points(polygon, simplify=True) for polygon in source_polygons],
            "visible": True,
            "color": COLORS[layer],
            "fillPattern": False,
            "mirrored": False,
        })

    final_solids, final_cuts, final_dopings = stages[-1][1:]
    return {
        "format": "wafercad-mvp",
        "version": 8,
        "wafer": wafer,
        "activeFace": "front",
        "solids": final_solids,
        "cuts": final_cuts,
        "dopings": final_dopings,
        "layerVisuals": visuals,
        "gds": {
            "filename": source.name,
            "bbox": all_bbox,
            "layers": gds_layers,
            "topCells": [top.name],
            "activeTopCell": top.name,
            "hierarchy": [],
            "maskPolarity": "transmit",
            "truncated": False,
            "polygonLimit": 20_000,
            "committedProjection": None,
            "transform": {"offsetX": 0, "offsetY": 0, "rotationDeg": 0, "scale": 1},
        },
        "imprintedFaces": [],
        "slice": {"a": {"x": -6_000, "y": 0}, "b": {"x": 6_000, "y": 0}},
        "snapshots": snapshots,
        "snapshotDevices": snapshot_devices,
        "snapshotThumbnails": {},
        "view": {"zExag": 8, "zMapping": "relative", "showAxes": False, "maskBaseOpacity": 0.2, "sectionBreak": {"enabled": True, "mode": "surfaces", "frontKeep": 5, "backKeep": 5, "from": -345, "to": -5}},
        "processModel": {
            "title": "Boron-implanted black-silicon photodiode",
            "source": "https://doi.org/10.1021/acsphotonics.2c01984",
            "maskLayerMap": {str(layer): alias for layer, alias in ALIASES.items()},
            "assumptions": [
                f"Black silicon nanostructure is replaced by a {bsi_depth:.2f} µm planar push-down on layer 1/0.",
                "The paper does not specify rear phosphorus junction depth; 1.5 µm is used for visualization.",
                "Thermal cycles, implantation dose profiles, sidewall shape, and material-selective etch rates are metadata rather than full physics.",
            ],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="B-doped detector OASIS/GDS mask")
    parser.add_argument("output", type=Path, help="Output WaferCAD project JSON")
    parser.add_argument("--bsi-depth", type=float, default=0.5, help="Planar b-Si placeholder depth in µm")
    args = parser.parse_args()
    if args.bsi_depth <= 0:
        parser.error("--bsi-depth must be positive")
    project = build_project(args.source.resolve(), args.bsi_depth)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(project, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output.resolve()),
        "solids": len(project["solids"]),
        "cuts": len(project["cuts"]),
        "dopings": len(project["dopings"]),
        "snapshots": len(project["snapshots"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
