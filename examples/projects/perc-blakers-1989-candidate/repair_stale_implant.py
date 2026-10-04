#!/usr/bin/env python3
"""Repair the PERC candidate's stale C09 light-P implant host annotation.

Staging-only data repair. Material geometry, process history, exploratory
branches, and masks remain unchanged.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

EXPECTED_SOURCE_SHA256 = "e56e10e938e940558f189cf650eb3886d3fa393563327c0df5ab2ac4d7018773"
EXPECTED_FIXED_SHA256 = "8ee1d4c9bb99dd3b234dd0d4737546117774c5e85697a0e4d98cd28637723ef1"
LIGHT_P_PREFIX = "C09 - Light phosphorus surface diffusion"
TEMP_OXIDE_LAYER_ID = "layer-2"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def strip_stale_patch(model: dict) -> int:
    removed_polygons = 0
    for implant in model.get("implants", []):
        if implant.get("id") != "implant-2" and not implant.get("name", "").startswith(LIGHT_P_PREFIX):
            continue
        kept = []
        for patch in implant.get("patches", []):
            if patch.get("layerId") == TEMP_OXIDE_LAYER_ID:
                removed_polygons += len(patch.get("geom") or [])
            else:
                kept.append(patch)
        implant["patches"] = kept
    return removed_polygons


def repair(project: dict) -> tuple[dict, list[dict]]:
    fixed = copy.deepcopy(project)
    active = fixed["snapshotBranches"]["activeBranchId"]
    refs = set()

    for node in fixed["snapshotBranches"]["nodes"]:
        if node.get("branchId") != active or node.get("processRevision", 0) < 9:
            continue
        ref = node.get("state", {}).get("modelRef")
        if isinstance(ref, int):
            refs.add(ref)

    changes = []
    for ref in sorted(refs):
        removed = strip_stale_patch(fixed["sharedModels"][ref])
        if removed:
            changes.append({"modelRef": ref, "removedPolygons": removed})

    removed = strip_stale_patch(fixed["model"])
    if removed:
        changes.append({"modelRef": "project", "removedPolygons": removed})

    for ref in sorted(refs):
        model = fixed["sharedModels"][ref]
        matches = [
            implant for implant in model.get("implants", [])
            if implant.get("id") == "implant-2" or implant.get("name", "").startswith(LIGHT_P_PREFIX)
        ]
        if not matches:
            raise RuntimeError(f"missing C09 light-P Implant in modelRef {ref}")
        for implant in matches:
            if not implant.get("patches"):
                raise RuntimeError(f"C09 light-P Implant has no surviving patches in modelRef {ref}")
            if any(patch.get("layerId") != "base" for patch in implant["patches"]):
                raise RuntimeError(f"C09 light-P Implant still has a non-base host in modelRef {ref}")

    return fixed, changes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    raw = args.source.read_bytes()
    source_sha = sha256_bytes(raw)
    if source_sha != EXPECTED_SOURCE_SHA256:
        raise SystemExit(
            f"Refusing unexpected source project: sha256={source_sha}, expected={EXPECTED_SOURCE_SHA256}"
        )

    project = json.loads(raw.decode("utf-8"))
    if project.get("version") != 14:
        raise SystemExit(f"Expected WaferCAD schema v14, got {project.get('version')!r}")

    fixed, changes = repair(project)
    payload = json.dumps(fixed, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    fixed_sha = sha256_bytes(payload)
    if fixed_sha != EXPECTED_FIXED_SHA256:
        raise SystemExit(
            f"Repair output drifted: sha256={fixed_sha}, expected={EXPECTED_FIXED_SHA256}"
        )

    args.output.write_bytes(payload)
    print(json.dumps({"sourceSha256": source_sha, "fixedSha256": fixed_sha, "changes": changes}, indent=2))


if __name__ == "__main__":
    main()
