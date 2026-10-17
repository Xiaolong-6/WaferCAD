#!/usr/bin/env python3
"""Build a portable, immutable WaferCAD source snapshot for ChatGPT offline rendering.

Includes source assets and only the pinned packages required to execute offline
renderers. It intentionally does not call any CI or network service.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

SCRIPT_NAMES = (
    'offline-visual-kernel.mjs', 'offline-visual-svg.mjs', 'offline-mask-svg.mjs',
    'offline-three-capture.mjs', 'offline-three-mesh.mjs',
    'offline-three-vtk.py', 'offline-ui-capture.mjs', 'process-benchmarks.mjs',
    'offline-package.py', 'offline-source-revision.mjs',
    'offline-native-app-capture.py', 'offline-native-app-capture.test.py',
    'offline-chat-native-export.mjs', 'offline-chat-raster.py',
    'offline-chat-vtk.py', 'offline-chat-ui.py', 'offline-chat-acceptance.py',
    'offline-chat-acceptance.test.py',
)
OPTIONAL_TOP = ('AGENTS.md', 'package.json', 'package-lock.json',
                'THIRD_PARTY_NOTICES.md', 'docs/OFFLINE_VISUAL_KERNEL.md', 'docs/OFFLINE_CHAT_RUNTIME.md')
MODULE_DIRS = ('three', 'playwright', 'playwright-core')
ZIP_EPOCH = (1980, 1, 1, 0, 0, 0)
MAX_FILES = 25000
MAX_BYTES = 384 * 1024 * 1024


def git_revision(root: Path):
    try:
        commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'],
                                capture_output=True, text=True, check=True, timeout=8).stdout.strip()
        status = subprocess.run(['git', '-C', str(root), 'status', '--porcelain'],
                                capture_output=True, text=True, check=True, timeout=8).stdout.strip()
        return commit, bool(status)
    except (OSError, subprocess.SubprocessError):
        return 'unavailable', True


def collect(root: Path, include_deps: bool):
    roots = [root / 'site']
    if include_deps:
        roots.extend(root / 'node_modules' / name for name in MODULE_DIRS)
    entries = {}
    for directory in roots:
        if not directory.is_dir():
            raise ValueError(f'Missing source/dependency directory: {directory}')
        for path in directory.rglob('*'):
            if path.is_symlink():
                raise ValueError(f'Symlink is unsupported in portable bundle: {path}')
            if not path.is_file():
                continue
            relative = path.relative_to(root).as_posix()
            if '/.git/' in f'/{relative}/' or '__pycache__' in path.parts:
                continue
            entries[relative] = path
    for name in SCRIPT_NAMES:
        path = root / 'scripts' / name
        if not path.is_file():
            raise ValueError(f'Missing required offline renderer: {path}')
        entries[f'scripts/{name}'] = path
    for name in OPTIONAL_TOP:
        path = root / name
        if path.is_file():
            entries[name] = path
    if len(entries) > MAX_FILES:
        raise ValueError(f'File count exceeds {MAX_FILES}')
    if sum(p.stat().st_size for p in entries.values()) > MAX_BYTES:
        raise ValueError(f'Uncompressed package exceeds {MAX_BYTES} bytes')
    return dict(sorted(entries.items()))


def build(root: Path, output: Path, include_deps: bool):
    root = root.resolve()
    output = output.resolve()
    if output.is_symlink():
        raise ValueError('Refusing symlink output target')
    if output == root or output.is_relative_to(root / 'site') or output.is_relative_to(root / 'node_modules'):
        raise ValueError('Package output must not be inside site/ or node_modules/')
    entries = collect(root, include_deps)
    revision, dirty = git_revision(root)
    manifest = {'schema': 'wafercad-offline-bundle-v1', 'revision': revision,
                'dirtyAtPackaging': dirty, 'dependenciesIncluded': include_deps,
                'files': {name: hashlib.sha256(path.read_bytes()).hexdigest()
                          for name, path in entries.items()}}
    payload = (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + '.tmp')
    try:
        with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED,
                             compresslevel=6, allowZip64=True) as archive:
            for name, path in entries.items():
                info = zipfile.ZipInfo(name, ZIP_EPOCH)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                # Streaming copy rather than putting the entire source tree in memory.
                with path.open('rb') as src, archive.open(info, 'w', force_zip64=True) as dst:
                    while chunk := src.read(1024 * 1024):
                        dst.write(chunk)
            info = zipfile.ZipInfo('offline-source-manifest.json', ZIP_EPOCH)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, payload)
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)
    return {'output': str(output), 'files': len(entries), 'sha256':
            hashlib.sha256(output.read_bytes()).hexdigest(), 'revision': revision,
            'dirty': dirty, 'deps': include_deps}


def verify(archive_path: Path):
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) > MAX_FILES + 1 or len(names) != len(set(names)):
            raise ValueError('Invalid file count or duplicate archive members')
        if any(name.startswith('/') or '..' in Path(name).parts or '\\' in name for name in names):
            raise ValueError('Unsafe path in archive')
        if 'offline-source-manifest.json' not in names:
            raise ValueError('Missing source manifest')
        manifest = json.loads(archive.read('offline-source-manifest.json'))
        if manifest.get('schema') != 'wafercad-offline-bundle-v1':
            raise ValueError('Unsupported source manifest')
        expected = manifest.get('files')
        if not isinstance(expected, dict) or set(expected) != set(names) - {'offline-source-manifest.json'}:
            raise ValueError('Manifest and ZIP file list disagree')
        if sum(archive.getinfo(name).file_size for name in names) > MAX_BYTES + 5 * 1024 * 1024:
            raise ValueError('Archive exceeds extraction budget')
        for name, sha in expected.items():
            with archive.open(name) as source:
                digest = hashlib.sha256()
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != sha:
                raise ValueError(f'Hash mismatch in {name}')
    return {'verified': True, 'files': len(expected), 'revision': manifest['revision'],
            'dirtyAtPackaging': manifest['dirtyAtPackaging']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    p.add_argument('--output', type=Path, help='Destination ZIP for a new package')
    p.add_argument('--verify', type=Path, help='Verify a previously created package')
    p.add_argument('--without-deps', action='store_true', help='Only for environments with installed packages')
    args = p.parse_args()
    if args.verify:
        print(json.dumps(verify(args.verify), indent=2))
        return
    if args.output is None:
        p.error('--output is required unless --verify is supplied')
    print(json.dumps(build(args.root, args.output, not args.without_deps), indent=2))


if __name__ == '__main__':
    main()