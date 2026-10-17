"""Independent 3D conductor-component audit of a source-generated WaferCAD file.

Requires shapely>=2 (only for targeted scientific acceptance). Do not treat
merged multi-polygon material owners as a connected wire. Separate XY islands
and require both a shared nonzero edge and >10nm metal Z overlap.
"""
import json
import sys
from collections import defaultdict
from functools import lru_cache

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

project = json.loads(open(sys.argv[1], encoding="utf-8").read())
templates = project["sharedPolygonTemplates"]
placements = project["sharedGeometries"]
by_name = {layer["name"]: layer["id"] for layer in project["model"]["layers"]}
pd_id = by_name["Top Pd interconnect 120nm"]


@lru_cache(None)
def geometry(ref):
    result = []
    for placement in placements[ref]:
        template = templates[placement[0]]
        if "raw" in template:
            rings = template["raw"]
        else:
            x, y = placement[1:]
            rings = []
            for delta in template["rings"]:
                ring = []
                px, py = x, y
                for i in range(0, len(delta), 2):
                    px += delta[i]
                    py += delta[i + 1]
                    ring.append((px / 10000, py / 10000))
                rings.append(ring + [ring[0]])
        result.append(Polygon(rings[0], rings[1:]))
    return unary_union(result)


metals = []
stacks = []
for region in project["model"]["regions"]:
    for segment in region["stack"]:
        if segment["layerId"] != pd_id:
            continue
        geom = geometry(region["geomRef"])
        # A single material owner often has disconnected physical XY islands.
        for part in (list(geom.geoms) if hasattr(geom, "geoms") else [geom]):
            metals.append(part)
            stacks.append((segment["z0"], segment["z1"]))
assert metals, "No actual top Pd"

parent = list(range(len(metals)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


tree = STRtree(metals)
edges = 0
for i, part in enumerate(metals):
    for j in tree.query(part):
        j = int(j)
        if j <= i:
            continue
        z_overlap = min(stacks[i][1], stacks[j][1]) - max(stacks[i][0], stacks[j][0])
        if z_overlap <= 0.01:
            continue
        if part.boundary.intersection(metals[j].boundary).length <= 1e-7:
            continue
        parent[find(i)] = find(j)
        edges += 1

networks = defaultdict(list)
for i in range(len(metals)):
    networks[find(i)].append(i)


def physical_stack(point):
    regions = [r for r in project["model"]["regions"]
               if geometry(r["geomRef"]).contains(point)]
    assert len(regions) == 1, f"Ambiguous XY owner at {point}: {len(regions)}"
    return regions[0]["stack"]


def metal_network(point):
    hits = {find(i) for i, geom in enumerate(metals) if geom.contains(point)}
    assert len(hits) == 1, f"Missing or ambiguous conductive Pd at {point}: {hits}"
    return next(iter(hits))


def contact(point, lower, upper):
    stack = physical_stack(point)
    i = next((i for i, s in enumerate(stack) if s["layerId"] == by_name[lower]), -1)
    assert 0 <= i < len(stack) - 1, f"{lower} missing at {point}"
    assert stack[i + 1]["layerId"] == by_name[upper], f"Dielectric/cavity above {lower} at {point}"
    assert abs(stack[i]["z1"] - stack[i + 1]["z0"]) < 1e-9, f"Z gap at {point}"


rrams = [e for e in project["layout"]["elements"] if e["layer"] == 19]
assert len(rrams) == 14
roots = []
for element in rrams:
    xs = [v[0] for v in element["points"]]
    ys = [v[1] for v in element["points"]]
    # Non-symmetric interior offset avoids model-region shared boundaries.
    point = Point((min(xs) + max(xs)) / 2 + 0.013,
                  (min(ys) + max(ys)) / 2 + 0.027)
    contact(point, "Digital Pt TE 10nm", "Top Ti interconnect 20nm")
    contact(point, "Top Ti interconnect 20nm", "Top Pd interconnect 120nm")
    roots.append(metal_network(point))

vias = [e for e in project["layout"]["elements"] if e["layer"] == 22]
assert len(vias) == 1, "ML needs exactly one pre-charge drain via"
via = Point(47.213, -13.973)
contact(via, "CNT drain Pd 45nm", "Top Ti interconnect 20nm")
contact(via, "Top Ti interconnect 20nm", "Top Pd interconnect 120nm")
ml = metal_network(via)
assert all(root == ml for root in roots[4:]), "TCAM Pt terminal disconnected from ML"
assert len(set(roots[:4])) == 4 and ml not in roots[:4], "Buffer-to-ML short"
assert len(networks) == 5, f"Expected one TCAM ML and four isolated buffers, found {len(networks)} nets"
assert not any(g.contains(Point(43.7, -15)) for g in metals), "ML shorted to pre-charge source"

print(json.dumps({
    "pass": True,
    "islandAwarePdPolygons": len(metals),
    "physicalPdSharedEdgeContacts": edges,
    "conductorComponents": len(networks),
    "tcamTopElectrodesOnMl": 10,
    "bufferElectrodesIsolated": 4,
    "viaContactsPrechargeDrain": True,
    "requiredPdZOverlapUm": 0.01,
}, indent=2))
