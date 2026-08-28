from __future__ import annotations

import math
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
THREE = ROOT / "node_modules" / "three"

app = FastAPI(title="WaferCAD MVP", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
if THREE.is_dir():
    app.mount("/vendor/three", StaticFiles(directory=THREE), name="three")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    try:
        import gdstk  # noqa: F401
        gds = True
    except Exception:
        gds = False
    return {"ok": True, "gdstk": gds}


def _bbox(points: list[list[float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _merge_bbox(a: list[float] | None, b: list[float]) -> list[float]:
    if a is None:
        return b[:]
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


class PolygonIntersectionRequest(BaseModel):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    clip: list[list[float]] = Field(min_length=3)


class MaskRegionsRequest(BaseModel):
    mask: list[list[list[float]]] = Field(max_length=20000)
    substrate: list[list[float]] = Field(min_length=3)
    invert: bool = False


class PolygonOffsetRequest(BaseModel):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    distance: float = Field(gt=0)
    clip: list[list[float]] = Field(min_length=3)


class PolygonSplitRequest(BaseModel):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    masks: list[list[list[float]]] = Field(max_length=20000)


class PolygonSubjectsRequest(BaseModel):
    subjects: list[list[list[float]]] = Field(max_length=20000)


def _remove_boolean_hole_bridges(points: Any, precision: float = 1e-6) -> list[list[float]]:
    """Keep the outer contour of a gdstk Boolean polygon and discard hole walks.

    gdstk represents a polygon with holes as one point sequence connected by a
    zero-width bridge.  The bridge endpoint therefore appears twice.  Removing
    the point walk between each repeated endpoint fills the enclosed hole while
    retaining the non-convex outer boundary.
    """
    result = [[float(x), float(y)] for x, y in points]
    while True:
        seen: dict[tuple[int, int], int] = {}
        bridge: tuple[int, int] | None = None
        for index, (x, y) in enumerate(result):
            key = (round(x / precision), round(y / precision))
            if key in seen and index - seen[key] > 1:
                bridge = (seen[key], index)
                break
            seen[key] = index
        if bridge is None:
            break
        start, end = bridge
        result = result[: start + 1] + result[end + 1 :]
    return result


@app.post("/api/geometry/fill-holes")
def fill_polygon_holes(payload: PolygonSubjectsRequest) -> dict[str, Any]:
    """Union closed border geometry and return its filled outer contours."""
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Pattern filling requires gdstk") from exc

    try:
        subjects = [gdstk.Polygon(points) for points in payload.subjects if len(points) >= 3]
        united = gdstk.boolean(subjects, [], "or", precision=1e-6) if subjects else []
        regions = [_remove_boolean_hole_bridges(polygon.points) for polygon in united]
    except Exception as exc:
        raise HTTPException(400, f"Unable to fill pattern: {exc}") from exc

    return {"regions": [points for points in regions if len(points) >= 3]}


@app.post("/api/geometry/intersection")
def intersect_polygons(payload: PolygonIntersectionRequest) -> dict[str, Any]:
    """Intersect each subject polygon with one substrate outline.

    Results remain grouped by subject because one polygon can be clipped into
    multiple disconnected regions by a non-convex wafer outline.
    """
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Geometry clipping requires gdstk") from exc

    try:
        clip = gdstk.Polygon(payload.clip)
        results: list[list[list[list[float]]]] = []
        for subject_points in payload.subjects:
            if len(subject_points) < 3:
                results.append([])
                continue
            subject = gdstk.Polygon(subject_points)
            clipped = gdstk.boolean(subject, clip, "and", precision=1e-6)
            results.append(
                [
                    [[float(x), float(y)] for x, y in polygon.points]
                    for polygon in clipped
                    if len(polygon.points) >= 3
                ]
            )
    except Exception as exc:
        raise HTTPException(400, f"Unable to intersect polygons: {exc}") from exc

    return {"results": results}


@app.post("/api/geometry/mask-regions")
def mask_regions(payload: MaskRegionsRequest) -> dict[str, Any]:
    """Resolve normal or inverted mask tone inside the substrate outline."""
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Mask Boolean operations require gdstk") from exc

    try:
        substrate = gdstk.Polygon(payload.substrate)
        mask = [gdstk.Polygon(points) for points in payload.mask if len(points) >= 3]
        if payload.invert:
            regions = gdstk.boolean(substrate, mask, "not", precision=1e-6)
        elif mask:
            regions = gdstk.boolean(mask, substrate, "and", precision=1e-6)
        else:
            regions = []
    except Exception as exc:
        raise HTTPException(400, f"Unable to resolve mask regions: {exc}") from exc

    return {
        "regions": [
            [[float(x), float(y)] for x, y in polygon.points]
            for polygon in regions
            if len(polygon.points) >= 3
        ]
    }


@app.post("/api/geometry/isotropic-offset")
def isotropic_offset(payload: PolygonOffsetRequest) -> dict[str, Any]:
    """Dilate 2D regions by a physical radius and clip them to the wafer.

    This is the lateral component of the MVP's conformal grow/isotropic
    etch approximation.  Z expansion is applied by the front end using the
    same physical distance.
    """
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Isotropic geometry operations require gdstk") from exc

    try:
        subjects = [gdstk.Polygon(points) for points in payload.subjects if len(points) >= 3]
        if not subjects:
            return {"regions": []}
        expanded = gdstk.offset(
            subjects,
            payload.distance,
            join="round",
            tolerance=32,
            precision=1e-6,
            use_union=True,
        )
        regions = gdstk.boolean(
            expanded,
            gdstk.Polygon(payload.clip),
            "and",
            precision=1e-6,
        )
    except Exception as exc:
        raise HTTPException(400, f"Unable to offset polygons: {exc}") from exc

    return {
        "regions": [
            [[float(x), float(y)] for x, y in polygon.points]
            for polygon in regions
            if len(polygon.points) >= 3
        ]
    }


@app.post("/api/geometry/split-by-mask")
def split_by_mask(payload: PolygonSplitRequest) -> dict[str, Any]:
    """Split every subject into outside-mask and inside-mask polygons."""
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Material consumption requires gdstk") from exc

    try:
        masks = [gdstk.Polygon(points) for points in payload.masks if len(points) >= 3]
        remaining: list[list[list[list[float]]]] = []
        overlaps: list[list[list[list[float]]]] = []
        for points in payload.subjects:
            if len(points) < 3:
                remaining.append([])
                overlaps.append([])
                continue
            subject = gdstk.Polygon(points)
            outside = gdstk.boolean(subject, masks, "not", precision=1e-6) if masks else [subject]
            inside = gdstk.boolean(subject, masks, "and", precision=1e-6) if masks else []
            remaining.append(
                [
                    [[float(x), float(y)] for x, y in polygon.points]
                    for polygon in outside
                    if len(polygon.points) >= 3
                ]
            )
            overlaps.append(
                [
                    [[float(x), float(y)] for x, y in polygon.points]
                    for polygon in inside
                    if len(polygon.points) >= 3
                ]
            )
    except Exception as exc:
        raise HTTPException(400, f"Unable to split polygons: {exc}") from exc

    return {"remaining": remaining, "overlaps": overlaps}


@app.post("/api/gds/inspect")
async def inspect_gds(
    file: UploadFile = File(...), top_cell: str | None = Form(default=None)
) -> JSONResponse:
    """Read a GDSII file and expose its layer/datatype structure.

    The MVP deliberately keeps GDS geometry vector-based. It returns flattened
    polygons grouped by (layer, datatype) for the selected top-level cell while
    also reporting cell names. Later versions can add explicit hierarchy
    browsing without changing the front-end geometry model.
    """
    if not file.filename or not file.filename.lower().endswith((".gds", ".gdsii", ".oas", ".oasis")):
        raise HTTPException(400, "Please upload a GDSII (.gds/.gdsii) or OASIS (.oas/.oasis) file")

    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(
            503,
            "GDS support requires the optional 'gdstk' package. Install requirements.txt and restart.",
        ) from exc

    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "GDS file is larger than the 100 MB MVP limit")

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".gds", delete=False) as tmp:
            tmp.write(data)
            temp_path = Path(tmp.name)
        try:
            suffix = Path(file.filename).suffix.lower()
            lib = gdstk.read_oas(temp_path) if suffix in {".oas", ".oasis"} else gdstk.read_gds(temp_path)
        except Exception as exc:
            raise HTTPException(400, f"Unable to parse GDS: {exc}") from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    cells = [c.name for c in lib.cells]
    top = list(lib.top_level())
    if not top:
        raise HTTPException(400, "The GDS contains no top-level cell")
    top_by_name = {candidate.name: candidate for candidate in top}
    if top_cell and top_cell not in top_by_name:
        raise HTTPException(400, "Selected top cell is not a top-level cell in this GDS")
    cell = top_by_name[top_cell] if top_cell else top[0]

    # get_polygons includes polygons through references when depth is None.
    try:
        polys = cell.get_polygons(apply_repetitions=True, include_paths=True, depth=None)
    except TypeError:
        # Compatibility fallback for older gdstk versions.
        polys = cell.get_polygons()

    unit_um = float(getattr(lib, "unit", 1e-6)) * 1e6
    layer_map: dict[tuple[int, int], dict[str, Any]] = {}
    overall_bbox: list[float] | None = None
    polygon_limit = 20000
    truncated = False

    for i, poly in enumerate(polys):
        if i >= polygon_limit:
            truncated = True
            break
        try:
            layer = int(poly.layer)
            datatype = int(poly.datatype)
            pts_array = poly.points
        except AttributeError:
            # Very old APIs can return raw point arrays without layer metadata;
            # this is intentionally rejected instead of silently collapsing layers.
            raise HTTPException(
                500,
                "Installed gdstk version did not preserve polygon layer metadata; upgrade gdstk.",
            )

        # Normalize all layout coordinates to micrometres for the editor domain.
        pts = [[float(x) * unit_um, float(y) * unit_um] for x, y in pts_array]
        if len(pts) < 3:
            continue
        bb = _bbox(pts)
        overall_bbox = _merge_bbox(overall_bbox, bb)
        key = (layer, datatype)
        item = layer_map.setdefault(
            key,
            {
                "layer": layer,
                "datatype": datatype,
                "name": f"L{layer}/{datatype}",
                "count": 0,
                "bbox": None,
                "polygons": [],
            },
        )
        item["count"] += 1
        item["bbox"] = _merge_bbox(item["bbox"], bb)
        item["polygons"].append(pts)

    layers = sorted(layer_map.values(), key=lambda x: (x["layer"], x["datatype"]))

    return JSONResponse(
        {
            "filename": file.filename,
            "library_unit": float(getattr(lib, "unit", 1e-6)),
            "library_precision": float(getattr(lib, "precision", 1e-9)),
            "cells": cells,
            "top_cells": [c.name for c in top],
            "active_top_cell": cell.name,
            "layers": layers,
            "bbox": overall_bbox,
            "truncated": truncated,
            "polygon_limit": polygon_limit,
        }
    )
