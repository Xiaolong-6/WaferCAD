#!/usr/bin/env python3
"""Restore pinned Three.js from the repository's verified offline npm archive."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
FALLBACK_ARCHIVE = ROOT / "vendor" / "npm" / "three-0.179.1.tgz"
LOCK = ROOT / "package-lock.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Pinned Three.js .tgz from Project Sources")
    args = parser.parse_args()
    archive = args.archive or (Path(os.environ["WAFERCAD_THREE_ARCHIVE"])
                               if os.environ.get("WAFERCAD_THREE_ARCHIVE")
                               else FALLBACK_ARCHIVE)
    if not archive.is_file():
        raise FileNotFoundError(f"Three.js archive not found: {archive}")
    entry = json.loads(LOCK.read_text(encoding="utf-8"))["packages"]["node_modules/three"]
    version = entry["version"]
    integrity = entry["integrity"]
    if version != "0.179.1" or not integrity.startswith("sha512-"):
        raise ValueError("Three.js version or integrity does not match the supported pin")
    actual = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode("ascii")
    if actual != integrity.removeprefix("sha512-"):
        raise ValueError("Offline Three.js tarball failed package-lock SHA-512 verification")

    destination = ROOT / "node_modules" / "three"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".three-staging-", dir=destination.parent) as temp:
        unpack = Path(temp)
        total_bytes = 0
        with tarfile.open(archive, mode="r:gz") as package:
            for member in package:
                parts = PurePosixPath(member.name).parts
                if not parts or parts[0] != "package" or ".." in parts:
                    raise ValueError(f"Unexpected npm archive path: {member.name}")
                if not (member.isdir() or member.isfile()):
                    raise ValueError(f"Unsafe npm archive entry: {member.name}")
                if len(parts) == 1:
                    continue
                target = unpack.joinpath(*parts[1:])
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    total_bytes += member.size
                    if total_bytes > 150 * 1024 * 1024:
                        raise ValueError("Three.js archive exceeds the extraction size limit")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.extractfile(member) as source, target.open("wb") as out:
                        shutil.copyfileobj(source, out)
        metadata = json.loads((unpack / "package.json").read_text(encoding="utf-8"))
        if metadata["version"] != version:
            raise ValueError("Extracted Three.js version mismatch")
        for required in ("build/three.module.js", "examples/jsm/controls/OrbitControls.js"):
            if not (unpack / required).is_file():
                raise ValueError(f"Incomplete Three.js package: {required}")
        if destination.exists():
            shutil.rmtree(destination)
        unpack.rename(destination)
    print(f"Restored verified three@{version} -> {destination}")


if __name__ == "__main__":
    main()
