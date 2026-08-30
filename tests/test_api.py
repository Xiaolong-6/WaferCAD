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

    three = client.get("/vendor/three/build/three.module.js")
    assert three.status_code == 200
    assert len(three.content) > 500_000


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
