from pathlib import Path

import pytest

import app as app_module


WAFER = [[-50, -50], [50, -50], [50, 50], [-50, 50]]


def test_health_and_static_assets(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"ok": True, "gdstk": True}

    index = client.get("/")
    assert index.status_code == 200
    assert "WaferCAD MVP" in index.text
    assert 'id="snapshotNameDialog"' in index.text
    assert "object-src 'none'" in index.headers["content-security-policy"]
    assert index.headers["x-content-type-options"] == "nosniff"

    three = client.get("/vendor/three/build/three.module.js")
    assert three.status_code == 200
    assert len(three.content) > 500_000


def test_named_local_project_route_is_scoped(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "USER_PROJECTS", tmp_path)
    project = tmp_path / "example.wafercad.json"
    project.write_text('{"format":"wafercad-mvp"}', encoding="utf-8")
    response = client.get("/api/projects/example.wafercad.json")
    assert response.status_code == 200
    assert response.json() == {"format": "wafercad-mvp"}
    assert client.get("/api/projects/example.json").status_code == 400
    assert client.get("/api/projects/missing.wafercad.json").status_code == 404


def test_polygon_intersection_clips_to_wafer(client):
    response = client.post(
        "/api/geometry/intersection",
        json={"subjects": [[[-75, -10], [25, -10], [25, 10], [-75, 10]]], "clip": WAFER},
    )
    assert response.status_code == 200
    polygon = response.json()["results"][0][0]
    xs = [point[0] for point in polygon]
    assert min(xs) == pytest.approx(-50)
    assert max(xs) == pytest.approx(25)


def test_geometry_request_rejects_total_vertex_budget(client, monkeypatch):
    monkeypatch.setattr(app_module, "MAX_TOTAL_VERTICES", 3)
    response = client.post(
        "/api/geometry/intersection",
        json={"subjects": [[[0, 0], [1, 0], [1, 1], [0, 1]]], "clip": WAFER},
    )
    assert response.status_code == 422
    assert "total polygon vertices" in response.text


def test_gds_upload_limit_is_enforced_while_streaming(client, monkeypatch):
    monkeypatch.setattr(app_module, "MAX_UPLOAD_BYTES", 4)
    response = client.post(
        "/api/gds/inspect",
        files={"file": ("oversize.gds", b"12345", "application/octet-stream")},
    )
    assert response.status_code == 413
    assert "larger than" in response.text


def test_mask_regions_normal_and_inverted(client):
    mask = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
    normal = client.post(
        "/api/geometry/mask-regions",
        json={"mask": [mask], "substrate": WAFER, "invert": False},
    )
    inverted = client.post(
        "/api/geometry/mask-regions",
        json={"mask": [mask], "substrate": WAFER, "invert": True},
    )
    assert normal.status_code == inverted.status_code == 200
    assert len(normal.json()["regions"]) == 1
    assert len(inverted.json()["regions"]) == 1
    assert len(inverted.json()["regions"][0]) > 4  # hole walk retained by gdstk


def test_mask_compose_removes_stitches_and_applies_polarity(client):
    left = [[-20, -10], [0, -10], [0, 10], [-20, 10]]
    right = [[0, -10], [20, -10], [20, 10], [0, 10]]
    overlapping = [[-5, -5], [5, -5], [5, 5], [-5, 5]]

    transmitted = client.post(
        "/api/geometry/mask-compose",
        json={"polygons": [left, right, overlapping], "substrate": WAFER, "polarity": "transmit"},
    )
    blocked = client.post(
        "/api/geometry/mask-compose",
        json={"polygons": [left, right, overlapping], "substrate": WAFER, "polarity": "block"},
    )

    assert transmitted.status_code == blocked.status_code == 200
    result = transmitted.json()
    assert result["raw_polygon_count"] == 3
    assert len(result["components"]) == 1
    assert result["components"][0]["area"] == pytest.approx(800)
    assert result["components"][0]["bbox"] == pytest.approx([-20, -10, 20, 10])
    assert len(result["regions"]) == 1
    assert len(blocked.json()["regions"]) == 1


def test_mask_component_ids_are_stable_across_polygon_order(client):
    a = [[-20, -10], [0, -10], [0, 10], [-20, 10]]
    b = [[0, -10], [20, -10], [20, 10], [0, 10]]
    first = client.post("/api/geometry/mask-compose", json={"polygons": [a, b]}).json()
    second = client.post("/api/geometry/mask-compose", json={"polygons": [list(reversed(b)), a]}).json()
    assert first["components"][0]["id"] == second["components"][0]["id"]


def test_filled_boundaries_remain_independently_selectable_when_touching():
    left = [[0, 0], [10, 0], [10, 10], [0, 10]]
    right_reversed = [[20, 10], [20, 0], [10, 0], [10, 10]]
    separated_alignment_mark = [[30, 4], [34, 4], [34, 6], [30, 6]]

    components = app_module._compose_selection_components(
        [left, right_reversed, separated_alignment_mark]
    )

    assert len(components) == 3
    assert sorted(len(source_indices) for _, source_indices in components) == [1, 1, 1]
    assert sorted(index for _, indices in components for index in indices) == [0, 1, 2]


def test_isotropic_offset_and_material_split(client):
    subject = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
    offset = client.post(
        "/api/geometry/isotropic-offset",
        json={"subjects": [subject], "distance": 5, "clip": WAFER},
    )
    assert offset.status_code == 200
    points = offset.json()["regions"][0]
    xs = [point[0] for point in points]
    assert min(xs) == pytest.approx(-15)
    assert max(xs) == pytest.approx(15)

    split = client.post(
        "/api/geometry/split-by-mask",
        json={"subjects": [subject], "masks": [[[0, -20], [20, -20], [20, 20], [0, 20]]]},
    )
    assert split.status_code == 200
    assert len(split.json()["remaining"][0]) == 1
    assert len(split.json()["overlaps"][0]) == 1


def test_material_split_prunes_disjoint_mask_components(client):
    regions = []
    for row in range(4):
        for column in range(5):
            x0 = -48 + column * 19
            y0 = -48 + row * 24
            regions.append([[x0, y0], [x0 + 8, y0], [x0 + 8, y0 + 8], [x0, y0 + 8]])
    response = client.post(
        "/api/geometry/split-by-mask",
        json={"subjects": regions, "masks": regions},
    )
    assert response.status_code == 200
    result = response.json()
    assert all(not outside for outside in result["remaining"])
    assert all(len(inside) == 1 for inside in result["overlaps"])
    assert result["stats"]["input_masks"] == 20
    assert result["stats"]["unique_masks"] == 20
    assert result["stats"]["boolean_splits"] == 0
    assert result["stats"]["exact_matches"] == 20
    assert result["stats"]["bbox_skips"] == 380


def test_surface_partition_assigns_one_height_and_material_per_atom(client):
    response = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "front",
            "solids": [
                {
                    "id": "lower",
                    "layerId": "oxide",
                    "side": "front",
                    "footprint": [[-50, -50], [0, -50], [0, 50], [-50, 50]],
                    "zMin": 0,
                    "zMax": 100,
                }
            ],
            "cuts": [],
            "masks": [WAFER],
        },
    )
    assert response.status_code == 200
    atoms = response.json()["atoms"]
    assert {atom["surface"] for atom in atoms} == {0, 100}
    assert {atom["kind"] for atom in atoms} == {"substrate", "solid"}
    assert all(atom["sourceId"] == "lower" for atom in atoms if atom["kind"] == "solid")
    assert len({atom["geometryId"] for atom in atoms}) == 2


def test_surface_partition_geometry_ids_match_across_processing_sides(client):
    payload = {
        "outline": WAFER,
        "thickness": 500,
        "solids": [
            {
                "id": "front-film",
                "layerId": "film",
                "side": "front",
                "footprint": [[-50, -50], [0, -50], [0, 50], [-50, 50]],
                "zMin": 0,
                "zMax": 2,
            }
        ],
        "cuts": [
            {
                "side": "back",
                "footprint": [[0, -50], [50, -50], [50, 50], [0, 50]],
                "zMin": -500,
                "zMax": -400,
            }
        ],
        "masks": [WAFER],
    }
    front = client.post("/api/geometry/surface-partition", json={**payload, "side": "front"})
    back = client.post("/api/geometry/surface-partition", json={**payload, "side": "back"})
    assert front.status_code == back.status_code == 200
    front_atoms = {atom["geometryId"]: atom for atom in front.json()["atoms"]}
    back_atoms = {atom["geometryId"]: atom for atom in back.json()["atoms"]}
    assert front_atoms.keys() == back_atoms.keys()
    available = {
        geometry_id: front_atoms[geometry_id]["surface"] - back_atoms[geometry_id]["surface"]
        for geometry_id in front_atoms
    }
    assert sorted(available.values()) == pytest.approx([400, 502])


def test_surface_partition_exposure_uses_physical_outermost_material_not_origin_side(client):
    backside_film = {
        "id": "back-film",
        "layerId": "back-layer",
        "side": "back",
        "footprint": WAFER,
        "zMin": -502,
        "zMax": -500,
    }
    intact = client.post(
        "/api/geometry/surface-partition",
        json={"outline": WAFER, "thickness": 500, "side": "front", "solids": [backside_film], "cuts": []},
    )
    through_etched = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "front",
            "solids": [backside_film],
            "cuts": [{"side": "front", "footprint": WAFER, "zMin": -500, "zMax": 0}],
        },
    )
    symmetric = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "back",
            "solids": [{**backside_film, "id": "front-film", "layerId": "front-layer", "side": "front", "zMin": 0, "zMax": 2}],
            "cuts": [{"side": "back", "footprint": WAFER, "zMin": -500, "zMax": 0}],
        },
    )
    assert intact.status_code == through_etched.status_code == symmetric.status_code == 200
    assert {(atom["kind"], atom["layerId"], atom["surface"]) for atom in intact.json()["atoms"]} == {("substrate", "substrate", 0)}
    assert {(atom["kind"], atom["layerId"], atom["surface"]) for atom in through_etched.json()["atoms"]} == {("solid", "back-layer", -500)}
    assert {(atom["kind"], atom["layerId"], atom["surface"]) for atom in symmetric.json()["atoms"]} == {("solid", "front-layer", 0)}


def test_surface_partition_geometry_ids_match_with_mixed_front_back_material(client):
    payload = {
        "outline": WAFER,
        "thickness": 500,
        "solids": [
            {"id": "front-film", "layerId": "front-layer", "side": "front", "footprint": [[-50, -50], [0, -50], [0, 50], [-50, 50]], "zMin": 0, "zMax": 2},
            {"id": "back-film", "layerId": "back-layer", "side": "back", "footprint": WAFER, "zMin": -502, "zMax": -500},
        ],
        "cuts": [{"side": "front", "footprint": WAFER, "zMin": -500, "zMax": 0}],
        "masks": [WAFER],
    }
    front = client.post("/api/geometry/surface-partition", json={**payload, "side": "front"}).json()["atoms"]
    back = client.post("/api/geometry/surface-partition", json={**payload, "side": "back"}).json()["atoms"]
    front_by_geometry = {atom["geometryId"]: atom for atom in front}
    back_by_geometry = {atom["geometryId"]: atom for atom in back}
    assert front_by_geometry.keys() == back_by_geometry.keys()
    assert {atom["layerId"] for atom in front} == {"front-layer", "back-layer"}
    assert {atom["layerId"] for atom in back} == {"back-layer"}


def test_surface_partition_exposes_only_uncovered_lower_film(client):
    response = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "front",
            "solids": [
                {"id": "lower", "layerId": "lower-layer", "side": "front", "footprint": WAFER, "zMin": 0, "zMax": 100},
                {"id": "upper", "layerId": "upper-layer", "side": "front", "footprint": [[0, -50], [50, -50], [50, 50], [0, 50]], "zMin": 100, "zMax": 150},
            ],
            "cuts": [],
        },
    )
    assert response.status_code == 200
    atoms = response.json()["atoms"]
    assert {atom["sourceId"] for atom in atoms} == {"lower", "upper"}
    lower_area = sum(atom["area"] for atom in atoms if atom["sourceId"] == "lower")
    upper_area = sum(atom["area"] for atom in atoms if atom["sourceId"] == "upper")
    assert lower_area == pytest.approx(5000)
    assert upper_area == pytest.approx(5000)


def test_surface_partition_uses_local_etched_substrate_surface_and_drops_void(client):
    response = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "front",
            "solids": [],
            "cuts": [
                {"side": "front", "footprint": [[-50, -50], [0, -50], [0, 50], [-50, 50]], "zMin": -100, "zMax": 0},
                {"side": "front", "footprint": [[0, -50], [50, -50], [50, 50], [0, 50]], "zMin": -500, "zMax": 0},
            ],
        },
    )
    assert response.status_code == 200
    atoms = response.json()["atoms"]
    assert len(atoms) == 1
    assert atoms[0]["kind"] == "substrate"
    assert atoms[0]["surface"] == pytest.approx(-100)
    assert atoms[0]["area"] == pytest.approx(5000)


def test_surface_partition_prunes_disjoint_and_duplicate_boundaries(client):
    regions = []
    for row in range(4):
        for column in range(5):
            x0 = -48 + column * 19
            y0 = -48 + row * 24
            regions.append([[x0, y0], [x0 + 8, y0], [x0 + 8, y0 + 8], [x0, y0 + 8]])

    solids = [
        {
            "id": f"solid-{index}",
            "layerId": "film",
            "side": "front",
            "footprint": region,
            "zMin": 0,
            "zMax": 10,
        }
        for index, region in enumerate(regions)
    ]
    cuts = [
        {"side": "front", "footprint": region, "zMin": -10, "zMax": 0}
        for region in regions
    ]
    response = client.post(
        "/api/geometry/surface-partition",
        json={
            "outline": WAFER,
            "thickness": 500,
            "side": "front",
            "solids": solids,
            "cuts": cuts,
            "masks": regions,
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert len(result["atoms"]) == len(regions)
    assert result["stats"]["input_boundaries"] == 40
    assert result["stats"]["unique_boundaries"] == 20
    assert result["stats"]["duplicate_boundaries"] == 20
    assert result["stats"]["boundary_groups"] == 1
    assert result["stats"]["boolean_splits"] == 1
    assert result["stats"]["bbox_skips"] == 0


def test_exact_substrate_thickness_with_overlapping_cuts(client):
    response = client.post(
        "/api/geometry/substrate-thickness",
        json={
            "outline": WAFER,
            "thickness": 500,
            "cuts": [
                {"footprint": [[-30, -50], [10, -50], [10, 50], [-30, 50]], "zMin": -50, "zMax": 0},
                {"footprint": [[-10, -50], [30, -50], [30, 50], [-10, 50]], "zMin": -100, "zMax": -50},
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["exact"] is True
    assert result["min"] == pytest.approx(400)
    assert result["max"] == pytest.approx(500)
    assert result["atoms"] == 5


def test_substrate_thickness_groups_disconnected_equal_depth_cuts(client):
    regions = []
    for row in range(4):
        for column in range(5):
            x0 = -48 + column * 19
            y0 = -48 + row * 24
            regions.append([[x0, y0], [x0 + 8, y0], [x0 + 8, y0 + 8], [x0, y0 + 8]])
    response = client.post(
        "/api/geometry/substrate-thickness",
        json={
            "outline": WAFER,
            "thickness": 500,
            "cuts": [
                {"footprint": region, "zMin": -10, "zMax": 0}
                for region in regions
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["exact"] is True
    assert result["min"] == pytest.approx(490)
    assert result["max"] == pytest.approx(500)
    assert result["atoms"] == 21
    assert result["stats"]["input_cuts"] == 20
    assert result["stats"]["interval_groups"] == 1
    assert result["stats"]["coverage_states"] == 2
    assert result["stats"]["boolean_splits"] == 1


def test_substrate_thickness_reports_approximation_at_atom_cap(client, monkeypatch):
    monkeypatch.setattr(app_module, "SUBSTRATE_ATOM_LIMIT", 1)
    response = client.post(
        "/api/geometry/substrate-thickness",
        json={
            "outline": WAFER,
            "thickness": 500,
            "cuts": [
                {"footprint": [[-10, -50], [10, -50], [10, 50], [-10, 50]], "zMin": -100, "zMax": 0}
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["exact"] is False
    assert result["atom_limit"] == 1


@pytest.mark.parametrize("fixture_index,extension", [(0, "gds"), (1, "oas")])
def test_layout_inspection_preserves_layers_and_hierarchy(
    client, layout_fixtures: tuple[Path, Path], fixture_index: int, extension: str
):
    path = layout_fixtures[fixture_index]
    with path.open("rb") as stream:
        response = client.post(
            "/api/gds/inspect",
            files={"file": (path.name, stream, "application/octet-stream")},
            data={"top_cell": "TOP"},
        )
    assert response.status_code == 200
    result = response.json()
    assert result["filename"].endswith(extension)
    assert result["active_top_cell"] == "TOP"
    assert {(layer["layer"], layer["datatype"]) for layer in result["layers"]} == {(1, 0), (10, 5)}
    assert all(layer["component_count"] == 1 for layer in result["layers"])
    assert all(layer["components"][0]["id"].startswith("component-") for layer in result["layers"])
    hierarchy = {cell["name"]: cell for cell in result["hierarchy"]}
    assert set(hierarchy) == {"BASE", "TOP"}
    assert hierarchy["TOP"]["references"][0]["cell"] == "BASE"
