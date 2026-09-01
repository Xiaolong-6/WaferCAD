from __future__ import annotations

import math
import hashlib
import multiprocessing
import tempfile
import threading
import time
import uuid
from pathlib import Path
from queue import Empty
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
THREE = ROOT / "node_modules" / "three"
USER_PROJECTS = ROOT / "user_projects"

app = FastAPI(title="WaferCAD MVP", version="0.1.0")
SUBSTRATE_ATOM_LIMIT = 5000
SURFACE_ATOM_LIMIT = 10000
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_POINTS_PER_POLYGON = 100000
MAX_TOTAL_VERTICES = 1000000
MAX_COORDINATE_ABS = 1e9


@app.middleware("http")
async def add_security_headers(request: Any, call_next: Any) -> Any:
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.mount("/static", StaticFiles(directory=STATIC), name="static")
if THREE.is_dir():
    app.mount("/vendor/three", StaticFiles(directory=THREE), name="three")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/patterns")
def patterns_page() -> FileResponse:
    # Old standalone page removed — redirect to dock in main (302)
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/", status_code=302)


@app.get("/api/health")
def health() -> dict[str, Any]:
    try:
        import gdstk  # noqa: F401
        gds = True
    except Exception:
        gds = False
    return {"ok": True, "gdstk": gds}


@app.get("/api/projects/{name}")
def local_project(name: str) -> FileResponse:
    """Open an explicitly named local WaferCAD project without exposing arbitrary files."""
    if Path(name).name != name or not name.lower().endswith(".wafercad.json"):
        raise HTTPException(400, "Invalid local project name")
    project = USER_PROJECTS / name
    if not project.is_file():
        raise HTTPException(404, "Local project not found")
    return FileResponse(project, media_type="application/json", filename=name)


def _bbox(points: list[list[float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _merge_bbox(a: list[float] | None, b: list[float]) -> list[float]:
    if a is None:
        return b[:]
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def _bbox_overlaps(a: list[float], b: list[float], epsilon: float = 1e-9) -> bool:
    return not (
        a[2] < b[0] - epsilon
        or b[2] < a[0] - epsilon
        or a[3] < b[1] - epsilon
        or b[3] < a[1] - epsilon
    )


def _bbox_contains_point(bounds: list[float], point: list[float], epsilon: float = 1e-9) -> bool:
    return (
        bounds[0] - epsilon <= point[0] <= bounds[2] + epsilon
        and bounds[1] - epsilon <= point[1] <= bounds[3] + epsilon
    )


class GeometryRequest(BaseModel):
    @model_validator(mode="after")
    def validate_geometry_complexity(self) -> "GeometryRequest":
        total = 0

        def walk(value: Any) -> None:
            nonlocal total
            if isinstance(value, dict):
                for child in value.values():
                    walk(child)
            elif isinstance(value, (list, tuple)):
                is_polygon = bool(value) and all(
                    isinstance(point, (list, tuple))
                    and len(point) == 2
                    and all(isinstance(coord, (int, float)) for coord in point)
                    for point in value
                )
                if is_polygon:
                    if len(value) > MAX_POINTS_PER_POLYGON:
                        raise ValueError(f"polygon exceeds {MAX_POINTS_PER_POLYGON} points")
                    total += len(value)
                    for point in value:
                        for coordinate in point:
                            if not math.isfinite(float(coordinate)) or abs(float(coordinate)) > MAX_COORDINATE_ABS:
                                raise ValueError("polygon coordinate is non-finite or outside the supported range")
                else:
                    for child in value:
                        walk(child)

        walk(self.model_dump())
        if total > MAX_TOTAL_VERTICES:
            raise ValueError(f"request exceeds {MAX_TOTAL_VERTICES} total polygon vertices")
        return self


class PolygonIntersectionRequest(GeometryRequest):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    clip: list[list[float]] = Field(min_length=3)


class MaskRegionsRequest(GeometryRequest):
    mask: list[list[list[float]]] = Field(max_length=20000)
    substrate: list[list[float]] = Field(min_length=3)
    invert: bool = False


class MaskComposeRequest(GeometryRequest):
    polygons: list[list[list[float]]] = Field(max_length=20000)
    substrate: list[list[float]] | None = None
    polarity: Literal["transmit", "block"] = "transmit"


class PolygonOffsetRequest(GeometryRequest):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    distance: float = Field(gt=0)
    clip: list[list[float]] = Field(min_length=3)


class PolygonSplitRequest(GeometryRequest):
    subjects: list[list[list[float]]] = Field(max_length=20000)
    masks: list[list[list[float]]] = Field(max_length=20000)


class PolygonSubjectsRequest(GeometryRequest):
    subjects: list[list[list[float]]] = Field(max_length=20000)


class SubstrateThicknessRequest(GeometryRequest):
    outline: list[list[float]] = Field(min_length=3)
    thickness: float = Field(gt=0)
    cuts: list[dict[str, Any]] = Field(default_factory=list)


class SurfacePartitionRequest(GeometryRequest):
    outline: list[list[float]] = Field(min_length=3)
    thickness: float = Field(gt=0)
    side: Literal["front", "back"] = "front"
    solids: list[dict[str, Any]] = Field(default_factory=list, max_length=20000)
    cuts: list[dict[str, Any]] = Field(default_factory=list, max_length=20000)
    masks: list[list[list[float]]] = Field(default_factory=list, max_length=20000)


class HierarchyInspectRequest(BaseModel):
    filename: str | None = None


GeometryJobOperation = Literal[
    "fill-holes",
    "intersection",
    "mask-regions",
    "mask-compose",
    "isotropic-offset",
    "split-by-mask",
    "surface-partition",
    "substrate-thickness",
]


class GeometryJobRequest(BaseModel):
    operation: GeometryJobOperation
    payload: dict[str, Any]


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


def _component_id(points: Any, precision: float = 1e-6) -> str:
    """Return a stable geometry id independent of polygon start point/direction."""
    quantized = [(round(float(x) / precision), round(float(y) / precision)) for x, y in points]
    if not quantized:
        return "component-empty"
    variants: list[tuple[tuple[int, int], ...]] = []
    for seq in (quantized, list(reversed(quantized))):
        start = min(range(len(seq)), key=lambda index: seq[index:]+seq[:index])
        variants.append(tuple(seq[start:]+seq[:start]))
    canonical = min(variants)
    digest = hashlib.sha256(repr(canonical).encode("ascii")).hexdigest()[:16]
    return f"component-{digest}"


def _compose_polygons(polygons: list[list[list[float]]], precision: float = 1e-6) -> list[Any]:
    import gdstk

    subjects = [gdstk.Polygon(points) for points in polygons if len(points) >= 3]
    if not subjects:
        return []
    # Boolean OR alone can retain separate polygons at exactly shared edges.
    # A precision-scale close dissolves those zero-width stitch boundaries
    # without changing any resolvable mask dimension.
    epsilon = max(float(precision), 1e-7)
    grown = gdstk.offset(subjects, epsilon, join="miter", tolerance=2, use_union=True, precision=precision)
    composed = gdstk.offset(grown, -epsilon, join="miter", tolerance=2, use_union=True, precision=precision)
    return composed or gdstk.boolean(subjects, [], "or", precision=precision)


def _component_payload(polygon: Any, source_polygon_indices: list[int] | None = None) -> dict[str, Any]:
    points = [[float(x), float(y)] for x, y in polygon.points]
    payload = {
        "id": _component_id(polygon.points),
        "polygon": points,
        "area": float(polygon.area()),
        "bbox": _bbox(points),
    }
    if source_polygon_indices is not None:
        payload["source_polygon_indices"] = source_polygon_indices
    return payload


def _compose_selection_components(
    polygons: list[list[list[float]]], precision: float = 1e-6
) -> list[tuple[Any, list[int]]]:
    """Expose each filled GDS BOUNDARY as an independently selectable region.

    Merely touching boundaries must not become one selection component.  A
    photomask projection unions the selected filled regions later, but selection
    must still be able to isolate an alignment mark from an adjacent frame or
    stitch line.  Keeping the source index also makes the final projection use
    the original filled boundary instead of a display-derived outline.
    """
    import gdstk

    subjects = [gdstk.Polygon(points) for points in polygons if len(points) >= 3]
    return [(subject, [source_index]) for source_index, subject in enumerate(subjects)]


def _point_in_poly(pt: list[float], poly: list[list[float]]) -> bool:
    x, y = float(pt[0]), float(pt[1])
    inside = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        # edge straddles horizontal line at y
        if ((ay > y) != (by > y)) and (x < (bx - ax) * (y - ay) / (by - ay + 1e-30) + ax):
            inside = not inside
    return inside


def _atom_interior_point(poly: list[list[float]]) -> list[float]:
    # centroid with fallback to edge-midpoint sampling for non-convex / centroid-outside cases
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cy = sum(p[1] for p in poly) / n
    if _point_in_poly([cx, cy], poly):
        return [cx, cy]
    # try points slightly inset from each vertex toward centroid
    for p in poly:
        q = [p[0] * 0.995 + cx * 0.005, p[1] * 0.995 + cy * 0.005]
        if _point_in_poly(q, poly):
            return q
    # fallback: midpoint of first edge nudged inward
    mx = (poly[0][0] + poly[1][0]) / 2
    my = (poly[0][1] + poly[1][1]) / 2
    q = [mx * 0.99 + cx * 0.01, my * 0.99 + cy * 0.01]
    return q


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


@app.post("/api/geometry/mask-compose")
def compose_mask(payload: MaskComposeRequest) -> dict[str, Any]:
    """Compose raw layout polygons into physical optical regions.

    Union happens before polarity and substrate clipping so GDS fragmentation,
    overlaps, and stitch boundaries never leak into process geometry.
    """
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Mask composition requires gdstk") from exc

    try:
        components = _compose_polygons(payload.polygons)
        if payload.substrate is None:
            if payload.polarity == "block":
                raise HTTPException(400, "Block polarity requires a substrate outline")
            regions = components
        else:
            substrate = gdstk.Polygon(payload.substrate)
            if payload.polarity == "block":
                regions = gdstk.boolean(substrate, components, "not", precision=1e-6)
            elif components:
                regions = gdstk.boolean(components, substrate, "and", precision=1e-6)
            else:
                regions = []
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Unable to compose mask: {exc}") from exc

    return {
        "polarity": payload.polarity,
        "raw_polygon_count": len(payload.polygons),
        "components": [_component_payload(polygon) for polygon in components],
        "regions": [
            [[float(x), float(y)] for x, y in polygon.points]
            for polygon in regions
            if len(polygon.points) >= 3
        ],
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
        masks: dict[str, dict[str, Any]] = {}
        for points in payload.masks:
            if len(points) < 3:
                continue
            polygon = gdstk.Polygon(points)
            component_id = _component_id(polygon.points)
            masks.setdefault(
                component_id,
                {"id": component_id, "polygon": polygon, "bbox": _bbox(points)},
            )
        remaining: list[list[list[list[float]]]] = []
        overlaps: list[list[list[list[float]]]] = []
        bbox_skips = 0
        boolean_splits = 0
        exact_matches = 0
        for points in payload.subjects:
            if len(points) < 3:
                remaining.append([])
                overlaps.append([])
                continue
            subject = gdstk.Polygon(points)
            subject_bbox = _bbox(points)
            relevant = [mask for mask in masks.values() if _bbox_overlaps(subject_bbox, mask["bbox"])]
            bbox_skips += len(masks) - len(relevant)
            subject_id = _component_id(subject.points)
            if any(mask["id"] == subject_id for mask in relevant):
                outside = []
                inside = [subject]
                exact_matches += 1
            elif relevant:
                relevant_polygons = [mask["polygon"] for mask in relevant]
                outside = gdstk.boolean(subject, relevant_polygons, "not", precision=1e-6)
                inside = gdstk.boolean(subject, relevant_polygons, "and", precision=1e-6)
                boolean_splits += 1
            else:
                outside = [subject]
                inside = []
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

    return {
        "remaining": remaining,
        "overlaps": overlaps,
        "stats": {
            "input_masks": len(payload.masks),
            "unique_masks": len(masks),
            "boolean_splits": boolean_splits,
            "exact_matches": exact_matches,
            "bbox_skips": bbox_skips,
        },
    }


@app.post("/api/geometry/surface-partition")
def surface_partition(payload: SurfacePartitionRequest) -> dict[str, Any]:
    """Partition an operation mask into regions with one exact exposed surface.

    Every solid and substrate-cut footprint is used as a planar arrangement
    boundary.  Classification is performed only after that split, so an atom
    can never span two materials or two surface heights.
    """
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Surface partition requires gdstk") from exc

    try:
        thickness = float(payload.thickness)
        wafer = gdstk.Polygon(payload.outline)
        masks = [gdstk.Polygon(points) for points in payload.masks if len(points) >= 3]
        atoms = (
            gdstk.boolean(wafer, masks, "and", precision=1e-6)
            if masks
            else [wafer]
        )
        solid_groups: dict[tuple[Any, ...], dict[str, Any]] = {}
        cut_groups: dict[tuple[Any, ...], dict[str, Any]] = {}
        input_boundary_count = 0

        for raw in payload.solids:
            footprint = raw.get("footprint")
            if not isinstance(footprint, list) or len(footprint) < 3:
                continue
            z_min, z_max = float(raw.get("zMin", 0)), float(raw.get("zMax", 0))
            if not all(math.isfinite(value) for value in (z_min, z_max)) or z_max <= z_min:
                continue
            side = "back" if raw.get("side") == "back" else "front"
            layer_id = raw.get("layerId")
            key = (side, str(layer_id), z_min, z_max)
            group = solid_groups.setdefault(
                key,
                {
                    "id": f"layer:{layer_id}",
                    "layerId": layer_id,
                    "side": side,
                    "zMin": z_min,
                    "zMax": z_max,
                    "polygons": [],
                    "bbox": None,
                    "sourceIds": [],
                },
            )
            polygon = gdstk.Polygon(footprint)
            group["polygons"].append(polygon)
            group["bbox"] = _merge_bbox(group["bbox"], _bbox(footprint))
            group["sourceIds"].append(str(raw.get("id") or ""))
            input_boundary_count += 1

        for raw in payload.cuts:
            footprint = raw.get("footprint")
            if not isinstance(footprint, list) or len(footprint) < 3:
                continue
            z_min, z_max = float(raw.get("zMin", -thickness)), float(raw.get("zMax", 0))
            if not all(math.isfinite(value) for value in (z_min, z_max)) or z_max <= z_min:
                continue
            side = "back" if raw.get("side") == "back" else "front"
            z_min, z_max = max(-thickness, z_min), min(0, z_max)
            key = (side, z_min, z_max)
            group = cut_groups.setdefault(
                key,
                {"side": side, "zMin": z_min, "zMax": z_max, "polygons": [], "bbox": None},
            )
            group["polygons"].append(gdstk.Polygon(footprint))
            group["bbox"] = _merge_bbox(group["bbox"], _bbox(footprint))
            input_boundary_count += 1

        solids = list(solid_groups.values())
        for group in solids:
            if len(group["sourceIds"]) == 1:
                group["id"] = group["sourceIds"][0]
        cuts = list(cut_groups.values())
        boundaries: dict[tuple[str, ...], dict[str, Any]] = {}
        unique_component_ids: set[str] = set()
        for group in solids + cuts:
            components = [
                {
                    "id": _component_id(polygon.points),
                    "polygon": polygon,
                    "bbox": _bbox(polygon.points),
                }
                for polygon in group["polygons"]
            ]
            component_ids = {component["id"] for component in components}
            unique_component_ids.update(component_ids)
            geometry_key = tuple(sorted(component_ids))
            boundary = boundaries.get(geometry_key)
            if boundary is None:
                boundaries[geometry_key] = {
                    "bbox": group["bbox"],
                    "component_ids": component_ids,
                    "components": components,
                }
            else:
                boundary["bbox"] = _merge_bbox(boundary["bbox"], group["bbox"])

        partition_complete = True
        boolean_split_count = 0
        bbox_skip_count = 0
        duplicate_boundary_count = input_boundary_count - len(unique_component_ids)
        for boundary_index, boundary in enumerate(boundaries.values()):
            if boundary_index == 0:
                # `atoms` is already the physical union of the operation mask.
                # Splitting that union against the first material group in one
                # call avoids repeating the same large multi-polygon Boolean
                # once per disconnected mask island.
                boundary_polygons = [component["polygon"] for component in boundary["components"]]
                inside = gdstk.boolean(atoms, boundary_polygons, "and", precision=1e-6)
                outside = gdstk.boolean(atoms, boundary_polygons, "not", precision=1e-6)
                boolean_split_count += 1
                atoms = [
                    atom
                    for atom in [*inside, *outside]
                    if len(atom.points) >= 3 and atom.area() > 1e-9
                ]
                if len(atoms) > SURFACE_ATOM_LIMIT:
                    partition_complete = False
                    break
                continue
            next_atoms: list[Any] = []
            for atom in atoms:
                atom_points = atom.points
                atom_bbox = _bbox(atom_points)
                if not _bbox_overlaps(atom_bbox, boundary["bbox"]):
                    next_atoms.append(atom)
                    bbox_skip_count += 1
                    continue
                relevant = [
                    component
                    for component in boundary["components"]
                    if _bbox_overlaps(atom_bbox, component["bbox"])
                ]
                if not relevant:
                    next_atoms.append(atom)
                    bbox_skip_count += 1
                    continue
                if len(relevant) == 1 and _component_id(atom_points) == relevant[0]["id"]:
                    next_atoms.append(atom)
                    bbox_skip_count += 1
                    continue
                boolean_split_count += 1
                relevant_polygons = [component["polygon"] for component in relevant]
                next_atoms.extend(gdstk.boolean(atom, relevant_polygons, "and", precision=1e-6))
                next_atoms.extend(gdstk.boolean(atom, relevant_polygons, "not", precision=1e-6))
            if len(next_atoms) > SURFACE_ATOM_LIMIT:
                partition_complete = False
                break
            atoms = [atom for atom in next_atoms if len(atom.points) >= 3 and atom.area() > 1e-9]

        if not partition_complete:
            raise HTTPException(
                422,
                f"Surface arrangement exceeds the {SURFACE_ATOM_LIMIT}-atom safety limit",
            )

        result: list[dict[str, Any]] = []
        for atom in atoms:
            points = [[float(x), float(y)] for x, y in atom.points]
            interior = _atom_interior_point(points)
            front_surface = 0.0
            back_surface = -thickness
            for cut in cuts:
                if not _bbox_contains_point(cut["bbox"], interior):
                    continue
                if not bool(gdstk.inside([interior], cut["polygons"])[0]):
                    continue
                if cut["side"] == "front":
                    front_surface = min(front_surface, cut["zMin"])
                else:
                    back_surface = max(back_surface, cut["zMax"])

            candidates = [
                solid
                for solid in solids
                if solid["side"] == payload.side
                and _bbox_contains_point(solid["bbox"], interior)
                and bool(gdstk.inside([interior], solid["polygons"])[0])
            ]
            if candidates:
                top = (
                    max(candidates, key=lambda solid: solid["zMax"])
                    if payload.side == "front"
                    else min(candidates, key=lambda solid: solid["zMin"])
                )
                surface = top["zMax"] if payload.side == "front" else top["zMin"]
                kind = "solid"
                source_id = top["id"]
                layer_id = top["layerId"]
                z_min, z_max = top["zMin"], top["zMax"]
            elif front_surface > back_surface + 1e-9:
                surface = front_surface if payload.side == "front" else back_surface
                kind = "substrate"
                source_id = "substrate"
                layer_id = "substrate"
                z_min, z_max = back_surface, front_surface
            else:
                continue

            geometry_id = _component_id(atom.points)
            result.append(
                {
                    "id": f"face-{source_id}-{geometry_id.removeprefix('component-')}",
                    "kind": kind,
                    "sourceId": source_id,
                    "layerId": layer_id,
                    "side": payload.side,
                    "surface": surface,
                    "zMin": z_min,
                    "zMax": z_max,
                    "polygon": points,
                    "area": float(atom.area()),
                }
            )

        return {
            "atoms": result,
            "exact": True,
            "atom_limit": SURFACE_ATOM_LIMIT,
            "stats": {
                "input_boundaries": input_boundary_count,
                "unique_boundaries": len(unique_component_ids),
                "duplicate_boundaries": duplicate_boundary_count,
                "boundary_groups": len(boundaries),
                "boolean_splits": boolean_split_count,
                "bbox_skips": bbox_skip_count,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Unable to partition top surface: {exc}") from exc


@app.post("/api/geometry/substrate-thickness")
def substrate_thickness(payload: SubstrateThicknessRequest) -> dict[str, Any]:
    """Compute exact remaining substrate thickness range via planar partition.

    The previous frontend heuristic sampled interior points of outline and cuts.
    For pathological overlapping / concave cases this could miss an atomic region.
    This endpoint partitions the wafer by all cut footprints using gdstk Booleans
    and evaluates the uniform thickness inside each atomic XY region.
    """
    try:
        import gdstk
    except Exception as exc:
        raise HTTPException(503, "Thickness calculation requires gdstk") from exc
    try:
        if len(payload.outline) < 3:
            raise HTTPException(400, "Wafer outline must have at least 3 vertices")
        t = float(payload.thickness)
        if not math.isfinite(t) or t <= 0:
            raise HTTPException(400, "Thickness must be positive")
        # Thickness depends on depth intervals, not individual cut identities.
        # Union every equal-depth mask into one logical coverage group, then
        # carry multi-polygons for each coverage state.  Complexity therefore
        # follows the number of distinct depth intervals (normally 1–3), not
        # the hundreds or thousands of disconnected mask components.
        interval_groups: dict[tuple[float, float], list[Any]] = {}
        input_cut_count = 0
        for c in payload.cuts:
            fp = c.get("footprint")
            if not isinstance(fp, list) or len(fp) < 3:
                continue
            zmin = float(c.get("zMin", -t))
            zmax = float(c.get("zMax", 0))
            zmin = max(-t, min(zmin, zmax))
            zmax = min(0, max(zmin, zmax))
            if zmax <= zmin + 1e-9:
                continue
            input_cut_count += 1
            interval_groups.setdefault((zmin, zmax), []).append(gdstk.Polygon(fp))

        states: list[tuple[list[Any], tuple[tuple[float, float], ...]]] = [
            ([gdstk.Polygon(payload.outline)], ())
        ]
        partition_complete = True
        boolean_splits = 0
        for interval, mask_polygons in interval_groups.items():
            next_states: list[tuple[list[Any], tuple[tuple[float, float], ...]]] = []
            for geometries, coverage in states:
                inside = gdstk.boolean(geometries, mask_polygons, "and", precision=1e-6)
                outside = gdstk.boolean(geometries, mask_polygons, "not", precision=1e-6)
                boolean_splits += 1
                if inside:
                    next_states.append((inside, coverage + (interval,)))
                if outside:
                    next_states.append((outside, coverage))
            if sum(len(geometries) for geometries, _ in next_states) > SUBSTRATE_ATOM_LIMIT:
                partition_complete = False
                break
            states = next_states
        if not states:
            return {"min": t, "max": t, "exact": partition_complete}

        def merged_length(intervals: list[tuple[float, float]]) -> float:
            if not intervals:
                return 0.0
            segs = sorted(intervals)
            total = 0.0
            lo, hi = segs[0]
            for a, b in segs[1:]:
                if a <= hi + 1e-7:
                    hi = max(hi, b)
                else:
                    total += hi - lo
                    lo, hi = a, b
            return total + hi - lo

        values = [max(0.0, t - merged_length(list(coverage))) for _, coverage in states]
        atom_count = sum(len(geometries) for geometries, _ in states)
        return {
            "min": min(values),
            "max": max(values),
            "exact": partition_complete,
            "atoms": atom_count,
            "atom_limit": SUBSTRATE_ATOM_LIMIT,
            "stats": {
                "input_cuts": input_cut_count,
                "interval_groups": len(interval_groups),
                "coverage_states": len(states),
                "boolean_splits": boolean_splits,
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Unable to compute thickness: {exc}") from exc


def _geometry_job_handler(operation: GeometryJobOperation) -> tuple[type[BaseModel], Any]:
    handlers: dict[str, tuple[type[BaseModel], Any]] = {
        "fill-holes": (PolygonSubjectsRequest, fill_polygon_holes),
        "intersection": (PolygonIntersectionRequest, intersect_polygons),
        "mask-regions": (MaskRegionsRequest, mask_regions),
        "mask-compose": (MaskComposeRequest, compose_mask),
        "isotropic-offset": (PolygonOffsetRequest, isotropic_offset),
        "split-by-mask": (PolygonSplitRequest, split_by_mask),
        "surface-partition": (SurfacePartitionRequest, surface_partition),
        "substrate-thickness": (SubstrateThicknessRequest, substrate_thickness),
    }
    return handlers[operation]


def _run_geometry_job(operation: GeometryJobOperation, payload: dict[str, Any], output: Any) -> None:
    """Run one geometry request in a process that the server can terminate."""
    try:
        model, handler = _geometry_job_handler(operation)
        result = handler(model.model_validate(payload))
        output.put({"status": "completed", "result": result})
    except HTTPException as exc:
        output.put({"status": "failed", "error": str(exc.detail), "status_code": exc.status_code})
    except BaseException as exc:
        output.put({"status": "failed", "error": str(exc), "status_code": 500})


_GEOMETRY_JOBS: dict[str, dict[str, Any]] = {}
_GEOMETRY_JOBS_LOCK = threading.Lock()
_GEOMETRY_JOB_TTL_SECONDS = 15 * 60


def _refresh_geometry_job(job: dict[str, Any]) -> None:
    if job["status"] != "running":
        return
    try:
        message = job["queue"].get_nowait()
    except Empty:
        process = job["process"]
        if not process.is_alive() and process.exitcode not in (None, 0):
            job.update(status="failed", error=f"Geometry worker exited with code {process.exitcode}.")
            job["finished_at"] = time.monotonic()
        return
    job.update(message)
    job["finished_at"] = time.monotonic()
    job["process"].join(timeout=0.2)


def _geometry_job_response(job_id: str, job: dict[str, Any]) -> dict[str, Any]:
    response = {"id": job_id, "status": job["status"], "operation": job["operation"]}
    if "result" in job:
        response["result"] = job["result"]
    if "error" in job:
        response["error"] = job["error"]
    return response


def _prune_geometry_jobs() -> None:
    now = time.monotonic()
    expired = [
        job_id
        for job_id, job in _GEOMETRY_JOBS.items()
        if job["status"] != "running"
        and now - job.get("finished_at", job["created_at"]) > _GEOMETRY_JOB_TTL_SECONDS
    ]
    for job_id in expired:
        _GEOMETRY_JOBS.pop(job_id, None)


@app.post("/api/geometry/jobs", status_code=202)
def create_geometry_job(request: GeometryJobRequest) -> dict[str, Any]:
    model, _ = _geometry_job_handler(request.operation)
    validated_payload = model.model_validate(request.payload).model_dump()
    context = multiprocessing.get_context("spawn")
    output = context.Queue(maxsize=1)
    job_id = uuid.uuid4().hex
    process = context.Process(
        target=_run_geometry_job,
        args=(request.operation, validated_payload, output),
        name=f"wafercad-geometry-{job_id[:8]}",
        daemon=True,
    )
    job = {
        "operation": request.operation,
        "status": "running",
        "process": process,
        "queue": output,
        "created_at": time.monotonic(),
    }
    with _GEOMETRY_JOBS_LOCK:
        _prune_geometry_jobs()
        _GEOMETRY_JOBS[job_id] = job
    try:
        process.start()
    except Exception:
        with _GEOMETRY_JOBS_LOCK:
            _GEOMETRY_JOBS.pop(job_id, None)
        raise
    return _geometry_job_response(job_id, job)


@app.get("/api/geometry/jobs/{job_id}")
def get_geometry_job(job_id: str) -> dict[str, Any]:
    with _GEOMETRY_JOBS_LOCK:
        job = _GEOMETRY_JOBS.get(job_id)
        if job is None:
            raise HTTPException(404, "Geometry job not found")
        _refresh_geometry_job(job)
        return _geometry_job_response(job_id, job)


@app.delete("/api/geometry/jobs/{job_id}")
def cancel_geometry_job(job_id: str) -> dict[str, Any]:
    with _GEOMETRY_JOBS_LOCK:
        job = _GEOMETRY_JOBS.get(job_id)
        if job is None:
            raise HTTPException(404, "Geometry job not found")
        _refresh_geometry_job(job)
        if job["status"] == "running":
            process = job["process"]
            if process.is_alive():
                process.terminate()
                process.join(timeout=2)
            job.update(status="cancelled", error="Geometry operation stopped by user.")
            job["finished_at"] = time.monotonic()
        return _geometry_job_response(job_id, job)


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

    temp_path: Path | None = None
    try:
        suffix = Path(file.filename).suffix.lower()
        size = 0
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            temp_path = Path(tmp.name)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "GDS file is larger than the 100 MB MVP limit")
                tmp.write(chunk)
        try:
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
    all_by_name = {c.name: c for c in lib.cells}
    # Special aggregated view: all cells' local polygons (each cell holds different layer)
    if top_cell == "__ALL__":
        polys = []
        for _c in lib.cells:
            try:
                local = _c.get_polygons(apply_repetitions=True, include_paths=True, depth=0)
            except TypeError:
                local = _c.get_polygons(depth=0) if hasattr(_c, 'get_polygons') else []
            # gdstk returns list of polygons; extend
            if isinstance(local, list):
                polys.extend(local)
        cell = top[0]  # keep a reference cell for bbox/unit, but layers come from all
        # override active name for response
        active_cell_name = "__ALL__"
    elif top_cell:
        if top_cell not in all_by_name:
            raise HTTPException(400, "Selected cell is not present in this GDS")
        cell = all_by_name[top_cell]
        active_cell_name = cell.name
    else:
        cell = top[0]
        active_cell_name = cell.name

    # get_polygons includes polygons through references when depth is None (except __ALL__ already handled).
    if top_cell != "__ALL__":
        try:
            polys = cell.get_polygons(apply_repetitions=True, include_paths=True, depth=None)
        except TypeError:
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
    for layer_item in layers:
        try:
            composed = _compose_selection_components(layer_item["polygons"])
            layer_item["components"] = sorted(
                (
                    _component_payload(polygon, source_indices)
                    for polygon, source_indices in composed
                ),
                key=lambda component: component["area"],
                reverse=True,
            )
            layer_item["component_count"] = len(composed)
        except Exception as exc:
            raise HTTPException(
                400,
                f"Unable to compose optical components for layer "
                f"{layer_item['layer']}/{layer_item['datatype']}: {exc}",
            ) from exc

    # Build hierarchy for browser (non-flattened per-cell view)
    hierarchy = []
    for c in lib.cells:
        try:
            refs = []
            for ref in getattr(c, "references", []):
                # gdstk Reference
                target = getattr(ref, "cell", None)
                refs.append(
                    {
                        "cell": getattr(target, "name", str(target)) if target else None,
                        "origin": [float(v) * unit_um for v in getattr(ref, "origin", (0, 0))],
                        "rotation": float(getattr(ref, "rotation", 0) or 0),
                        "magnification": float(getattr(ref, "magnification", 1) or 1),
                        "x_reflection": bool(getattr(ref, "x_reflection", False)),
                    }
                )
            # count polygons in this cell without flattening references
            try:
                local_polys = c.get_polygons(depth=0)
            except TypeError:
                local_polys = []
            local_count = len(local_polys) if isinstance(local_polys, list) else 0
            # per-cell layer breakdown for selective import UI
            cell_layer_map: dict[tuple[int,int], int] = {}
            try:
                for lp in (local_polys or []):
                    try:
                        lk = (int(lp.layer), int(lp.datatype))
                    except Exception:
                        continue
                    cell_layer_map[lk] = cell_layer_map.get(lk, 0) + 1
            except Exception:
                cell_layer_map = {}
            cell_layers = [{"layer": k[0], "datatype": k[1], "count": v} for k, v in sorted(cell_layer_map.items())]
        except Exception:
            refs = []
            local_count = 0
            cell_layers = []
        hierarchy.append({"name": c.name, "references": refs, "local_polygon_count": local_count, "layers": cell_layers})

    return JSONResponse(
        {
            "filename": file.filename,
            "library_unit": float(getattr(lib, "unit", 1e-6)),
            "library_precision": float(getattr(lib, "precision", 1e-9)),
            "cells": cells,
            "top_cells": [c.name for c in top],
            "active_top_cell": "__ALL__" if top_cell == "__ALL__" else cell.name,
            "layers": layers,
            "bbox": overall_bbox,
            "truncated": truncated,
            "polygon_limit": polygon_limit,
            "hierarchy": hierarchy,
        }
    )
